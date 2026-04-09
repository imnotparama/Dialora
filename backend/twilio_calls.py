from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Gather
import os

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")  
TWILIO_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
NGROK_URL = os.getenv("NGROK_URL")
DEMO_NUMBER = os.getenv("DEMO_PHONE_NUMBER")

# Handle missing env vars gracefully so standard app continues to run without erroring
if TWILIO_SID and TWILIO_TOKEN:
    client = Client(TWILIO_SID, TWILIO_TOKEN)
else:
    client = None

def make_demo_call(campaign_id: str):
    if not client:
        return "twilio_not_configured"
        
    call = client.calls.create(
        to=DEMO_NUMBER,
        from_=TWILIO_NUMBER,
        url=f"{NGROK_URL}/twilio/voice?campaign_id={campaign_id}"
    )
    return call.sid
