# 🤙 Dialora — AI-Powered Intelligent Tele-Calling Agent

> Built for ORIGIN 26 Hackathon by Team Fantastic Four

![Python](https://img.shields.io/badge/Python-3.13-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green) ![React](https://img.shields.io/badge/React-18-cyan) ![Ollama](https://img.shields.io/badge/LLM-Llama3.2-purple) ![License](https://img.shields.io/badge/License-MIT-yellow)

## 🎯 Problem Statement
Traditional tele-calling is resource-intensive, inconsistent, and unscalable. Existing robocalls are purely static trees and fundamentally unintelligent. **Dialora solves this** by empowering scalable outbound calling campaigns fueled by a fully localized AI brain.

## ✨ What Dialora Does
- 📞 **Initiates outbound calls** automatically via Twilio.
- 🗣️ **Speaks naturally** using premium Twilio Polly Neural TTS.
- 🧠 **Responds dynamically** using a hyper-local **Llama 3.2** AI.
- 🎯 **Detects real-time intent**: Interested / Not Interested / Callback.
- 📊 **Scores leads 0-10** automatically leveraging a separate QA pipeline after every call.
- 💻 **Streams live call transcripts** back to a rich analytics Dashboard via WebSockets.

---

## 🏗️ Architecture & Processing Pipeline

Dialora executes inside a high-speed, 100% local processing loop (simulated mode) or via Twilio webhooks. Here is the active data lifecycle:

```text
USER SPEAKS (Continuous Call Mode) 
  --> [Frontend] webkitSpeechRecognition (Tracks silently)
  --> Transcribes to Text natively, fires Payload on user pause (.isFinal)
  --> POST /api/simulate/turn (user_text="abc")
  --> [Backend FastAPI] 
  --> Pushes Context to Ollama 
  --> Extracts `Reply:` and `Intent:` from Ollama Text 
  --> Maps Reply via pyttsx3 to `/static/tts_xxx.wav`
  --> Returns JSON { user_text, reply, intent, audio_url }
  --> [Frontend] Auto-Pauses Mic -> Plays Audio Hook -> Auto-Resumes Mic
```

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.13** inside system `PATH`.
- **Node.js 18+** for the frontend client.
- **Ollama** installed running natively in the background ([ollama.com/download](https://ollama.com/download)).
- **Twilio Account** (optional, required only for Real-World Outbound Mode).

### Installation

**1. Clone the Repository**
```bash
git clone https://github.com/your-username/dialora.git
cd dialora
```

**2. Backend Setup**
Navigate to the backend and initialize your Python dependencies.
```bash
cd backend
python -m venv venv
source venv/Scripts/activate  # (On Windows git bash)
pip install -r requirements.txt
cp .env.example .env          # Update .env with your credentials if using Twilio
```

**3. Initialize the Local AI Brain**
With Ollama installed on your device, pull the required model matrix!
```bash
ollama pull llama3.2
```

**4. Frontend Setup**
Navigate to the frontend React workspace.
```bash
cd ../frontend
npm install
```

**5. Spin Up Systems**
You will need two terminals to run the system cleanly:
Terminal 1 (Backend):
```bash
cd backend
uvicorn main:app --reload
```
Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```
Navigate to `http://localhost:5173` to view the Dashboard!

---

## 🎮 Demo Mode (Simulator Studio)
Dialora ships with the fully independent **Simulator Studio**. This environment works 100% offline with ZERO external API dependencies.
1. Create a `Campaign` in the frontend workflow.
2. Hit the "Quick Start" simulator mode.
3. Allow microphone permissions.
4. Talk directly into your computer; Dialora's local engine will track your voice continuously and render responses utilizing local system `pyttsx3` Voice synthesizers.

## 📞 Live Call Mode (Twilio Telephony)
Take your solution out of the local box and onto real-world cell networks.
1. Create a free Twilio account to get an `ACCOUNT_SID` and `AUTH_TOKEN`.
2. Start an Ngrok tunnel to expose your local FastAPI server to the internet:
   ```bash
   ngrok http 8000
   ```
3. Update your `.env` file with the Twilio credentials and the `NGROK_URL`.
4. Click **Live Demo Call** on the Dashboard, select your Campaign target, and Dialora will physically call your cell phone!

---

## 👥 Team
**Team Fantastic Four**
- Dharshan 
- Parama
- Hunter
- Alex (Change names as appropriate)

*SRM Institute of Science and Technology, Ramapuram*

## 🏆 Built for
**ORIGIN 26 Hackathon** — SIMATS Engineering College  
**Problem Statement PS-02** by Vedaspark
