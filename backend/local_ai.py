import requests
import json

SYSTEM_PROMPT = """You are a professional tele-calling sales agent.

Goal: Convince the user politely.

Rules:
- Be short and natural
- Handle objections calmly
- Adapt tone based on user response
- Always try to continue the conversation

Also classify user intent as:
[Interested / Not Interested / Callback]

Respond exactly in this format:
Reply: <your response>
Intent: <intent>"""

def generate_ai_response(prompt: str, context: list) -> dict:
    url = "http://localhost:11434/api/chat"
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + context + [{"role": "user", "content": prompt}]
    
    payload = {
        "model": "mistral",
        "messages": messages,
        "stream": False,
        "temperature": 0.7
    }
    try:
        response = requests.post(url, json=payload, timeout=30)
        
        if response.status_code == 200:
            response_text = response.json().get('message', {}).get('content', '')
            
            # Default fallbacks
            reply = response_text
            intent = "Neutral"
            
            # Attempt to parse
            lines = [line.strip() for line in response_text.split('\n') if line.strip()]
            for line in lines:
                if line.lower().startswith("reply:"):
                    reply = line[6:].strip()
                elif line.lower().startswith("intent:"):
                    intent = line[7:].strip()
                    
            # Basic cleanup of intent tracking
            intent_map = {"interested": "Interested", "not interested": "Not Interested", "callback": "Callback"}
            clean_intent = next((val for key, val in intent_map.items() if key in intent.lower()), intent)
                    
            return {"reply": reply, "intent": clean_intent, "raw": response_text}
        else:
            return {"reply": "Ollama connection failed", "intent": "Error", "raw": response.text}
            
    except Exception as e:
        return {"reply": f"Local AI Error: {str(e)}", "intent": "Error", "raw": ""}
