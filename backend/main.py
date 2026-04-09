import os
import uuid
import json

from fastapi import FastAPI, Form, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

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

@app.post("/demo/seed")
def seed_demo(db: Session = Depends(get_db)):
    campaign = Campaign(name="Local Demo Campaign", business_context="We provide fast local AI solutions.")
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {"status": "Seeded locally!", "campaign_id": campaign.id}

@app.get("/campaigns")
def get_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).all()
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
    user_text: str = Form(...)  # Native Browser Speech API passes raw text now!
):
    if not user_text:
        return {"error": "Could not receive text."}
        
    if session_id not in sim_contexts:
        sim_contexts[session_id] = []
        
    # AI Generation
    context = sim_contexts[session_id]
    ai_res = local_ai.generate_ai_response(user_text, context)
    
    # Update Context Memory
    context.append({"role": "user", "content": user_text})
    context.append({"role": "assistant", "content": ai_res['reply']})
    
    # TTS Sync Generation
    audio_path = local_audio.generate_tts(ai_res['reply'])
    
    return {
        "user_text": user_text,
        "reply": ai_res['reply'],
        "intent": ai_res['intent'],
        "audio_url": f"http://localhost:8000/static/{os.path.basename(audio_path)}" if audio_path else ""
    }
