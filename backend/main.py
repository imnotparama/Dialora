import os
import uuid
import json
import csv
from io import StringIO
from typing import Optional, List
import requests
import asyncio
import threading
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Form, File, UploadFile, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from sqlalchemy.orm.exc import NoResultFound

from twilio.twiml.voice_response import VoiceResponse, Gather

from database import engine, Base, get_db
from models import Campaign, Contact, CallLog
import local_ai
import local_audio
import twilio_calls
import emotion_classifier  # NEW: HuggingFace emotion classifier

connected_websockets = set()
twilio_sessions = {}

async def broadcast_ws(data: dict):
    global connected_websockets
    dead = set()
    for ws in connected_websockets:
        try:
            await ws.send_json(data)
        except:
            dead.add(ws)
    connected_websockets -= dead

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Dialora Local API")

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
def startup_event():
    print("="*50)
    print("DIALORA BACKEND STARTED")
    print(f"Ollama: checking...")
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = [m['name'] for m in r.json().get('models',[])]
        print(f"Ollama: ONLINE — Models: {models}")
        # Pre-warm: load model into RAM so first real request is instant
        threading.Thread(target=_prewarm_ollama, daemon=True).start()
    except:
        print("Ollama: OFFLINE — run 'ollama serve'")
    print(f"Twilio: {'CONFIGURED' if os.getenv('TWILIO_ACCOUNT_SID') else 'NOT SET'}")
    print(f"ngrok: {os.getenv('NGROK_URL','NOT SET')}")
    # NEW: Preload HuggingFace emotion classifier in background thread
    threading.Thread(target=emotion_classifier.preload, daemon=True).start()
    print("="*50)


def _prewarm_ollama():
    """Sends a tiny request so Llama is loaded into RAM before the first demo."""
    try:
        requests.post(
            "http://localhost:11434/api/chat",
            json={"model": "llama3.2", "messages": [{"role": "user", "content": "hi"}],
                  "stream": False, "num_predict": 1},
            timeout=60
        )
        print("[Dialora] ✓ Ollama pre-warm complete — model is hot and ready.")
    except Exception as e:
        print(f"[Dialora] Pre-warm skipped: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sim_contexts = {}

@app.get("/api/health/ollama")
def check_ollama():
    twilio_configured = bool(os.getenv("TWILIO_ACCOUNT_SID"))
    ngrok_url = os.getenv("NGROK_URL", "")

    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = response.json().get("models", [])
        model_names = [m["name"] for m in models]
        return {
            "status": "online",
            "models": model_names,
            "twilio_configured": twilio_configured,
            "ngrok_url": ngrok_url,
            "emotion_classifier_loaded": emotion_classifier.is_loaded()  # NEW
        }
    except:
        return {
            "status": "offline",
            "models": [],
            "twilio_configured": twilio_configured,
            "ngrok_url": ngrok_url,
            "emotion_classifier_loaded": emotion_classifier.is_loaded()  # NEW
        }

class CampaignCreate(BaseModel):
    name: str
    business_context: Optional[str] = None
    script: Optional[str] = None
    knowledge_base: Optional[str] = None

class SimulateEndRequest(BaseModel):
    campaign_id: Optional[int] = None
    transcript: List[dict]
    final_intent: str

@app.post("/api/campaigns")
def create_campaign(data: CampaignCreate, db: Session = Depends(get_db)):
    campaign = Campaign(
        name=data.name,
        business_context=data.business_context,
        script=data.script,
        knowledge_base=data.knowledge_base,
        status="active"
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {"id": campaign.id, "name": campaign.name, "status": "created"}

@app.post("/api/campaigns/{id}/contacts/upload")
async def upload_contacts(id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    content = await file.read()
    csv_str = content.decode("utf-8")
    reader = csv.DictReader(StringIO(csv_str))
    
    uploaded = 0
    contacts_to_add = []
    for row in reader:
        name = row.get("name", "").strip()
        phone = row.get("phone_number", "").strip()
        if name and phone:
            contacts_to_add.append(Contact(
                campaign_id=id,
                name=name,
                phone_number=phone,
                status="pending"
            ))
            uploaded += 1
            
    if contacts_to_add:
        db.add_all(contacts_to_add)
        db.commit()
        
    return {"uploaded": uploaded}

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_calls = db.query(func.count(CallLog.id)).scalar() or 0
    # SQLite ilike or just like for case insensitive matching. Using like for safety, but ilike is supported since 3.10
    interested_calls = db.query(func.count(CallLog.id)).filter(CallLog.intent_tag.like('%Interested%')).scalar() or 0
    
    conversion_rate = 0.0
    if total_calls > 0:
        conversion_rate = round((interested_calls / total_calls) * 100, 1)
        
    active_campaigns = db.query(func.count(Campaign.id)).scalar() or 0
    
    recent = db.query(Campaign).order_by(Campaign.id.desc()).limit(5).all()
    recent_list = []
    for c in recent:
        count = db.query(func.count(Contact.id)).filter(Contact.campaign_id == c.id).scalar()
        recent_list.append({
            "id": c.id,
            "name": c.name,
            "contacts_count": count
        })
        
    return {
        "total_calls": total_calls,
        "conversion_rate": conversion_rate,
        "active_campaigns": active_campaigns,
        "recent_campaigns": recent_list
    }

@app.get("/api/calllogs")
def get_call_logs(db: Session = Depends(get_db)):
    logs = db.query(CallLog, Campaign).join(Campaign, CallLog.campaign_id == Campaign.id, isouter=True).order_by(CallLog.id.desc()).all()
    res = []
    for log, campaign in logs:
        campaign_name = campaign.name if campaign else "Simulated"
        
        parsed_transcript = []
        if log.transcript:
            try:
                parsed_transcript = json.loads(log.transcript)
            except:
                pass
                
        res.append({
            "id": log.id,
            "campaign_name": campaign_name,
            "intent_tag": log.intent_tag,
            "lead_score": log.lead_score,
            "summary": log.summary,
            "transcript": parsed_transcript,
            "created_at": log.created_at.isoformat() if log.created_at else None
        })
    return res

@app.get("/api/activity")
def get_activity(db: Session = Depends(get_db)):
    events = []
    
    logs = db.query(CallLog, Campaign).join(Campaign, CallLog.campaign_id == Campaign.id, isouter=True).order_by(CallLog.id.desc()).limit(10).all()
    for log, camp in logs:
        cname = camp.name if camp else "Simulated"
        events.append({
            "message": f"📞 Call simulated — Campaign: {cname}",
            "sub_message": f"Lead scored {log.lead_score}/10 — {log.intent_tag if log.intent_tag else 'Unknown'}",
            "timestamp": log.created_at,
            "type": "call"
        })
        
    recent_camps = db.query(Campaign).order_by(Campaign.id.desc()).limit(5).all()
    for camp in recent_camps:
        count = db.query(func.count(Contact.id)).filter(Contact.campaign_id == camp.id).scalar()
        if count and count > 0:
            events.append({
                "message": f"📁 {count} contacts uploaded",
                "sub_message": f"Added to: {camp.name}",
                "timestamp": camp.created_at,
                "type": "upload"
            })
            
    events.sort(key=lambda x: str(x['timestamp'] or ''), reverse=True)
    
    for ev in events:
        if ev['timestamp']:
            ev['timestamp'] = ev['timestamp'].isoformat()
            
    return events[:10]

@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db)):
    logs = db.query(CallLog, Campaign).join(Campaign, CallLog.campaign_id == Campaign.id, isouter=True).order_by(CallLog.id.desc()).all()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["call_id", "campaign_name", "intent_tag", "lead_score", "summary", "created_at"])
    
    for log, campaign in logs:
        campaign_name = campaign.name if campaign else "Simulated"
        created_str = log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else ""
        writer.writerow([log.id, campaign_name, log.intent_tag, log.lead_score, log.summary, created_str])
        
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=dialora_report.csv"}
    )

@app.post("/api/simulate/end")
def end_simulate(data: SimulateEndRequest, db: Session = Depends(get_db)):
    score_result = local_ai.score_call(data.transcript)
    
    log = CallLog(
        campaign_id=data.campaign_id,
        contact_id=None,
        transcript=json.dumps(data.transcript),
        intent_tag=score_result.get("final_intent", data.final_intent),
        lead_score=score_result.get("lead_score", 0),
        summary=score_result.get("summary", "")
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "status": "saved", 
        "log_id": log.id,
        "lead_score": log.lead_score,
        "summary": log.summary,
        "intent_tag": log.intent_tag
    }

@app.post("/demo/seed")
def seed_demo(db: Session = Depends(get_db)):
    campaign = Campaign(name="Local Demo Campaign", business_context="We provide fast local AI solutions.")
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {"status": "Seeded locally!", "campaign_id": campaign.id}

@app.get("/api/campaigns")
def api_get_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).all()
    res = []
    for c in campaigns:
        res.append({
            "id": c.id,
            "name": c.name,
            "business_context": c.business_context,
            "script": c.script,
            "knowledge_base": c.knowledge_base
        })
    return res

@app.get("/campaigns")
def get_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).order_by(Campaign.id.desc()).all()
    res = []
    for c in campaigns:
        contacts = db.query(Contact).filter_by(campaign_id=c.id).count()
        res.append({
            "id": c.id,
            "name": c.name,
            "business_context": c.business_context,
            "contacts_count": contacts
        })
    return res

@app.post("/api/simulate/start")
def start_sim(session_id: str = Form(...)):
    sim_contexts[session_id] = []
    return {"status": "started"}


@app.post("/api/simulate/greeting")
async def simulate_greeting(
    session_id: str = Form(...),
    campaign_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """SSE endpoint — generates Nandita's context-aware opening line to auto-start the call."""
    if session_id not in sim_contexts:
        sim_contexts[session_id] = []

    camp_ctx = camp_script = camp_kb = None
    campaign_name = "this service"
    if campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            camp_ctx = campaign.business_context
            camp_script = campaign.script
            camp_kb = campaign.knowledge_base
            campaign_name = campaign.name

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def run_greeting():
        try:
            # Inject a hidden trigger that makes Nandita open the conversation
            trigger = f"[CALL_STARTED] Generate your natural, warm opening line for this sales call. Introduce yourself as Nandita and briefly mention why you're calling. One or two sentences only."
            for chunk in local_ai.get_ai_response_streaming(
                prompt=trigger,
                context=[],
                business_context=camp_ctx,
                script=camp_script,
                knowledge_base=camp_kb
            ):
                if chunk["type"] == "sentence":
                    audio_file = local_audio.generate_tts(chunk["text"], emotion="NEUTRAL")  # CHANGED: greeting has no caller emotion yet
                    chunk["audio_url"] = f"http://localhost:8000/static/{audio_file}" if audio_file else ""
                loop.call_soon_threadsafe(queue.put_nowait, chunk)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "error": str(e)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=run_greeting, daemon=True).start()

    async def greeting_generator():
        full_text = ""
        try:
            while True:
                chunk = await asyncio.wait_for(queue.get(), timeout=30.0)
                if chunk is None:
                    break
                if chunk["type"] == "sentence":
                    full_text += chunk["text"] + " "
                    yield f"data: {json.dumps({'type': 'sentence', 'text': chunk['text'], 'audio_url': chunk.get('audio_url', '')})}\n\n"
                elif chunk["type"] == "intent":
                    # Store greeting in context so the AI remembers it said it
                    sim_contexts[session_id].append({"role": "assistant", "content": full_text.strip()})
                    yield f"data: {json.dumps({'type': 'done', 'full_reply': full_text.strip()})}\n\n"
                elif chunk["type"] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': chunk.get('error', 'Unknown error')})}\n\n"
                    break
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Greeting timed out'})}\n\n"

    return StreamingResponse(
        greeting_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
    )

@app.post("/api/simulate/turn")
async def simulate_turn(
    session_id: str = Form(...),
    user_text: str = Form(...),
    campaign_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    if not user_text:
        return {"error": "Could not receive text."}
        
    if session_id not in sim_contexts:
        sim_contexts[session_id] = []
        
    context = sim_contexts[session_id]
    
    camp_ctx = None
    camp_script = None
    camp_kb = None
    if campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            camp_ctx = campaign.business_context
            camp_script = campaign.script
            camp_kb = campaign.knowledge_base
            
    ai_res = local_ai.generate_ai_response(
        prompt=user_text, 
        context=context,
        business_context=camp_ctx,
        script=camp_script,
        knowledge_base=camp_kb
    )
    
    if ai_res.get("error") == "OLLAMA_OFFLINE":
        raise HTTPException(
            status_code=503,
            detail={
                "error": "OLLAMA_OFFLINE",
                "message": "Ollama is not running. Please start it with: ollama serve"
            }
        )
    elif ai_res.get("error") == "OLLAMA_TIMEOUT":
        raise HTTPException(
            status_code=504,
            detail={
                "error": "OLLAMA_TIMEOUT", 
                "message": "Ollama took too long to respond. The model may still be loading."
            }
        )
    elif ai_res.get("error"):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "AI_ERROR",
                "message": "AI encountered an error. Check backend logs."
            }
        )
    
    context.append({"role": "user", "content": user_text})
    context.append({"role": "assistant", "content": ai_res['reply']})
    
    audio_path = local_audio.generate_tts(ai_res['reply'], emotion=ai_res.get('emotion', 'NEUTRAL'))  # CHANGED: pass detected emotion
    
    return {
        "user_text": user_text,
        "reply": ai_res['reply'],
        "intent": ai_res['intent'],
        "audio_url": f"http://localhost:8000/static/{os.path.basename(audio_path)}" if audio_path else ""
    }


@app.post("/api/simulate/turn/stream")
async def simulate_turn_stream(
    session_id: str = Form(...),
    user_text: str = Form(...),
    campaign_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """SSE endpoint — streams Nandita's response sentence-by-sentence with TTS audio."""
    if not user_text:
        return {"error": "No text provided"}

    if session_id not in sim_contexts:
        sim_contexts[session_id] = []
    context = sim_contexts[session_id]

    camp_ctx = camp_script = camp_kb = None
    if campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if campaign:
            camp_ctx = campaign.business_context
            camp_script = campaign.script
            camp_kb = campaign.knowledge_base

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    # NEW: Classify caller emotion from user text (used for emotion-aware TTS)
    detected_emotion = emotion_classifier.classify_emotion(user_text)

    def run_streaming():
        try:
            for chunk in local_ai.get_ai_response_streaming(
                prompt=user_text,
                context=list(context),  # snapshot to avoid race conditions
                business_context=camp_ctx,
                script=camp_script,
                knowledge_base=camp_kb
            ):
                if chunk["type"] == "sentence":
                    audio_file = local_audio.generate_tts(chunk["text"], emotion=detected_emotion)  # CHANGED: pass caller emotion
                    chunk["audio_url"] = f"http://localhost:8000/static/{audio_file}" if audio_file else ""
                loop.call_soon_threadsafe(queue.put_nowait, chunk)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "error": str(e)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

    threading.Thread(target=run_streaming, daemon=True).start()

    async def event_generator():
        full_reply = ""
        try:
            while True:
                chunk = await asyncio.wait_for(queue.get(), timeout=45.0)
                if chunk is None:
                    break

                if chunk["type"] == "sentence":
                    full_reply += chunk["text"] + " "
                    yield f"data: {json.dumps({'type': 'sentence', 'text': chunk['text'], 'audio_url': chunk.get('audio_url', '')})}\n\n"

                elif chunk["type"] == "intent":
                    # Apply keyword grounding on top of LLM classification
                    keyword_intent = local_ai._classify_intent_from_user(user_text)
                    final_intent = keyword_intent if keyword_intent else chunk["intent"]
                    final_emotion = chunk.get("emotion", "NEUTRAL")

                    # Persist turn to session context
                    context.append({"role": "user", "content": user_text})
                    context.append({"role": "assistant", "content": full_reply.strip()})

                    yield f"data: {json.dumps({'type': 'done', 'intent': final_intent, 'emotion': final_emotion, 'full_reply': full_reply.strip()})}\n\n"

                elif chunk["type"] == "error":
                    err = chunk["error"]
                    if "OLLAMA_OFFLINE" in err:
                        detail = {"error": "OLLAMA_OFFLINE", "message": "Ollama is not running. Please start it with: ollama serve"}
                    elif "OLLAMA_TIMEOUT" in err:
                        detail = {"error": "OLLAMA_TIMEOUT", "message": "Ollama timed out. The model may still be loading."}
                    else:
                        detail = {"error": "AI_ERROR", "message": "AI encountered an error. Check backend logs."}
                    yield f"data: {json.dumps({'type': 'error', **detail})}\n\n"
                    break

        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'error': 'TIMEOUT', 'message': 'AI response timed out after 45 seconds.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )

@app.websocket("/ws/calls")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_websockets.discard(websocket)
    except:
        connected_websockets.discard(websocket)

@app.post("/twilio/voice")
async def twilio_voice(request: Request, campaign_id: str = "", db: Session = Depends(get_db)):
    try:
        if campaign_id:
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            context = campaign.business_context if campaign else "AI tele-calling agent"
        else:
            context = "AI tele-calling agent"
            campaign = None
            
        form = await request.form()
        call_sid = form.get("CallSid", "unknown")
        
        # Resolve campaign KB so the AI has full context on the live call
        camp_ctx = campaign.business_context if campaign_id and campaign else context
        camp_script = campaign.script if campaign_id and campaign else None
        camp_kb = campaign.knowledge_base if campaign_id and campaign else None

        twilio_sessions[call_sid] = {
            "messages": [],
            "campaign_id": campaign_id,
            "context": camp_ctx,
            "script": camp_script,
            "knowledge_base": camp_kb
        }
        
        greeting = f"Hello! My name is Nandita, and I'm calling on behalf of Dialora. {context}. Is this a good time to talk?"
        
        await broadcast_ws({
            "type": "call_started",
            "call_sid": call_sid,
            "campaign_id": campaign_id,
            "campaign_name": campaign.name if campaign_id and campaign else "Demo Mode"
        })
        
        response = VoiceResponse()
        ngrok_url = os.getenv("NGROK_URL", "http://localhost:8000")
        
        # Female Indian English voice for Nandita
        response.say(greeting, voice="Polly.Aditi")
        
        gather = Gather(
            input="speech",
            action=f"{ngrok_url}/twilio/gather?call_sid={call_sid}",
            speech_timeout=1,
            language="en-IN"
        )
        response.append(gather)
        return Response(content=str(response), media_type="application/xml")
    except Exception as e:
        import traceback
        return Response(content=traceback.format_exc(), status_code=500)

@app.post("/twilio/gather")
async def twilio_gather(request: Request, call_sid: str = ""):
    try:
        form = await request.form()
        user_text = form.get("SpeechResult", "")
        
        if not user_text or call_sid not in twilio_sessions:
            response = VoiceResponse()
            ngrok_url = os.getenv("NGROK_URL", "http://localhost:8000")
            response.say("Sorry, I didn't catch that. Could you say that again?", voice="Polly.Aditi")
            gather = Gather(input="speech", action=f"{ngrok_url}/twilio/gather?call_sid={call_sid}", speech_timeout=1, language="en-IN")
            response.append(gather)
            return Response(content=str(response), media_type="application/xml")
        
        session = twilio_sessions[call_sid]
        
        await broadcast_ws({
            "type": "user_spoke",
            "call_sid": call_sid,
            "text": user_text
        })
        
        session["messages"].append({"role": "user", "content": user_text})
        
        # Call the LLM with correct keyword args
        result = local_ai.generate_ai_response(
            prompt=user_text,
            context=session["messages"][:-1],  # exclude the just-appended user message
            business_context=session.get("context"),
            script=session.get("script"),
            knowledge_base=session.get("knowledge_base")
        )
        reply = result.get("reply") or "Let me think about that for a moment. Could you tell me more?"
        intent = result.get("intent", "Neutral")
        emotion = result.get("emotion", "NEUTRAL")
        
        session["messages"].append({"role": "assistant", "content": reply})
        
        await broadcast_ws({
            "type": "ai_replied",
            "call_sid": call_sid,
            "text": reply,
            "intent": intent,
            "emotion": emotion
        })
        
        response = VoiceResponse()
        ngrok_url = os.getenv("NGROK_URL", "http://localhost:8000")
        
        response.say(reply, voice="Polly.Aditi")
        
        if "[END_CALL]" in reply or len(session["messages"]) > 20:
            response.hangup()
            await broadcast_ws({"type": "call_ended", "call_sid": call_sid, "status": "completed"})
            twilio_sessions.pop(call_sid, None)
            return Response(content=str(response), media_type="application/xml")
        
        gather = Gather(
            input="speech",
            action=f"{ngrok_url}/twilio/gather?call_sid={call_sid}",
            speech_timeout=1,
            language="en-IN"
        )
        response.append(gather)
        return Response(content=str(response), media_type="application/xml")

    except Exception as e:
        print(f"[ERROR] twilio_gather crashed: {e}")
        fallback = VoiceResponse()
        fallback.say("Sorry, something went wrong on our end. Please hold.", voice="Polly.Aditi")
        fallback.hangup()
        return Response(content=str(fallback), media_type="application/xml")

@app.post("/twilio/status")
async def twilio_status(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid")
    status = form.get("CallStatus")
    
    if status in ["completed", "failed", "busy", "no-answer"]:
        await broadcast_ws({
            "type": "call_ended",
            "call_sid": call_sid,
            "status": status
        })
        twilio_sessions.pop(call_sid, None)
    
    return {"status": "ok"}

@app.post("/api/demo/call")
async def trigger_demo_call(data: dict):
    campaign_id = data.get("campaign_id", "")
    result = twilio_calls.make_demo_call(campaign_id)
    if result == "twilio_not_configured":
        raise HTTPException(status_code=400, detail="Twilio is not configured. Add credentials to backend/.env")
    if result == "missing_config":
        raise HTTPException(status_code=400, detail="DEMO_PHONE_NUMBER or NGROK_URL missing from .env")
    if str(result).startswith("error:"):
        raise HTTPException(status_code=500, detail=f"Twilio error: {result[6:]}")
    return {"call_sid": result, "status": "dialing"}
