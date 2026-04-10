# 📞 Dialora
> A full-stack web application for an automated, emotionally intelligent tele-calling agent, featuring a real-time call monitoring dashboard and 100% local AI execution.

![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20React-green)
![Status](https://img.shields.io/badge/status-Active-brightgreen)

---

## 📌 Problem Statement
Intelligent Local-First AI Tele-Calling Agent & Conversation Analytics Platform

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🧠 **Local LLM Engine** | Analyze conversations and drive human-like interactions entirely locally using Ollama (Llama 3.2) |
| 🌐 **LAN Mobile Calling** | Perform live telephony sessions by pairing a mobile device via QR Code over local Wi-Fi, bypassing generic telephony APIs |
| 📊 **Live Dashboard** | Real-time visualization of call metrics, lead conversion rates, and live transcriptions |
| 🧩 **Emotion Detection** | HuggingFace distilRoBERTa dynamically identifies user emotion (Angry, Hesitant, etc.) to adapt the agent's tone |
| 🗣️ **Instant Voice Pipeline** | Combines Native Browser Speech-to-Text with instant offline Text-to-Speech (`pyttsx3`) for zero-latency conversations |
| ⚙️ **Bidirectional Streaming** | FastAPI backend with structured REST API and WebSocket events for live Call Hub synchronization |

---

## 🏗️ Tech Stack

**Frontend**
* ⚛️ **React.ts** — Component-based UI using Vite
* 🎨 **TailwindCSS** — Utility-first modern dark-mode styling
* 🎤 **Web Speech API** — Native browser-based STT capturing
* ⚡ **WebSockets** — Bidirectional real-time stream communication

**Backend**
* 🐍 **FastAPI (Python)** — REST API framework and ASGI event streaming
* 🦙 **Ollama (Llama 3.2)** — Local LLM generation
* 🤗 **Transformers** — Emotion classification via `j-hartmann/emotion-english-distilroberta-base`
* 💾 **SQLite / SQLAlchemy** — Durable relational database schema caching

---

## 📂 Project Structure

```
Dialora/
├── backend/
│   ├── database.py              # SQLite Engine + Session builder
│   ├── models.py                # Campaigns, Contacts, CallLogs schema
│   ├── main.py                  # FastAPI entry point, Routes, & WS
│   ├── local_ai.py              # Ollama Context limits, streaming logic
│   ├── emotion_classifier.py    # HF Pipeline for text-based emotion inference
│   ├── local_audio.py           # pyttsx3 local audio generator
│   ├── requirements.txt         # Python dependencies
│   └── start.bat                # Windows launch script
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Analytics + Live WebSocket monitor + QR Link Generator
│   │   │   ├── Campaign.tsx         # 3-step CSV upload wizard
│   │   │   ├── CallSimulator.tsx    # Desktop SSE streaming call simulator
│   │   │   ├── LiveCallDashboard.tsx# Dedicated Twilio live monitor
│   │   │   └── CallPage.tsx         # Responsive Mobile Call Interface
│   │   ├── App.tsx                  # Root routing layout
│   │   ├── index.css                # Global animations / Tailwind injection
│   │   └── main.tsx                 # Entrypoint
│   ├── package.json
│   └── tailwind.config.js
│
└── README.md
```

---

## ⚙️ Installation & Setup

**Prerequisites**
* Python 3.13+
* Node.js 18+
* [Ollama](https://ollama.com) installed with `llama3.2` pulled (`ollama run llama3.2`)

### 1. Clone the Repository
```bash
git clone https://github.com/imnotparama/Dialora.git
cd Dialora
```

### 2. Backend Setup
```bash
cd backend
python -m venv .env
.env\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000 --host 0.0.0.0
```
* Backend runs at `http://127.0.0.1:8000`
* API docs available at `http://127.0.0.1:8000/docs`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
* Frontend Network proxy runs at `http://<YOUR_LOCAL_IP>:5173`

*(Note: Chrome blocks microphone access for HTTP sites on mobile. Go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on your Android and whitelist `http://<YOUR_LOCAL_IP>:5173` to test live calls!)*

---

## 🧠 How It Works

**Campaign & Lead Parsing**
* The User establishes a Campaign context (Business Description, Script, Knowledge Base FAQs).
* The user uploads a CSV of target names & phone numbers directly attached to the Campaign context.

**📱 QR Code Mobile Pairing Architecture (LAN Calling)**
* Instead of typing URLs, the user clicks "Generate Call Link" on the Dashboard to instantly provision a unique Call Session ID.
* The system dynamically generates an **interactive QR Code** locked to your local network's IP address.
* The user simply **scans the QR Code with their mobile phone** to bypass cumbersome third-party APIs (like Twilio).
* This instantly securely connects the phone's browser to the backend via full-duplex WebSockets, seamlessly turning the phone into a live Tele-calling headset using Chrome's native Webkit microphone.

**Emotional Interaction Flow**
* Native transcription is routed to the Backend.
* Backend passes transcription into HuggingFace distilRoBERTa, mapping it against 10 emotional classes (Angry, Hesitant, Excited, etc.).
* Llama 3.2 ingests contextual history, business context, and emotional tags to tailor its textual response.
* `pyttsx3` synthesizes the offline MP4 in milliseconds, distributing both the TTS and live socket intent tags back to the Dashboard and caller interface.

---

## 📈 Scalability
* The local AI backend architecture can be decoupled and migrated into Dockerized Cloud GPUs (using vLLM) allowing dozens of concurrent simulated calls to execute simultaneously.
* The WebSocket streaming events are isolated to allow infinite external monitor interfaces to sub-pub to the live broadcast channel natively.
* The SQLite foundation allows seamless migration to PostgreSQL utilizing identical SQLAlchemy ORM layouts.

---

## 💡 Feasibility
Dialora embraces a highly robust MVP composition utilizing enterprise-grade technologies like React, FastAPI, and Hugging Face Transformers. By swapping heavy paid-API integrations with native tooling (`pyttsx3`, `webkit STT`, Ollama), Dialora requires literally zero operating cost or complex API key configurations, serving directly effectively as out-of-the-box infrastructure.

---

## 🌟 Novelty
Traditional Voice AI tooling focuses heavily on rigid routing setups or costs upwards of hundreds of dollars just for trial configurations (e.g. Twilio Voice, ElevenLabs, OpenAI Whisper). By completely removing cloud-bound telephony setups, Dialora allows hyper-realistic human conversational interactions via a hybrid mobile-LAN integration technique; developers scan a QR code and immediately have a full-service Tele-robot operating across the room. Additionally, layering an intermediary NLP classification algorithm over Llama vastly deepens conversational fidelity without token waste. 

---

## 🔧 Feature Depth
* **Dynamic Grounding:** Keywords ("not interested", "call me back") instantly govern the LLM intent tree to halt hallucinations and safely end calls over boundaries.
* **Granular Emotion System:** Detects and classifies 10 discrete human emotions.
* **CSV Bulk Management:** Imports complex contact lead books with automated scoring systems generating `Dialora_report.csv` dumps natively.
* **Low-latency Focus:** Zero dependencies; completely offline functionality bridging web-technologies efficiently to avoid WebRTC ICE configuration issues.

---

## ⚠️ Ethical Use & Disclaimer
Dialora is strictly built for educational, research, and authorized hackathon-use only. 
Do NOT use this tool or its integrations to spoof, spam, or robocall unconsenting individuals. Use responsibly, ethically, and strictly within the boundaries of telecommunications laws inside your respective jurisdictions.

---

## 📜 License
Licensed under the Apache 2.0 License.

---

## 🤝 Contributing
Contributions are welcome.
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m "Add feature-name"`
4. Push and open a Pull Request

---

## 🧩 Author
Parameshwaran S
C.Monish Nandha Balan
Kavibharathi K
Dharshan Kumar K
🔗 [GitHub](https://github.com/imnotparama)
