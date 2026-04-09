import requests
import json
import re

# ─── Keyword-based intent grounding ──────────────────────────────────────────
# These lists check what the USER actually said, not just what the LLM guesses.
# The LLM's classification is used only as a tiebreaker when no strong signal exists.

_NOT_INTERESTED_SIGNALS = [
    "not interested", "no thanks", "no thank you", "don't call", "do not call",
    "remove me", "take me off", "stop calling", "busy", "not now", "bad time",
    "already have", "not looking", "no need", "not needed", "don't need",
    "can't talk", "cannot talk", "call later", "no no", "nope", "nah",
    "i'm good", "i am good", "we're good", "we are good", "please don't",
    "please stop", "goodbye", "bye bye", "hang up", "wrong number"
]

_CALLBACK_SIGNALS = [
    "call me later", "call back", "callback", "try again", "another time",
    "not right now", "in a meeting", "call tomorrow", "call next week",
    "reach me later", "ping me later", "send an email", "send me details",
    "send me info", "WhatsApp me", "text me"
]

_INTERESTED_SIGNALS = [
    "tell me more", "interested", "sounds good", "go ahead", "sure",
    "yes please", "i'd like", "i would like", "how much", "what's the price",
    "what is the price", "pricing", "how does it work", "when can", "sign me up",
    "let's do it", "let me know more", "i want", "please continue"
]


def _classify_intent_from_user(user_text: str) -> str | None:
    """
    Returns a definitive intent if user's text contains strong keyword signals.
    Returns None if the text is ambiguous (defer to LLM).
    Priority: Not Interested > Callback > Interested
    """
    lower = user_text.lower()

    for phrase in _NOT_INTERESTED_SIGNALS:
        if phrase in lower:
            return "Not Interested"

    for phrase in _CALLBACK_SIGNALS:
        if phrase in lower:
            return "Callback"

    for phrase in _INTERESTED_SIGNALS:
        if phrase in lower:
            return "Interested"

    return None  # ambiguous — use LLM result


def _clean_reply(text: str) -> str:
    """
    Strips any leaked 'Intent: X' lines or trailing intent text from the reply.
    """
    # Remove full lines starting with Intent:
    lines = [l for l in text.split('\n') if not re.match(r'^\s*intent\s*:', l, re.IGNORECASE)]
    cleaned = '\n'.join(lines).strip()
    # Also strip trailing inline intent patterns like ". Intent: Interested"
    cleaned = re.sub(r'\.\s*Intent\s*:\s*\S+\s*$', '.', cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r'\s*Intent\s*:\s*\S+\s*$', '', cleaned, flags=re.IGNORECASE).strip()
    return cleaned


# ─── System prompt ────────────────────────────────────────────────────────────

def get_system_prompt(business_context: str = None, script: str = None, knowledge_base: str = None) -> str:
    base = (
        "You are Nandita, a warm and professional female tele-calling sales agent on a live phone call. "
        "Speak naturally, confidently, and conversationally — like a real person, not a robot.\n\n"
        "CRITICAL RULES:\n"
        "- KEEP IT EXTREMELY SHORT. Speak only 1 to 2 short sentences per response.\n"
        "- Do NOT list all details at once. Give one hook, then ask a question.\n"
        "- People get bored and hang up if you talk too much. Be highly conversational.\n"
        "- Handle objections calmly and with warmth.\n"
        "- Never break character. You are Nandita.\n"
    )

    if business_context or script or knowledge_base:
        base += "\n--- CAMPAIGN CONTEXT ---\n"
        if business_context:
            base += f"Business Context: {business_context}\n"
        if script:
            base += f"Agent Script / Goal: {script}\n"
        if knowledge_base:
            base += f"Knowledge Base / FAQs: {knowledge_base}\n"
        base += "\n"

    base += (
        "After your reply, on a SEPARATE NEW LINE, classify the customer's intent based only on what they said:\n"
        "- Use 'Interested' ONLY if the customer asked for more info, pricing, or said yes.\n"
        "- Use 'Not Interested' if they said no, bye, not now, or rejected the offer.\n"
        "- Use 'Callback' if they asked to be called back or said they're busy.\n"
        "- Use 'Neutral' if the customer gave a generic greeting or unclear response.\n\n"
        "STRICT OUTPUT FORMAT (never deviate):\n"
        "Reply: <your spoken response only, no intent here>\n"
        "Intent: <Interested|Not Interested|Callback|Neutral>"
    )
    return base


# ─── Main AI response ─────────────────────────────────────────────────────────

def generate_ai_response(
    prompt: str,
    context: list,
    business_context: str = None,
    script: str = None,
    knowledge_base: str = None
) -> dict:
    url = "http://localhost:11434/api/chat"

    system_prompt = get_system_prompt(business_context, script, knowledge_base)
    messages = [{"role": "system", "content": system_prompt}] + context + [{"role": "user", "content": prompt}]

    payload = {
        "model": "llama3.2",
        "messages": messages,
        "stream": False,
        "temperature": 0.7
    }

    try:
        response = requests.post(url, json=payload, timeout=30)

        if response.status_code == 200:
            response_text = response.json().get('message', {}).get('content', '')
            raw_reply = response_text
            llm_intent = "Neutral"

            # Parse Reply: and Intent: lines
            lines = [line.strip() for line in response_text.split('\n') if line.strip()]
            for line in lines:
                if line.lower().startswith("reply:"):
                    raw_reply = line[6:].strip()
                elif line.lower().startswith("intent:"):
                    llm_intent = line[7:].strip()

            # Clean any leaked "Intent: X" from the spoken reply
            clean_reply_text = _clean_reply(raw_reply)

            # Normalise LLM intent
            intent_map = {
                "interested": "Interested",
                "not interested": "Not Interested",
                "callback": "Callback",
                "neutral": "Neutral"
            }
            llm_clean = next(
                (val for key, val in intent_map.items() if key in llm_intent.lower()),
                "Neutral"
            )

            # ── Override with keyword-based grounding from USER's actual words ──
            # This prevents the LLM from always returning "Interested" regardless.
            keyword_intent = _classify_intent_from_user(prompt)
            final_intent = keyword_intent if keyword_intent is not None else llm_clean

            return {
                "reply": clean_reply_text,
                "intent": final_intent,
                "raw": response_text,
                "error": None
            }
        else:
            return {"reply": "Ollama connection failed", "intent": "Error", "raw": response.text, "error": "AI_ERROR"}

    except requests.exceptions.ConnectionError:
        return {"reply": None, "intent": "Neutral", "error": "OLLAMA_OFFLINE"}
    except requests.exceptions.Timeout:
        return {"reply": None, "intent": "Neutral", "error": "OLLAMA_TIMEOUT"}
    except Exception as e:
        return {"reply": None, "intent": "Neutral", "error": f"AI_ERROR: {str(e)}"}


# ─── End-of-call QA scoring ───────────────────────────────────────────────────

def score_call(transcript: list) -> dict:
    """
    Evaluates transcript, outputs JSON {"summary": "...", "lead_score": X, "final_intent": "..."}
    transcript format: [{"role": "...", "content": "..."}, ...]
    """
    url = "http://localhost:11434/api/chat"

    sys_prompt = (
        "You are a QA Analyst reviewing a tele-call transcript conducted by Nandita, an AI sales agent. "
        "Analyze the following conversation from the CUSTOMER's perspective and return:\n"
        "- summary: 1-2 sentence description of how the call went\n"
        "- lead_score: integer 0-10 (0=hostile/hung up, 5=neutral, 10=ready to buy)\n"
        "- final_intent: MUST be exactly one of: 'Interested', 'Not Interested', 'Neutral'\n\n"
        "SCORING GUIDE:\n"
        "- Score 0-3: Customer said no, hung up, was rude, or showed clear disinterest\n"
        "- Score 4-6: Customer was polite but non-committal or asked general questions\n"
        "- Score 7-9: Customer asked about pricing, features, or expressed genuine interest\n"
        "- Score 10: Customer agreed to a next step, demo, or purchase\n\n"
        "Output ONLY a pure JSON object, no markdown:\n"
        "{\"summary\": \"...\", \"lead_score\": 5, \"final_intent\": \"Neutral\"}"
    )

    tx_str = "\n".join([
        f"{msg.get('role', '').upper()}: {msg.get('content', '')}"
        for msg in transcript
    ])

    payload = {
        "model": "llama3.2",
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"Transcript:\n{tx_str}"}
        ],
        "stream": False,
        "temperature": 0.1
    }

    try:
        response = requests.post(url, json=payload, timeout=60)
        if response.status_code == 200:
            result_text = response.json().get('message', {}).get('content', '')
            match = re.search(r'\{.*\}', result_text, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(0))
                    return {
                        "summary": data.get("summary", "No summary provided"),
                        "lead_score": data.get("lead_score", 0),
                        "final_intent": data.get("final_intent", "Neutral")
                    }
                except Exception:
                    pass
        return {"summary": "Could not parse scoring response", "lead_score": 0, "final_intent": "Neutral"}
    except Exception as e:
        return {"summary": f"Scoring error: {e}", "lead_score": 0, "final_intent": "Neutral"}
