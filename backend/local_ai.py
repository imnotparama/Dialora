import requests
import json
import re

def get_system_prompt(business_context: str = None, script: str = None, knowledge_base: str = None) -> str:
    base = "You are a professional tele-calling sales agent.\n\nGoal: Convince the user politely.\n\nRules:\n- Be short and natural\n- Handle objections calmly\n- Adapt tone based on user response\n- Always try to continue the conversation\n"
    
    if business_context or script or knowledge_base:
        base += "\n--- CAMPAIGN CONTEXT ---\n"
        if business_context:
            base += f"Business Context: {business_context}\n"
        if script:
            base += f"Agent Script / Goal: {script}\n"
        if knowledge_base:
            base += f"Knowledge Base / FAQs: {knowledge_base}\n"
        base += "\n"
        
    base += "Also classify user intent as:\n[Interested / Not Interested / Callback]\n\nRespond exactly in this format:\nReply: <your response>\nIntent: <intent>"
    return base

def generate_ai_response(prompt: str, context: list, business_context: str = None, script: str = None, knowledge_base: str = None) -> dict:
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
            reply = response_text
            intent = "Neutral"
            
            lines = [line.strip() for line in response_text.split('\n') if line.strip()]
            for line in lines:
                if line.lower().startswith("reply:"):
                    reply = line[6:].strip()
                elif line.lower().startswith("intent:"):
                    intent = line[7:].strip()
                    
            intent_map = {"interested": "Interested", "not interested": "Not Interested", "callback": "Callback"}
            clean_intent = next((val for key, val in intent_map.items() if key.lower() in intent.lower()), intent)
                    
            return {"reply": reply, "intent": clean_intent, "raw": response_text, "error": None}
        else:
            return {"reply": "Ollama connection failed", "intent": "Error", "raw": response.text, "error": "AI_ERROR"}
            
    except requests.exceptions.ConnectionError:
        return {
            "reply": None,
            "intent": "NEUTRAL", 
            "error": "OLLAMA_OFFLINE"
        }
    except requests.exceptions.Timeout:
        return {
            "reply": None,
            "intent": "NEUTRAL",
            "error": "OLLAMA_TIMEOUT"
        }
    except Exception as e:
        return {
            "reply": None,
            "intent": "NEUTRAL",
            "error": f"AI_ERROR: {str(e)}"
        }

def score_call(transcript: list) -> dict:
    """
    Evaluates transcript, outputs JSON {"summary": "...", "lead_score": X}
    transcript format: [{"role": "...", "content": "..."}, ...]
    """
    url = "http://localhost:11434/api/chat"
    
    sys_prompt = "You are a QA Analyst reviewing a tele-call transcript. Analyze the following conversation and return a brief summary, a lead_score from 0-10, and a final_intent (Must be exactly one of: 'Interested', 'Not Interested', 'Neutral'). You must ONLY output a pure JSON object in this format: {\"summary\": \"...\", \"lead_score\": 5, \"final_intent\": \"Not Interested\"}. Do not include markdown blocks. If the user declined, said no, or hung up, use 'Not Interested'."
    
    tx_str = "\n".join([f"{msg.get('role', '').upper()}: {msg.get('content', '')}" for msg in transcript])
    
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
                    return {"summary": data.get("summary", "No summary provided"), "lead_score": data.get("lead_score", 0), "final_intent": data.get("final_intent", "Neutral")}
                except Exception:
                    pass
        return {"summary": "Could not parse JSON", "lead_score": 0}
    except Exception as e:
        return {"summary": f"Scoring error: {e}", "lead_score": 0}
