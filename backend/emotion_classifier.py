# NEW: emotion_classifier.py
# Dedicated HuggingFace emotion classifier — replaces LLM [EMOTION:X] tag parsing.
# Model: j-hartmann/emotion-english-distilroberta-base (7 labels → 10 Dialora emotions)
# Loads ONCE at startup as a module-level singleton. CPU-only.

import logging

logger = logging.getLogger(__name__)

# NEW: Map HuggingFace model labels → Dialora's 10-emotion system
_LABEL_MAP: dict[str, str] = {
    "anger":   "ANGRY",
    "disgust": "FRUSTRATED",
    "fear":    "HESITANT",
    "joy":     "HAPPY",
    "neutral": "NEUTRAL",
    "sadness": "SAD",
    "surprise":"EXCITED",
}

# NEW: Module-level singleton — loaded once, reused for every request
_classifier = None
_classifier_loaded = False


def _load_classifier():
    """Lazy-load the HuggingFace pipeline. Called once on first use."""
    global _classifier, _classifier_loaded
    if _classifier_loaded:
        return
    try:
        from transformers import pipeline  # NEW: imported here to avoid hard crash if not installed
        _classifier = pipeline(
            "text-classification",
            model="j-hartmann/emotion-english-distilroberta-base",
            top_k=1,         # NEW: only need the top prediction
            device=-1        # NEW: CPU only, no GPU required
        )
        _classifier_loaded = True
        logger.info("[EmotionClassifier] ✓ Loaded j-hartmann/emotion-english-distilroberta-base (CPU)")
    except ImportError:
        logger.warning(
            "[EmotionClassifier] 'transformers' not installed. "
            "Emotion detection will return NEUTRAL. Run: pip install transformers torch"
        )
        _classifier_loaded = True  # NEW: mark as attempted so we don't retry every request
    except Exception as e:
        logger.warning(f"[EmotionClassifier] Failed to load model: {e}. Falling back to NEUTRAL.")
        _classifier_loaded = True


def is_loaded() -> bool:
    """NEW: Returns True if the classifier model was successfully loaded (for /api/health)."""
    return _classifier is not None


def classify_emotion(text: str) -> str:
    """
    NEW: Classify the emotion of the given text using HuggingFace distilRoBERTa.
    Returns one of Dialora's 10 emotion strings.
    Falls back to 'NEUTRAL' if the model is unavailable or text is too short.
    """
    if not text or len(text.strip()) < 3:
        return "NEUTRAL"

    # NEW: Lazy-load on first call
    if not _classifier_loaded:
        _load_classifier()

    if _classifier is None:
        return "NEUTRAL"  # NEW: graceful fallback if model failed to load

    try:
        # NEW: Run inference — result is [[{"label": "joy", "score": 0.95}]]
        result = _classifier(text[:512], truncation=True)  # NEW: cap at 512 tokens
        if result and isinstance(result, list) and len(result) > 0:
            top = result[0]
            if isinstance(top, list):
                top = top[0]
            hf_label = top.get("label", "neutral").lower()
            return _LABEL_MAP.get(hf_label, "NEUTRAL")  # NEW: map to Dialora emotion
    except Exception as e:
        logger.warning(f"[EmotionClassifier] Inference error: {e}")

    return "NEUTRAL"


# NEW: Pre-load at import time (called from main.py startup in a background thread)
def preload():
    """Call this during app startup to avoid cold-start latency on first request."""
    _load_classifier()
