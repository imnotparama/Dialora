from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Gather
import os
from dotenv import load_dotenv

# Load .env explicitly so this module works when imported before main.py runs load_dotenv
load_dotenv()


def _get_client():
    """Lazy-init Twilio client so it always reads the current env vars."""
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if sid and token and len(sid) > 10 and len(token) > 10:
        try:
            return Client(sid, token)
        except Exception as e:
            print(f"[Twilio] Client init failed: {e}")
    return None


def is_configured() -> bool:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    return bool(sid and token and len(sid) > 10 and len(token) > 10)


def make_demo_call(campaign_id: str) -> str:
    load_dotenv(override=True)  # Re-read .env in case it changed since startup

    number = os.getenv("TWILIO_PHONE_NUMBER")
    demo = os.getenv("DEMO_PHONE_NUMBER")
    ngrok = os.getenv("NGROK_URL")

    client = _get_client()
    if not client:
        return "twilio_not_configured"

    if not demo or not ngrok:
        return "missing_config"

    try:
        call = client.calls.create(
            to=demo,
            from_=number,
            url=f"{ngrok}/twilio/voice?campaign_id={campaign_id}",
            status_callback=f"{ngrok}/twilio/status",
            status_callback_method="POST"
        )
        return call.sid
    except Exception as e:
        print(f"[Twilio] make_demo_call error: {e}")
        return f"error:{e}"
