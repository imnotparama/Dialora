import pyttsx3
import uuid
import os

def generate_tts(text: str) -> str:
    print(f"[Nandita TTS] Generating: {text}")
    try:
        engine = pyttsx3.init()
        engine.setProperty('rate', 150)

        # Set female voice (Microsoft Zira on Windows, or first female found)
        voices = engine.getProperty('voices')
        female_voice = None
        for v in voices:
            if 'zira' in v.name.lower() or 'female' in v.name.lower() or 'woman' in v.name.lower():
                female_voice = v
                break
        # Fallback: index 1 is typically female on most Windows installs
        if not female_voice and len(voices) > 1:
            female_voice = voices[1]
        if female_voice:
            engine.setProperty('voice', female_voice.id)

        os.makedirs("static", exist_ok=True)
        filename = f"tts_{uuid.uuid4().hex}.wav"
        filepath = os.path.join("static", filename)

        engine.save_to_file(text, filepath)
        engine.runAndWait()

        return filename
    except Exception as e:
        print("TTS Error:", e)
        return ""
