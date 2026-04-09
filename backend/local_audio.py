import uuid
import os
import logging

logger = logging.getLogger(__name__)

# NEW: Toggle between Bark (emotion-aware) and pyttsx3 (legacy, fast)
# Set to True for emotion-aware TTS (slow on CPU ~8-10s/sentence, needs ~2GB download)
# Set to False for instant pyttsx3 TTS (no emotion modulation, but zero latency)
USE_BARK = True  # CHANGED: set to True so you can hear the emotional Bark voices

# ─── Bark model singleton ─────────────────────────────────────────────────────
_bark_processor = None
_bark_model = None
_bark_loaded = False

# NEW: Emotion → Bark text prefix mapping
_BARK_EMOTION_PREFIX = {
    "ANGRY":         "",           # Bark handles with speaker preset tone
    "FRUSTRATED":    "",
    "EXCITED":       "[laughs] ",
    "HAPPY":         "[laughs] ",
    "SAD":           "[softly] ",
    "HESITANT":      "[sighs] ",
    "CONFUSED":      "[sighs] ",
    "DISINTERESTED": "",
    "NEUTRAL":       "",
    "INTERESTED":    "",
}

# NEW: Nandita's voice preset — Indian-accented English female (closest in Bark v2)
_BARK_VOICE_PRESET = "v2/en_speaker_9"


def _load_bark():
    """NEW: Lazy-load Bark model and processor. Called once on first use."""
    global _bark_processor, _bark_model, _bark_loaded
    if _bark_loaded:
        return
    try:
        from transformers import AutoProcessor, BarkModel  # NEW: HuggingFace Bark
        import torch

        logger.info("[Bark TTS] Loading suno/bark model... (first run downloads ~2GB)")
        print("[Bark TTS] Loading suno/bark model... (first run downloads ~2GB)")

        _bark_processor = AutoProcessor.from_pretrained("suno/bark")
        _bark_model = BarkModel.from_pretrained("suno/bark")

        # NEW: Force CPU — no GPU required
        _bark_model = _bark_model.to("cpu")

        _bark_loaded = True
        logger.info("[Bark TTS] ✓ Model loaded successfully on CPU")
        print("[Bark TTS] ✓ Model loaded successfully on CPU")
    except ImportError:
        logger.warning("[Bark TTS] transformers or torch not installed. Falling back to pyttsx3.")
        print("[Bark TTS] transformers or torch not installed. Falling back to pyttsx3.")
        _bark_loaded = True  # Mark as attempted
    except Exception as e:
        logger.warning(f"[Bark TTS] Failed to load model: {e}. Falling back to pyttsx3.")
        print(f"[Bark TTS] Failed to load model: {e}")
        _bark_loaded = True


def is_bark_loaded() -> bool:
    """NEW: Returns True if Bark model was successfully loaded (for health check)."""
    return _bark_model is not None


def generate_tts_bark(text: str, emotion: str = "NEUTRAL") -> str:
    """
    NEW: Generate emotion-aware TTS using suno/bark.
    Inserts Bark-style tags based on Dialora emotion.
    Returns filename of saved WAV in ./static/
    """
    if not text or len(text.strip()) < 2:
        return ""

    # Lazy-load on first call
    if not _bark_loaded:
        _load_bark()

    if _bark_model is None or _bark_processor is None:
        # Bark failed to load — fall back to legacy pyttsx3
        print("[Bark TTS] Model not available, falling back to pyttsx3")
        return generate_tts_legacy(text)

    try:
        import torch
        import scipy.io.wavfile as wavfile
        import numpy as np

        # NEW: Prepend emotion tag to text
        prefix = _BARK_EMOTION_PREFIX.get(emotion.upper(), "")
        bark_text = f"{prefix}{text}".strip()

        print(f"[Bark TTS] Generating ({emotion}): {bark_text}")

        # NEW: Process through Bark pipeline
        inputs = _bark_processor(bark_text, voice_preset=_BARK_VOICE_PRESET)

        # Move inputs to CPU
        inputs = {k: v.to("cpu") if hasattr(v, 'to') else v for k, v in inputs.items()}

        with torch.no_grad():
            audio_array = _bark_model.generate(**inputs)

        # NEW: Convert tensor to numpy and save as WAV
        audio_data = audio_array.cpu().numpy().squeeze()

        # Bark outputs at 24kHz sample rate
        sample_rate = _bark_model.generation_config.sample_rate

        os.makedirs("static", exist_ok=True)
        filename = f"tts_{uuid.uuid4().hex}.wav"
        filepath = os.path.join("static", filename)

        wavfile.write(filepath, rate=sample_rate, data=(audio_data * 32767).astype(np.int16))

        print(f"[Bark TTS] ✓ Saved: {filename}")
        return filename

    except Exception as e:
        print(f"[Bark TTS] Error: {e} — falling back to pyttsx3")
        return generate_tts_legacy(text)


def generate_tts_legacy(text: str) -> str:
    """RENAMED: Original pyttsx3 TTS — fast, no emotion, Microsoft Zira voice."""
    import pyttsx3  # CHANGED: moved import here since it's now conditional
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


# ─── Main entry point (routes to Bark or pyttsx3 based on flag) ────────────────

def generate_tts(text: str, emotion: str = "NEUTRAL") -> str:
    """
    CHANGED: Main TTS function — checks USE_BARK flag and routes accordingly.
    emotion parameter is only used when USE_BARK=True.
    Returns filename string (same contract as before).
    """
    if USE_BARK:
        return generate_tts_bark(text, emotion)  # NEW: emotion-aware path
    else:
        return generate_tts_legacy(text)          # UNCHANGED: fast pyttsx3 path


# NEW: Preload Bark model (called from main.py startup if USE_BARK is True)
def preload():
    """Call during app startup to avoid cold-start on first TTS request."""
    if USE_BARK:
        _load_bark()
