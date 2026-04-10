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

from fastapi import FastAPI, Form, File, UploadFile, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, BackgroundTasks
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
inbound_call_sessions = {}

def get_local_ip():
    try:
        import socket as _socket
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return 'localhost'

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


@app.post("/api/call/start")
def start_inbound_call(data: dict, db: Session = Depends(get_db)):
    try:
        session_id = str(uuid.uuid4())[:8]
        campaign_id = data.get("campaign_id")

        campaign = None
        campaign_name = "Generic Demo"
        context = ""
        script = ""
        knowledge_base = ""

        if campaign_id and campaign_id != "null" and campaign_id != "":
            try:
                campaign = db.query(Campaign).filter(
                    Campaign.id == int(campaign_id)
                ).first()
                if campaign:
                    campaign_name = getattr(campaign, 'name', 'Demo')
                    context = getattr(campaign, 'business_context', '')
                    script = getattr(campaign, 'script', '')
                    knowledge_base = getattr(campaign, 'knowledge_base', '')
            except Exception as e:
                print(f"Campaign fetch error: {e}")

        inbound_call_sessions[session_id] = {
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "context": context,
            "script": script,
            "knowledge_base": knowledge_base,
            "messages": []
        }

        local_ip = get_local_ip()
        call_url = f"http://{local_ip}:5173/call?session={session_id}&host={local_ip}"

        print(f"[QR] Session {session_id} created → {call_url}")
        return {"session_id": session_id, "call_url": call_url, "local_ip": local_ip}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/call/{session_id}")
async def websocket_inbound_call(websocket: WebSocket, session_id: str, db: Session = Depends(get_db)):
    await websocket.accept()

    session = inbound_call_sessions.get(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Invalid or expired session ID"})
        await websocket.close()
        return

    context = session.get("context", "")
    script = session.get("script", "")
    knowledge_base = session.get("knowledge_base", "")
    campaign_name = session.get("campaign_name", "Demo")

    # Send greeting
    greeting = f"Hello! I'm Nandita, your AI assistant for {campaign_name}. How can I help you today?"
    audio_file = local_audio.generate_tts(greeting)
    session["messages"] = [{"role": "assistant", "content": greeting}]

    await websocket.send_json({
        "type": "ai_reply",
        "text": greeting,
        "audio_url": f"http://{get_local_ip()}:8000/static/{audio_file}",
        "intent": "NEUTRAL",
        "emotion": "NEUTRAL"
    })
    await broadcast_ws({"type": "call_started", "session_id": session_id, "campaign": campaign_name})

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "user_speech":
                user_text = data.get("text", "").strip()
                if not user_text:
                    continue

                await broadcast_ws({"type": "user_spoke", "session_id": session_id, "text": user_text})
                session["messages"].append({"role": "user", "content": user_text})

                result = local_ai.generate_ai_response(
                    prompt=user_text,
                    context=session["messages"][:-1],
                    business_context=context,
                    script=script,
                    knowledge_base=knowledge_base
                )

                reply = result.get("reply") or "I understand. Could you tell me more?"
                intent = result.get("intent", "NEUTRAL") or "NEUTRAL"
                emotion = result.get("emotion", "NEUTRAL") or "NEUTRAL"

                session["messages"].append({"role": "assistant", "content": reply})

                audio_file = local_audio.generate_tts(reply)
                local_ip = get_local_ip()

                await websocket.send_json({
                    "type": "ai_reply",
                    "text": reply,
                    "audio_url": f"http://{local_ip}:8000/static/{audio_file}",
                    "intent": intent,
                    "emotion": emotion
                })
                await broadcast_ws({
                    "type": "ai_replied",
                    "session_id": session_id,
                    "text": reply,
                    "intent": intent,
                    "emotion": emotion
                })

                if "[END_CALL]" in reply:
                    await websocket.send_json({"type": "call_ended"})
                    break

            elif data.get("type") == "end_call":
                await websocket.send_json({"type": "call_ended"})
                break

    except Exception as e:
        print(f"[WS] Call error: {e}")
    finally:
        await broadcast_ws({"type": "call_ended", "session_id": session_id})
        inbound_call_sessions.pop(session_id, None)


# ─── WebRTC Desktop Call WebSocket ───────────────────────────────────────────
# Receives speech-as-text from the browser WebRTC page,
# responds with TTS sentence events. Uses existing local_ai + local_audio.

webrtc_sessions: dict = {}

@app.websocket("/ws/webrtc/{session_id}")
async def websocket_webrtc_call(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    db = SessionLocal()

    context = ""
    script = ""
    knowledge_base = ""
    campaign_name = "Generic Demo"
    messages_history: list = []

    try:
        # First message must be init
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        init_data = json.loads(raw)

        if init_data.get("type") == "init":
            campaign_id = init_data.get("campaign_id")
            if campaign_id and str(campaign_id) not in ("", "null", "None"):
                try:
                    campaign = db.query(Campaign).filter(Campaign.id == int(campaign_id)).first()
                    if campaign:
                        campaign_name = campaign.name or campaign_name
                        context = campaign.business_context or ""
                        script = campaign.script or ""
                        knowledge_base = campaign.knowledge_base or ""
                except Exception as e:
                    print(f"[WebRTC] Campaign fetch error: {e}")

        # Send greeting
        greeting = f"Hello! I'm Nandita, your AI assistant for {campaign_name}. How can I help you today?"
        audio_file = local_audio.generate_tts(greeting)
        local_ip = get_local_ip()
        messages_history = [{"role": "assistant", "content": greeting}]

        await websocket.send_json({
            "type": "greeting",
            "text": greeting,
            "audio_url": f"http://{local_ip}:8000/static/{audio_file}"
        })
        await broadcast_ws({
            "type": "call_started",
            "session_id": session_id,
            "campaign": campaign_name,
            "source": "webrtc"
        })

        # Main conversation loop
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "end_call":
                await websocket.send_json({"type": "call_ended"})
                break

            if data.get("type") != "user_speech":
                continue

            user_text = (data.get("text") or "").strip()
            if not user_text:
                continue

            messages_history.append({"role": "user", "content": user_text})
            await broadcast_ws({"type": "user_spoke", "session_id": session_id, "text": user_text, "source": "webrtc"})

            # Get AI response (non-streaming for WS stability)
            result = local_ai.generate_ai_response(
                prompt=user_text,
                context=messages_history[:-1],
                business_context=context,
                script=script,
                knowledge_base=knowledge_base
            )

            reply = result.get("reply") or "Could you tell me more?"
            intent = result.get("intent", "NEUTRAL") or "NEUTRAL"
            emotion = result.get("emotion", "NEUTRAL") or "NEUTRAL"
            messages_history.append({"role": "assistant", "content": reply})

            # Send each sentence separately for progressive audio
            import re as _re
            sentences = _re.split(r'(?<=[.!?])\s+', reply.strip())
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                audio_file = local_audio.generate_tts(sentence)
                await websocket.send_json({
                    "type": "sentence",
                    "text": sentence,
                    "audio_url": f"http://{get_local_ip()}:8000/static/{audio_file}"
                })

            await websocket.send_json({
                "type": "done",
                "intent": intent,
                "emotion": emotion
            })
            await broadcast_ws({
                "type": "ai_replied",
                "session_id": session_id,
                "text": reply,
                "intent": intent,
                "emotion": emotion,
                "source": "webrtc"
            })

            if "[END_CALL]" in reply:
                await websocket.send_json({"type": "call_ended"})
                break

    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "message": "Init message timeout"})
    except Exception as e:
        print(f"[WebRTC WS] Error: {e}")
    finally:
        db.close()
        await broadcast_ws({"type": "call_ended", "session_id": session_id, "source": "webrtc"})

# ─── Asterisk Outbound & Auto-Dialer Endpoints ───────────────────────────────

import sip_caller

@app.get("/api/asterisk/status")
def get_asterisk_status():
    """Checks if the Asterisk service is running on the machine."""
    return sip_caller.get_asterisk_status()


@app.post("/api/call/auto")
async def trigger_auto_call(data: dict):
    """Trigger a single outbound call via Asterisk."""
    phone_number = data.get("phone_number", "")
    campaign_id = data.get("campaign_id")
    
    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number required")

    result = sip_caller.initiate_call(phone_number, int(campaign_id) if campaign_id else 0)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    
    await broadcast_ws({
        "type": "auto_dial_started", 
        "phone": phone_number, 
        "campaign_id": campaign_id
    })
    return result


@app.post("/api/campaign/{campaign_id}/autodial")
async def start_campaign_autodial(campaign_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Background task to dial all pending contacts in a campaign using Asterisk."""
    contacts = db.query(Contact).filter(
        Contact.campaign_id == campaign_id,
        Contact.status == "pending"
    ).all()
    
    if not contacts:
        raise HTTPException(status_code=400, detail="No pending contacts found")

    async def _autodial_loop(contact_list):
        for contact in contact_list:
            if not contact.phone_number:
                continue
                
            print(f"[AutoDialer] Dialing {contact.name} ({contact.phone_number})...")
            
            # Send WS event to UI
            await broadcast_ws({
                "type": "auto_dial",
                "contact_name": contact.name,
                "phone": contact.phone_number,
                "campaign_id": campaign_id
            })
            
            # Trigger Asterisk Call
            sip_caller.initiate_call(contact.phone_number, campaign_id)
            
            # Mark as called in DB
            db_session = SessionLocal()
            try:
                c = db_session.query(Contact).filter(Contact.id == contact.id).first()
                if c:
                    c.status = "called"
                    db_session.commit()
            finally:
                db_session.close()
            
            # Wait 10 seconds before next dial
            await asyncio.sleep(10)
            
    background_tasks.add_task(_autodial_loop, contacts)
    return {"status": "started", "contacts_queued": len(contacts)}

# ─── AGI Helper Endpoints ───────────────────────────────────────────────────

class AgiTurnRequest(BaseModel):
    session_id: str
    user_text: str
    campaign_id: Optional[int] = None

@app.post("/api/agi/turn")
def agi_turn(req: AgiTurnRequest, db: Session = Depends(get_db)):
    """Called by Asterisk dialora_agent.agi to get the next AI response."""
    context = ""
    script = ""
    kb = ""
    
    if req.campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == req.campaign_id).first()
        if campaign:
            context = campaign.business_context or ""
            script = campaign.script or ""
            kb = campaign.knowledge_base or ""
            
    # For AGI we only keep light history as it's passed per script invocation,
    # or rely on the prompt context if history isn't saved.
    # We construct a simple prompt here
    messages = [{"role": "user", "content": req.user_text}]
    
    result = local_ai.generate_ai_response(
        prompt=req.user_text,
        context=[],
        business_context=context,
        script=script,
        knowledge_base=kb
    )
    return result

@app.post("/api/agi/tts")
def agi_tts(data: dict):
    """Called by Asterisk to generate TTS. Returns path without .mp3/.wav extension."""
    text = data.get("text", "")
    if not text:
        return {"error": "no text"}
    filename = local_audio.generate_tts(text)
    # Give full path without extension /var/lib/asterisk/sounds/dialora/file
    abs_path = os.path.abspath(f"static/{filename}")
    asterisk_path = abs_path.rsplit('.', 1)[0] 
    return {"asterisk_path": asterisk_path}

