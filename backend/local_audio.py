import pyttsx3
import uuid
import os

def generate_tts(text: str) -> str:
    print(f"Generating TTS for: {text}")
    try:
        engine = pyttsx3.init()
        engine.setProperty('rate', 160)
        
        os.makedirs("static", exist_ok=True)
        filename = f"tts_{uuid.uuid4().hex}.wav"
        filepath = os.path.join("static", filename)
        
        engine.save_to_file(text, filepath)
        engine.runAndWait()
        
        return filename
    except Exception as e:
        print("TTS Error:", e)
        return ""
