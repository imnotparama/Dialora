# Dialora — Complete AI Handoff Document
> Last updated: 2026-04-09. Written for a new AI agent to fully understand the entire codebase, architecture, decisions, and current state of the Dialora hackathon project.

---

## 1. What Is Dialora?

Dialora is an **AI-powered tele-calling agent** built for a hackathon. It started as an external-API-dependent system (Twilio + Anthropic + ElevenLabs) and was pivoted mid-hackathon into a **100% local, free-to-run platform**. The core innovation is:

- A **local LLM** (Ollama / Llama 3.2) handles all AI conversation logic.
- **Browser-native Speech-to-Text** (`webkitSpeechRecognition` in Chrome) captures customer speech — bypassing Python 3.13's broken audio library ecosystem.
- **pyttsx3** handles offline Text-to-Speech on the backend, generating WAV files served as static assets.
- **Twilio** is optionally layered on for real-world cellular call demonstrations. This requires a valid Twilio account + an Ngrok tunnel.

**Project directory:** `c:\Users\hunte\Fantastic Four - Dialora\`

---

## 2. Tech Stack

### Backend — Python 3.13
| Concern | Library |
|---|---|
| HTTP API | FastAPI + Uvicorn |
| Database ORM | SQLAlchemy (SQLite) |
| Local LLM | HTTP requests → Ollama @ `localhost:11434` |
| Offline TTS | `pyttsx3` (generates `.wav` → `/static/`) |
| Real-world telephony | `twilio` SDK |
| Env config | `python-dotenv` |

> **Critical Python 3.13 note:** `openai-whisper` and `SpeechRecognition` are both broken on Python 3.13 because the `aifc` module was removed. **Do NOT attempt to use them for backend STT.** All STT is done in the browser.

### Frontend — React + TypeScript
| Concern | Library |
|---|---|
| Engine | Vite |
| Language | TypeScript + TSX |
| Styling | Tailwind CSS **v3.4.17** (NOT v4 — v4 breaks CSS nesting in Vite) |
| Routing | `react-router-dom` |
| Icons | `lucide-react` |
| STT | `window.webkitSpeechRecognition` (Chrome only) |
| Real-time | Native WebSocket to `ws://localhost:8000/ws/calls` |

---

## 3. Project File Tree

```
Fantastic Four - Dialora/
├── backend/
│   ├── .env                    ← Runtime secrets (Twilio keys, NGROK_URL)
│   ├── .env.example            ← Template for .env
│   ├── database.py             ← SQLAlchemy engine + session factory
│   ├── models.py               ← ORM models: Campaign, Contact, CallLog
│   ├── local_ai.py             ← Ollama integration + QA scoring
│   ├── local_audio.py          ← pyttsx3 TTS generator
│   ├── twilio_calls.py         ← Twilio REST client + make_demo_call()
│   ├── main.py                 ← FastAPI app: all routes + WebSocket
│   ├── requirements.txt        ← Python dependencies
│   ├── start.bat               ← Windows launch script
│   ├── dialora.db              ← SQLite database (auto-created)
│   ├── test_leads.csv          ← Sample CSV for Contacts upload
│   └── static/                 ← TTS .wav files served here
└── frontend/
    ├── src/
    │   ├── App.tsx             ← Root: Router, NavLink, ToastContainer
    │   ├── main.tsx            ← ReactDOM.createRoot entry
    │   ├── index.css           ← Global CSS + Tailwind directives
    │   ├── App.css             ← App-level CSS
    │   └── pages/
    │       ├── Dashboard.tsx       ← Main analytics + live Twilio overlay
    │       ├── Campaign.tsx        ← 3-step campaign wizard
    │       ├── CallSimulator.tsx   ← Continuous hands-free call sim
    │       └── LiveCallDashboard.tsx ← Dedicated Twilio live monitor
    ├── tailwind.config.js
    ├── vite.config.ts
    └── package.json
```

---

## 4. Database Schema (`models.py`)

### `campaigns` table
| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `name` | String(255) | Required |
| `business_context` | Text | Injected into LLM system prompt |
| `script` | Text | Agent goal / script |
| `knowledge_base` | Text | FAQs / objection handling |
| `language` | String(50) | Default: `en-IN` |
| `status` | String(50) | `draft`, `active`, `finished` |
| `created_at` | DateTime | Auto |

### `contacts` table
| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `campaign_id` | FK → campaigns | |
| `name` | String(255) | |
| `phone_number` | String(50) | |
| `status` | String(50) | `pending`, `called`, `retry`, `done` |
| `retry_count` | Integer | Default 0 |

### `call_logs` table
| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `contact_id` | FK → contacts | Nullable (simulated calls) |
| `campaign_id` | FK → campaigns | Nullable |
| `call_sid` | String(255) | Twilio Call SID |
| `transcript` | Text | JSON array of `{role, content}` dicts |
| `intent_tag` | String(100) | `Interested`, `Not Interested`, `Neutral` |
| `lead_score` | Integer | 0–10 |
| `summary` | Text | QA Analyst AI summary |
| `duration_seconds` | Integer | |
| `recording_url` | String(500) | |
| `status` | String(50) | `completed`, `busy`, `no-answer` |
| `created_at` | DateTime | Auto |

---

## 5. Backend API — All Endpoints (`main.py`)

### Startup
On startup, the app logs Ollama status (GET `/api/tags`), Twilio config, and Ngrok URL to console.

### Health & Config
| Method | Path | Description |
|---|---|---|
| GET | `/api/health/ollama` | Returns `{ status, models, twilio_configured, ngrok_url }` |

### Campaigns
| Method | Path | Description |
|---|---|---|
| GET | `/api/campaigns` | List all campaigns |
| POST | `/api/campaigns` | Create campaign (JSON body: `name, business_context, script, knowledge_base`) |
| POST | `/api/campaigns/{id}/contacts/upload` | Upload CSV file, parses `name,phone_number` columns |
| GET | `/campaigns` | Alias — with contact count per campaign |

### Dashboard Data
| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | `{ total_calls, conversion_rate, active_campaigns, recent_campaigns }` |
| GET | `/api/calllogs` | All call logs with parsed transcript JSON and campaign name |
| GET | `/api/activity` | Recent 10 events (calls + uploads) for activity feed |
| GET | `/api/export/csv` | Download all call logs as `dialora_report.csv` |

### Call Simulation
| Method | Path | Description |
|---|---|---|
| POST | `/api/simulate/start` | Init session context. Form: `session_id` |
| POST | `/api/simulate/turn` | One AI turn. Form: `session_id, user_text, campaign_id (optional)`. Returns `{ user_text, reply, intent, audio_url }` |
| POST | `/api/simulate/end` | Scores transcript via QA LLM, saves CallLog. JSON body: `{ campaign_id, transcript, final_intent }` |

### Twilio Real-World Calling
| Method | Path | Description |
|---|---|---|
| POST | `/api/demo/call` | Trigger outbound call via Twilio. JSON body: `{ campaign_id }` |
| POST | `/twilio/voice` | Twilio webhook: call answered, sends greeting, opens `<Gather>` |
| POST | `/twilio/gather` | Twilio webhook: processes `SpeechResult`, fires LLM, responds with TwiML |
| POST | `/twilio/status` | Twilio status callback, used to clean up session state |

### WebSocket
| Path | Description |
|---|---|
| `ws://localhost:8000/ws/calls` | Push-only broadcast. All connected clients receive real-time call events. |

WebSocket event types:
- `call_started` → `{ type, call_sid, campaign_id, campaign_name }`
- `user_spoke` → `{ type, call_sid, text }`
- `ai_replied` → `{ type, call_sid, text, intent }`
- `call_ended` → `{ type, call_sid, status }`

---

## 6. Local AI Module (`local_ai.py`)

### `generate_ai_response(prompt, context, business_context, script, knowledge_base)`
- Builds a system prompt embedding business context, script, and knowledge base if provided.
- Instructs the model to be SHORT (1–2 sentences), conversational, and handle objections naturally.
- Requires the model to reply in this exact format:
  ```
  Reply: <response text>
  Intent: <Interested|Not Interested|Callback>
  ```
- Calls `POST http://localhost:11434/api/chat` with model `llama3.2`, `stream: false`, `temperature: 0.7`.
- Returns `{ reply, intent, raw, error }`.
- Error types: `OLLAMA_OFFLINE`, `OLLAMA_TIMEOUT`, `AI_ERROR`.

### `score_call(transcript)`
- Takes the full conversation transcript array.
- Acts as an independent "QA Analyst" — injects entire transcript into Llama with `temperature: 0.1`.
- Forces strict JSON output: `{ "summary": "...", "lead_score": 5, "final_intent": "Not Interested" }`.
- Uses regex to extract JSON from the LLM response (handles markdown code blocks).
- Called at the end of every simulation via `/api/simulate/end`.

**Active model:** `llama3.2` (1B or 3B). Previously used Mistral 7B — dropped because it crashed standard laptops with OOM errors during live telephony multi-socket load.

---

## 7. Local Audio (`local_audio.py`)

- `generate_tts(text)` → uses `pyttsx3` to save audio to `./static/tts_<uuid>.wav`.
- Returns the file path.
- Frontend constructs the full URL as `http://localhost:8000/static/<filename>` and plays it via `new Audio(url).play()`.

**Twilio exception:** For real Twilio calls, `pyttsx3` is NOT used. Instead, TwiML `<Say voice="Polly.Matthew-Neural">` is used directly. This avoids: (a) blocking the async event loop, (b) Windows SAPI 5 issues, (c) 15-second Twilio timeouts.

---

## 8. Twilio Integration (`twilio_calls.py` + `main.py`)

### How a demo call works:
1. Frontend Dashboard → `POST /api/demo/call { campaign_id }`.
2. `make_demo_call()` uses Twilio SDK to dial `DEMO_PHONE_NUMBER` from `TWILIO_PHONE_NUMBER`.
3. The Twilio webhook URL is `{NGROK_URL}/twilio/voice?campaign_id=X`.
4. When the call is answered, `/twilio/voice` fires — stores session in `twilio_sessions[call_sid]`, broadcasts `call_started` via WebSocket, responds with TwiML `<Say>` greeting + `<Gather>`.
5. As the customer speaks, `/twilio/gather` processes `SpeechResult`, calls Ollama, broadcasts `user_spoke` + `ai_replied`, responds with TwiML `<Say>` + next `<Gather>`.
6. Call ends when LLM emits `[END_CALL]` in reply, or after 20 turns. Broadcasts `call_ended`.

### Required `.env` variables:
```
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx    # Provisioned Twilio number
DEMO_PHONE_NUMBER=+91xxxxxxxxx      # Target phone to dial
NGROK_URL=https://xxxx.ngrok-free.app  # Public tunnel to localhost:8000
DATABASE_URL=sqlite:///./dialora.db  # Optional override
```

> **Important:** The current `.env` contains live credentials in the repo. Be careful with this.

---

## 9. Frontend — Pages & Routes

Routes defined in `App.tsx`:
| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard` | KPI metrics, call logs table, live call overlay, activity feed |
| `/campaigns/new` | `Campaign` | 3-step wizard to create campaigns |
| `/simulate` | `CallSimulator` | Hands-free continuous AI call simulation |
| `/live` | `LiveCallDashboard` | Dedicated real-time Twilio call monitor |

### `App.tsx` — Global Infrastructure
- `ToastContainer`: Global toast system. Triggered via `showToast(message, type)` exported function. Uses `window.dispatchEvent(new CustomEvent('dialora-toast', ...))`.
- `NavLink`: Active route detection with cyan left-border indicator + lucide icon.
- Sidebar: Shows spinning conic-gradient Dialora logo, nav links, live AI engine status indicator (polls `/api/health/ollama` every 10s), version badge.
- Background: `#0a0f1e` main, `#080c17` sidebar.

### `Dashboard.tsx`
- **AnimatedCounter**: Counts up smoothly from 0 to target on mount (1500ms duration, 16ms ticks).
- **Metric cards**: Total Calls, Conversion Rate, Active Campaigns — each with mini SVG sparkline, color-coded top border.
- **Recent Call Logs table**: Clicking any row opens the Log Viewer Modal with full transcript replay.
- **Live Activity Feed**: Timeline of recent calls + CSV uploads with timestamps.
- **Live Demo Call Modal**: Campaign selector + Twilio dial button.
- **Live Call Monitor (WebSocket)**: Appears when a Twilio call is active. Shows LIVE badge, intent badge, call timer, real-time transcript bubbles. Auto-scrolls. Disappears on `call_ended`.
- **Log Viewer Modal**: Renders full historical transcript with role-based bubble styling + QA AI summary.
- All data fetched via parallel `Promise.all` on mount.

### `Campaign.tsx` — 3-Step Wizard
- **Step 1** — Basic Info: Campaign name + business category dropdown.
- **Step 2** — AI Configuration: `business_context`, `script`, `knowledge_base` textareas with character counters.
- **Step 3** — Upload Leads: Drag-and-drop CSV upload zone. CSV format: `name,phone_number`.
- On submit: `POST /api/campaigns` → if file attached, `POST /api/campaigns/{id}/contacts/upload`.
- On success: routes to Step 4 (success screen) then redirects to `/` after 2.5s.
- Uses global `showToast()` for errors/success.

### `CallSimulator.tsx` — Hands-Free Call Simulation
**This is the core feature of the app.**

#### Call flow:
1. User clicks **"Start Audio Session"** → `startCall()` activates `webkitSpeechRecognition`.
2. Recognition runs continuously (`recognition.continuous = true`, `lang: 'en-IN'`).
3. Non-final results display in a live "listening bubble" in the chat.
4. On `.isFinal`, the transcript is committed → `handleTurn(transcript)` fires immediately.
5. Mic is paused (`recognition.stop()`) while the POST to backend is in-flight.
6. On response: AI reply displayed as bubble, `pyttsx3` audio plays via `new Audio(url).play()`.
7. On `audio.onended`: mic resumes (`recognition.start()`).
8. Chrome's 60-second STT hard cutoff is countered by `recognition.onend` — if `callActiveRef.current` is true, it immediately calls `recognition.start()` again.

#### Text fallback:
- An input at the bottom of the screen lets users type messages instead of speaking.

#### Intent tracking:
- Current intent shown as a color-coded pill: `green=Interested`, `red=Not Interested`, `amber=Neutral`.
- Last 5 intent history shown as colored dots.

#### End call:
- `handleEndCall()` → stops recognition, fires `POST /api/simulate/end` with full transcript.
- Backend calls `local_ai.score_call()` → saves `CallLog` → returns `{ lead_score, summary, intent_tag }`.
- Shows **Post-Call Summary Screen** with: animated circular Lead Score gauge (SVG arc), Final Intent badge, QA Summary quote block.
- If `lead_score >= 7`, CSS confetti drops animate across the screen.
- "Simulate Again" resets all state. "View Dashboard" navigates to `/`.

#### Offline handling:
- If `/api/health/ollama` returns offline, the Start button is disabled + a warning banner appears.
- If mid-call Ollama goes down: error message bubble appears in chat, mic resumes automatically.

### `LiveCallDashboard.tsx` — Dedicated Live Monitor
- Connects to `ws://localhost:8000/ws/calls` with auto-reconnect (3s retry on close/error).
- WebSocket status shown as pill: `Connecting`, `Listening for Calls`, `Live Call Active`, `Reconnecting`.
- **IntentMeter component**: Visual progress bar showing intent signal strength (Not Interested → Neutral → Interested), with glow effects and color transitions.
- **StatCard row**: Session Calls, Duration, Live Intent, Connection status.
- **Transcript panel**: Live chat bubbles with timestamps for each turn. Shows intent per AI turn.
- **Sidebar**: Recent call history (fetched from `/api/calllogs`) with intent badges, lead scores, summaries.
- **Tips box**: Static tips about the live monitor behavior.

---

## 10. Tailwind CSS Design System

Custom tokens defined in `tailwind.config.js`:
```js
colors: {
  'dialora-navy': '#0a0f1e',     // Page background
  'dialora-card': '#111827',     // Card background
  'dialora-accent': '#2ee2a3',   // Teal green (primary accent)
  'dialora-indigo': '#5c33ff',   // Purple (secondary)
  'dialora-success': '#10b981',  // Green success
}
```

Custom animations defined:
- `animate-fade-in` — opacity 0→1, translateY 10px→0
- `animate-shimmer` — loading skeleton shimmer effect
- `animate-soundwave` — bouncing bars for the mic listening indicator
- `confetti` — CSS keyframe drop animation for post-call success
- `hover-slide-right` — nav item subtle rightward slide

---

## 11. How To Run The App

### Prerequisites
- Python 3.13 virtual environment
- Ollama installed and running: `ollama serve` + `ollama pull llama3.2`
- Node.js 18+
- (Optional for real calls) Twilio account + Ngrok

### Backend
```powershell
# From: c:\Users\hunte\Fantastic Four - Dialora\backend\
.\venv\Scripts\activate
pip install -r requirements.txt   # (only first time)
uvicorn main:app --reload --port 8000
```
Or use `start.bat`.

### Frontend
```powershell
# From: c:\Users\hunte\Fantastic Four - Dialora\frontend\
npm install   # (only first time)
npm run dev   # Starts Vite dev server, usually http://localhost:5173
```

### For Twilio Live Calls (optional demo feature)
1. Start Ngrok: `ngrok http 8000`
2. Copy the public URL (e.g. `https://1234-xxx.ngrok-free.app`)
3. Update `NGROK_URL` in `backend/.env`
4. Click "Live Demo Call" on the Dashboard

---

## 12. Known Issues & Gotchas

- **`requirements.txt` encoding bug:** The `twilio` line has garbled UTF-16 encoding. If `pip install` fails on that line, manually run `pip install twilio>=8.0.0`.
- **Chrome-only STT:** `webkitSpeechRecognition` only works in Google Chrome. Firefox/Safari will show an alert and refuse to start the call.
- **`pyttsx3` event loop:** On the Twilio call path, `pyttsx3` was abandoned because it blocks the async event loop. Use `Polly.Matthew-Neural` TwiML `<Say>` exclusively for Twilio calls.
- **Ollama cold start:** The first request after `ollama serve` can take 15–30 seconds while the model loads into RAM. The simulator shows a "still thinking" message after 15s to handle this.
- **Historical transcript parsing:** Legacy call logs may have malformed transcript JSON (from early development). The backend `GET /api/calllogs` wraps the `json.loads()` in a try/except to return `[]` rather than crash. The frontend also guards against non-array responses.
- **SQLite threading:** `connect_args={"check_same_thread": False}` is set in `database.py` to prevent SQLAlchemy errors in FastAPI's async context.
- **No authentication:** This is a hackathon MVP. There is no auth layer. All APIs are open.

---

## 13. What Has Been Completed (Full Feature List)

- [x] FastAPI backend with SQLite ORM (Campaign, Contact, CallLog models)
- [x] Local LLM integration via Ollama (`llama3.2`)
- [x] Offline TTS via `pyttsx3` → static WAV files
- [x] Browser-native STT via `webkitSpeechRecognition`
- [x] Campaign creation API + 3-step frontend wizard
- [x] CSV contact upload (no Pandas) → links to campaigns
- [x] Call Simulator: continuous hands-free mode with auto mic suspend/resume
- [x] Intent classification: real-time `Interested / Not Interested / Neutral`
- [x] End-call QA scoring: Ollama acts as QA Analyst, returns `lead_score 0-10 + summary + final_intent`
- [x] Post-call summary screen with animated score gauge + confetti for scores ≥ 7
- [x] Dashboard: animated KPI counters, call log table, activity feed, log viewer modal
- [x] CSV export endpoint (`/api/export/csv`)
- [x] Twilio outbound calling via Ngrok webhook tunnel
- [x] Real-time WebSocket broadcast of Twilio call events
- [x] Live call overlay on Dashboard (LIVE badge, real-time transcript, intent badge, timer)
- [x] Dedicated Live Call Monitor page (`/live`) with auto-reconnect WebSocket
- [x] Global toast notification system
- [x] Ollama health check + status indicator in sidebar
- [x] "Linear-style" dark premium UI (glassmorphism, glows, micro-animations)
- [x] Chrome 60s STT timeout resilience (auto-restart on `onend` while call is active)
- [x] Text fallback input for when mic fails during simulation
