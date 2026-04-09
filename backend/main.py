import os
import uuid
import json
import csv
from io import StringIO
from typing import Optional, List
import requests

from fastapi import FastAPI, Form, File, UploadFile, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import engine, Base, get_db
from models import Campaign, Contact, CallLog
import local_ai
import local_audio

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Dialora Local API")

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

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
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = response.json().get("models", [])
        model_names = [m["name"] for m in models]
        return {
            "status": "online",
            "models": model_names
        }
    except:
        return {
            "status": "offline",
            "models": []
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
        res.append({
            "id": log.id,
            "campaign_name": campaign_name,
            "intent_tag": log.intent_tag,
            "lead_score": log.lead_score,
            "summary": log.summary,
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
        intent_tag=data.final_intent,
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
    
    audio_path = local_audio.generate_tts(ai_res['reply'])
    
    return {
        "user_text": user_text,
        "reply": ai_res['reply'],
        "intent": ai_res['intent'],
        "audio_url": f"http://localhost:8000/static/{os.path.basename(audio_path)}" if audio_path else ""
    }
