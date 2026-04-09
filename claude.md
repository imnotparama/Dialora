# Dialora — Complete AI Handoff Document
> Last updated: 2026-04-10. Written for a new AI agent to fully understand the entire codebase, architecture, decisions, and current state of the Dialora hackathon project.

---

## 1. What Is Dialora?

Dialora is an **AI-powered tele-calling agent** built for a hackathon. It started as an external-API-dependent system (Twilio + Anthropic + ElevenLabs) and was pivoted mid-hackathon into a **100% local, free-to-run platform**. The core innovation is:

- A **local LLM** (Ollama / Llama 3.2) handles all AI conversation logic.
- **Browser-native Speech-to-Text** (`webkitSpeechRecognition` in Chrome) captures customer speech — bypassing Python 3.13's broken audio library ecosystem.
- **pyttsx3** handles offline Text-to-Speech on the backend, generating WAV files served as static assets.
- **Twilio** is optionally layered on for real-world cellular call demonstrations. This requires a valid Twilio account + an Ngrok tunnel.
- **Emotional Intelligence** — Nandita detects the caller's emotional state (ANGRY, FRUSTRATED, EXCITED, CONFUSED, HESITANT, DISINTERESTED, NEUTRAL, HAPPY, SAD) and adapts her tone and strategy in real time.
- **Low-latency streaming** — Ollama responses stream sentence-by-sentence via SSE. The first word of Nandita's reply plays before the model has even finished generating the full response.

**Project directory:** `c:\Users\hunte\Fantastic Four - Dialora\`
**GitHub:** `https://github.com/imnotparama/Dialora` (branch: `main`)

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
| Streaming | `asyncio` + `threading` + `asyncio.Queue` |
| SSE | FastAPI `StreamingResponse` (`text/event-stream`) |

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
| SSE | Native `fetch` + `ReadableStream` reader |

---

## 3. Project File Tree

```
Fantastic Four - Dialora/
├── backend/
│   ├── .env                    ← Runtime secrets (Twilio keys, NGROK_URL)
│   ├── .env.example            ← Template for .env
│   ├── database.py             ← SQLAlchemy engine + session factory
│   ├── models.py               ← ORM models: Campaign, Contact, CallLog
│   ├── local_ai.py             ← Ollama integration, streaming, emotion detection, QA scoring
│   ├── local_audio.py          ← pyttsx3 TTS generator (simulator path only)
│   ├── twilio_calls.py         ← Twilio REST client + make_demo_call()
│   ├── main.py                 ← FastAPI app: all routes + WebSocket + SSE
│   ├── requirements.txt        ← Python dependencies
│   ├── start.bat               ← Windows launch script
│   ├── dialora.db              ← SQLite database (auto-created)
│   ├── test_leads.csv          ← Sample CSV for Contacts upload
│   └── static/                 ← TTS .wav files served here (gitignored)
└── frontend/
    ├── src/
    │   ├── App.tsx             ← Root: Router, NavLink, ToastContainer + showToast
    │   ├── main.tsx            ← ReactDOM.createRoot entry
    │   ├── index.css           ← Global CSS + Tailwind directives + animations
    │   ├── App.css             ← App-level CSS
    │   └── pages/
    │       ├── Dashboard.tsx       ← Main analytics + live Twilio overlay + setup modal
    │       ├── Campaign.tsx        ← 3-step campaign wizard
    │       ├── CallSimulator.tsx   ← SSE streaming + emotion-aware call simulator
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
| POST | `/api/simulate/turn` | **Legacy** non-streaming turn. Form: `session_id, user_text, campaign_id`. Returns `{ user_text, reply, intent, audio_url }` |
| **POST** | **`/api/simulate/turn/stream`** | **NEW — SSE streaming turn.** Form: `session_id, user_text, campaign_id`. Returns `text/event-stream`. See section 6. |
| POST | `/api/simulate/end` | Scores transcript via QA LLM, saves CallLog. JSON body: `{ campaign_id, transcript, final_intent }` |

### Twilio Real-World Calling
| Method | Path | Description |
|---|---|---|
| POST | `/api/demo/call` | Trigger outbound call via Twilio. JSON body: `{ campaign_id }`. Returns `error:` string on Twilio SDK failure. |
| POST | `/twilio/voice` | Twilio webhook: call answered, stores campaign KB in session, sends greeting, opens `<Gather>` |
| POST | `/twilio/gather` | Twilio webhook: processes `SpeechResult`, calls `generate_ai_response()` with correct kwargs, responds with TwiML |
| POST | `/twilio/status` | Twilio status callback, used to clean up session state |

### WebSocket
| Path | Description |
|---|---|
| `ws://localhost:8000/ws/calls` | Push-only broadcast. All connected clients receive real-time call events. |

WebSocket event types:
- `call_started` → `{ type, call_sid, campaign_id, campaign_name }`
- `user_spoke` → `{ type, call_sid, text }`
- `ai_replied` → `{ type, call_sid, text, intent, emotion }`
- `call_ended` → `{ type, call_sid, status }`

---

## 6. SSE Streaming Endpoint — `/api/simulate/turn/stream`

This is the **primary path for the Call Simulator**. Architecture:

```
Frontend fetch (POST form)
    ↓
FastAPI async handler
    ↓
asyncio.Queue created
    ↓
threading.Thread(run_streaming) launched
    ↓  [background thread]
    local_ai.get_ai_response_streaming() → generator
        yields {"type":"sentence", "text":"..."} per sentence
        yields {"type":"intent", "intent":"...", "emotion":"..."} at end
    ↓
    each chunk → loop.call_soon_threadsafe(queue.put_nowait, chunk)
    ↓
[async event_generator()]
    awaits queue.get() with 45s timeout
    ↓
    "sentence" chunk:
        → generate_tts(text) in thread → audio_url
        → yield SSE: data: {"type":"sentence","text":"...","audio_url":"..."}
    ↓
    "intent" chunk:
        → keyword_grounding override on top of LLM intent
        → append to session context
        → yield SSE: data: {"type":"done","intent":"...","emotion":"...","full_reply":"..."}
    ↓
    "error" chunk:
        → yield SSE: data: {"type":"error","error":"OLLAMA_OFFLINE|OLLAMA_TIMEOUT|AI_ERROR","message":"..."}
    ↓
StreamingResponse(event_generator(), media_type="text/event-stream")
```

**SSE event format** (each line ending in `\n\n`):
```
data: {"type": "sentence", "text": "...", "audio_url": "http://localhost:8000/static/tts_xxx.wav"}

data: {"type": "done", "intent": "Interested", "emotion": "EXCITED", "full_reply": "..."}

data: {"type": "error", "error": "OLLAMA_OFFLINE", "message": "..."}
```

---

## 7. Local AI Module (`local_ai.py`)

### Emotional Intelligence System

Nandita detects emotion from caller speech and adapts her response style. The system is a **dual-layer architecture**:
1. **Keyword grounding** — deterministic pattern matching overrides LLM intent when strong signals found (e.g. "not interested", "call back")
2. **LLM emotion + intent** — fallback for ambiguous turns

### Emotion detection
10 emotions: `ANGRY, FRUSTRATED, EXCITED, INTERESTED, CONFUSED, HESITANT, DISINTERESTED, SAD, NEUTRAL, HAPPY`

Response strategy per emotion:
- **ANGRY/FRUSTRATED** → De-escalate immediately. Do NOT pitch. Apologize.
- **EXCITED/INTERESTED** → Match energy. Move toward close. Ask qualifying questions.
- **CONFUSED** → Slow down. One piece of info at a time. Offer to re-explain.
- **HESITANT** → Identify specific objection and address it directly.
- **DISINTERESTED/SAD** → Empathetic. Don't push. Offer info by email/text instead.
- **NEUTRAL/HAPPY** → Warm open question to draw them in.

### Critical roleplay enforcement
The system prompt starts with ALL CAPS anti-hallucination instructions:
```
CRITICAL ROLEPLAY INSTRUCTIONS:
- You are CURRENTLY on a LIVE voice call with a human prospect.
- NEVER break character. NEVER mention you are an AI.
- NEVER offer to "help write a script" or "come up with ideas".
- Respond directly to what the user says as if you are the person making the sales call.
- Start speaking immediately in character.
```
> **Why this matters:** Llama 3.2 defaults to "helpful AI assistant" mode when given campaign context — it tries to write scripts FOR the user instead of playing Nandita. The CAPS override forces it to stay in-character.

### Functions

#### `get_ai_response_streaming(prompt, context, business_context, script, knowledge_base)`
- Generator function using `stream=True` against Ollama
- Buffers tokens and yields `{"type":"sentence","text":"..."}` the moment a `.`, `!`, or `?` boundary is found
- At end of stream, extracts `[EMOTION:X][INTENT:Y]` tags from full reply
- Yields `{"type":"intent","intent":"...","emotion":"...","full_reply":"..."}`
- Strips tags from yielded sentence text (not spoken aloud)
- Prompt format: reply text + `[EMOTION:X][INTENT:Y]` at end

#### `generate_ai_response(prompt, context, business_context, script, knowledge_base)`
- Non-streaming, used exclusively by **Twilio webhook path**
- Calls `POST http://localhost:11434/api/chat` with `stream: False`
- Parses structured `Emotion: / Reply: / Intent:` format from LLM output
- Returns `{ reply, intent, emotion, raw, error }`
- Error types: `OLLAMA_OFFLINE`, `OLLAMA_TIMEOUT`, `AI_ERROR`
- Keyword grounding applied inside this function too

#### `score_call(transcript)`
- Independent QA Analyst call at end of simulation
- `temperature: 0.1` for deterministic scoring
- Forces strict JSON: `{ "summary": "...", "lead_score": 5, "final_intent": "Not Interested" }`
- Returns `{ summary, lead_score, final_intent }`

#### `_classify_intent_from_user(user_text)` (private)
- Keyword-matching function for grounding LLM intent
- Priority: `Not Interested` > `Callback` > `Interested` > `None`
- Returns `None` if ambiguous (defers to LLM)

**Active model:** `llama3.2` (3B). `mistral:latest` also available but causes OOM on laptops during concurrent Twilio + simulator load.

---

## 8. Local Audio (`local_audio.py`)

- `generate_tts(text)` → uses `pyttsx3` to save audio to `./static/tts_<uuid>.wav`
- Configured to select **first available female voice** (Microsoft Zira on Windows)
- Returns the **filename** (not full path). Frontend prepends `http://localhost:8000/static/`
- **Twilio exception:** pyttsx3 is NOT used for real calls. TwiML `<Say voice="Polly.Aditi">` (Indian English female) is used directly.

---

## 9. Twilio Integration (`twilio_calls.py` + `main.py`)

### `twilio_calls.py` — Lazy Client Init
The Twilio client is **NOT initialized at module import time** (it was a bug — env vars weren't loaded yet). Instead:
- `_get_client()` reads `os.getenv()` on every call
- `make_demo_call()` calls `load_dotenv(override=True)` first to pick up any `.env` changes since startup

### How a demo call works:
1. Frontend Dashboard → `POST /api/demo/call { campaign_id }`
2. `make_demo_call()` Twilio-dials `DEMO_PHONE_NUMBER` from `TWILIO_PHONE_NUMBER`
3. Twilio webhook: `{NGROK_URL}/twilio/voice?campaign_id=X`
4. `/twilio/voice` fires → stores `{ messages, context, script, knowledge_base }` in `twilio_sessions[call_sid]`, broadcasts `call_started` via WebSocket, sends TwiML `<Say>` greeting + `<Gather>`
5. Customer speaks → `/twilio/gather` processes `SpeechResult`
6. Calls `generate_ai_response(prompt=..., context=..., business_context=..., script=..., knowledge_base=...)` — **keyword args required**
7. Broadcasts `user_spoke` + `ai_replied` (now includes `emotion` field)
8. Responds with TwiML `<Say voice="Polly.Aditi">` + next `<Gather speech_timeout=1>`
9. Call ends when LLM emits `[END_CALL]` or after 20 turns

### Error codes from `make_demo_call()`:
- `"twilio_not_configured"` → missing creds in .env
- `"missing_config"` → DEMO_PHONE_NUMBER or NGROK_URL missing
- `"error:<message>"` → Twilio SDK exception

### Required `.env` variables:
```
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx    # Provisioned Twilio number
DEMO_PHONE_NUMBER=+91xxxxxxxxx      # Target phone to dial
NGROK_URL=https://xxxx.ngrok-free.app  # Public tunnel to localhost:8000
```

> **NGROK_URL changes every time you restart ngrok** (on the free plan). Always update `.env` and call `make_demo_call()` which re-reads it via `load_dotenv(override=True)`.

> **`.env` encoding gotcha:** If the first character of `.env` looks garbled (e.g. `765treTWILIO_ACCOUNT_SID=...`), the file was saved as UTF-16 by Windows Notepad. Fix by rewriting line 1 or saving as UTF-8 encoding.

---

## 10. Frontend — Pages & Routes

Routes defined in `App.tsx`:
| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard` | KPI metrics, call logs table, live call overlay, activity feed |
| `/campaigns/new` | `Campaign` | 3-step wizard to create campaigns |
| `/simulate` | `CallSimulator` | SSE streaming hands-free AI call simulation |
| `/live` | `LiveCallDashboard` | Dedicated real-time Twilio call monitor |

### `App.tsx` — Global Infrastructure
- `ToastContainer`: Global toast system. Triggered via exported `showToast(message, type)` function that dispatches a `CustomEvent('dialora-toast', ...)` on `window`.
- NavLink: Active route detection with cyan left-border indicator + lucide icon.
- Sidebar: Spinning conic-gradient Dialora logo, nav links, live AI engine status (polls `/api/health/ollama` every 10s), version badge.
- Background: `#0a0f1e` main, `#080c17` sidebar.

### `Dashboard.tsx`
- **AnimatedCounter**: Counts up 0→target on mount (1500ms, 16ms ticks).
- **Metric cards**: Total Calls, Conversion Rate, Active Campaigns — SVG sparkline, color-coded top border.
- **Recent Call Logs table**: Clicking row opens Log Viewer Modal with full transcript replay.
- **Live Activity Feed**: Timeline of recent calls + CSV uploads.
- **Live Demo Call Modal** — two states:
  - **Twilio NOT configured**: Shows amber warning + `.env` setup guide with all 5 required keys, step-by-step instructions, "Re-check Config" button
  - **Twilio configured**: Green badge + campaign selector + dial button
- **Live Call Monitor (WebSocket)**: LIVE badge, intent badge, call timer, real-time transcript bubbles. Auto-scrolls. Disappears on `call_ended`.
- **Log Viewer Modal**: Full historical transcript with QA summary.
- All `alert()` calls replaced with `showToast()`.

### `Campaign.tsx` — 3-Step Wizard
- Step 1: Campaign name + category
- Step 2: `business_context`, `script`, `knowledge_base` textareas
- Step 3: Drag-and-drop CSV upload (`name,phone_number` format)
- On success: routes to success screen → redirects to `/` after 2.5s

### `CallSimulator.tsx` — Streaming Call Simulation
**This is the core feature of the app.**

#### Call flow:
1. User clicks **"Start Audio Session"** → `startCall()` activates `webkitSpeechRecognition`
2. Recognition runs continuously (`continuous: true`, `lang: 'en-IN'`)
3. Non-final results → live "listening bubble" in chat
4. On `.isFinal` → `handleTurn(transcript)` fires
5. Mic pauses (`recognition.stop()`)
6. Empty streaming AI bubble appears immediately (loading spinner)
7. `fetch('POST /api/simulate/turn/stream')` opened as SSE stream
8. `sentence` events → bubble text grows word-by-word, first audio queued immediately
9. `done` event → emit received, streaming cursor removed, last user bubble retroactively tagged with detected emotion
10. Audio queue finishes → mic resumes (`recognition.start()`)

#### Emotion UI:
- **EMOTION_CONFIG** defines 10 emotions with `{ emoji, color, glow, label }`:
  - `ANGRY` 😠 red, `FRUSTRATED` 😤 orange, `EXCITED` 🤩 yellow
  - `INTERESTED` 😊 green, `CONFUSED` 😕 blue, `HESITANT` 🤔 purple
  - `DISINTERESTED` 😑 gray, `NEUTRAL` 😐 slate, `HAPPY` 😄 cyan, `SAD` 😢 indigo
- **Live Emotion Badge** in header — updates every turn with glowing pill
- **Emotion pill** retroactively tagged under each user bubble on `done` event (only shown for non-NEUTRAL)
- **Post-call summary** shows "Last Emotion" card alongside Lead Score + Final Intent

#### Audio Queue:
```javascript
const audioQueue: string[] = [];
let isPlayingAudio = false;
// Each sentence audio URL is pushed. playNextAudio() chains via audio.onended
// Mic only resumes after: streamDone === true AND audioQueue.length === 0
```

#### Streaming bubble animation:
- Empty content + `streaming: true` → loading spinner + "Nandita is thinking..."
- Non-empty content + `streaming: true` → text + blinking cyan cursor
- `streaming: false` → static bubble

#### Text fallback:
- Input at bottom for typing messages when mic fails

#### End call:
- Stops recognition → `POST /api/simulate/end` → backend scores via `score_call()` → saves `CallLog`
- Shows Post-Call Summary: animated SVG arc gauge, Final Intent badge, Last Emotion badge, QA summary quote
- Score ≥ 7 → CSS confetti animation

### `LiveCallDashboard.tsx` — Dedicated Live Monitor
- WebSocket to `ws://localhost:8000/ws/calls` with 3s auto-reconnect
- **IntentMeter**: Visual progress bar (Not Interested → Neutral → Interested) with glow
- Real-time transcript, session stats, recent call history sidebar

---

## 11. Tailwind CSS Design System

Custom tokens in `tailwind.config.js`:
```js
colors: {
  'dialora-navy': '#0a0f1e',     // Page background
  'dialora-card': '#111827',     // Card background
  'dialora-accent': '#2ee2a3',   // Teal green (primary accent)
  'dialora-indigo': '#5c33ff',   // Purple (secondary)
  'dialora-success': '#10b981',  // Green success
}
```

Custom animations:
- `animate-fade-in` — opacity 0→1, translateY 10px→0
- `animate-shimmer` — loading skeleton shimmer
- `animate-soundwave` — bouncing bars for mic listening indicator
- `confetti` — CSS keyframe drop animation for post-call success
- `hover-slide-right` — nav item subtle rightward hover

---

## 12. How To Run The App

### Prerequisites
- Python 3.13 virtual environment
- Ollama installed and running: `ollama serve` + `ollama pull llama3.2`
- Node.js 18+
- (Optional for real calls) Twilio account + Ngrok

### Backend
```powershell
# From: c:\Users\hunte\Fantastic Four - Dialora\backend\
.env\Scripts\activate
pip install -r requirements.txt   # only first time
uvicorn main:app --reload --port 8000
```

### Frontend
```powershell
# From: c:\Users\hunte\Fantastic Four - Dialora\frontend\
npm install   # only first time
npm run dev   # Starts Vite dev server at http://localhost:5173
```

### For Twilio Live Calls
1. Start Ngrok: `ngrok http 8000`
2. Update `NGROK_URL` in `backend/.env`
3. The backend picks up the new URL automatically on next call (via `load_dotenv(override=True)`)
4. Click "Live Demo Call" on the Dashboard

---

## 13. Known Issues & Gotchas

- **`requirements.txt` encoding:** The `twilio` line may have garbled UTF-16 encoding. If `pip install` fails, manually run `pip install twilio>=8.0.0`.
- **Chrome-only STT:** `webkitSpeechRecognition` only works in Google Chrome. Firefox/Safari show an alert and refuse.
- **`pyttsx3` event loop:** On the Twilio call path, pyttsx3 blocks the async event loop. Use `Polly.Aditi` TwiML `<Say>` exclusively for Twilio calls.
- **Ollama cold start:** First request after `ollama serve` can take 15–30 seconds. The simulator shows "still thinking" message after 20s.
- **Historical transcript parsing:** Legacy call logs may have malformed transcript JSON. Backend `GET /api/calllogs` wraps `json.loads()` in try/except.
- **SQLite threading:** `connect_args={"check_same_thread": False}` set in `database.py`.
- **No auth:** Hackathon MVP. All APIs are open.
- **Llama character break:** Without the CRITICAL ROLEPLAY INSTRUCTIONS preamble, Llama 3.2 interprets campaign context as a request to help write scripts rather than act as Nandita. Never remove these lines.
- **NGROK_URL stale:** NGROK_URL changes on every `ngrok` restart. Always update `.env`. The frontend "Re-check Config" button re-fetches health status so the modal updates without page reload.
- **`.env` UTF-16 corruption:** Windows Notepad may save `.env` as UTF-16. If `TWILIO_ACCOUNT_SID` shows garbled prefix (e.g. `765tre`), rewrite the line using the editor or a tool that saves as UTF-8.
- **Twilio `speech_timeout`:** Set to `1` second (not `"auto"`) for faster turn-taking on live calls. `"auto"` causes Twilio to wait too long after each utterance.

---

## 14. What Has Been Completed (Full Feature List)

### Core Infrastructure
- [x] FastAPI backend with SQLite ORM (Campaign, Contact, CallLog models)
- [x] Local LLM integration via Ollama (`llama3.2`)
- [x] Campaign creation API + 3-step frontend wizard
- [x] CSV contact upload (no Pandas) → links to campaigns
- [x] Dashboard: animated KPI counters, call log table, activity feed, log viewer modal
- [x] CSV export endpoint (`/api/export/csv`)
- [x] Global toast notification system (replaces all `alert()` calls)
- [x] Ollama health check + status indicator in sidebar
- [x] "Linear-style" dark premium UI (glassmorphism, glows, micro-animations)

### Call Simulator
- [x] Browser-native STT via `webkitSpeechRecognition` (Chrome only)
- [x] Offline TTS via `pyttsx3` → static WAV files
- [x] Continuous hands-free mode with auto mic suspend/resume
- [x] Chrome 60s STT timeout resilience (auto-restart on `onend`)
- [x] Text fallback input for when mic fails
- [x] Intent classification: real-time `Interested / Not Interested / Neutral`
- [x] Keyword-based intent grounding (overrides LLM hallucinations)
- [x] End-call QA scoring: `lead_score 0-10 + summary + final_intent`
- [x] Post-call summary screen with animated gauge + confetti for score ≥ 7

### Emotional Intelligence (Session 3)
- [x] 10-emotion detection: ANGRY, FRUSTRATED, EXCITED, INTERESTED, CONFUSED, HESITANT, DISINTERESTED, SAD, NEUTRAL, HAPPY
- [x] Tone adaptation per emotion (de-escalation, energy matching, simplification, objection handling)
- [x] Strict roleplay enforcement to prevent Llama character breaks
- [x] Live Emotion Badge in simulator header (updates every turn)
- [x] Emotion pill retroactively tagged under user chat bubbles
- [x] Emotion shown on post-call summary card
- [x] `emotion` field broadcast in WebSocket `ai_replied` events

### Low-Latency Streaming (Session 3)
- [x] `get_ai_response_streaming()` — Ollama `stream=True` generator
- [x] Sentence-boundary detection → yields each sentence immediately
- [x] `[EMOTION:X][INTENT:Y]` end-tags stripped from spoken sentences
- [x] `/api/simulate/turn/stream` SSE endpoint (threading + asyncio.Queue bridge)
- [x] Per-sentence TTS generation in background thread
- [x] Frontend audio queue: sentence 1 plays while sentence 2 is being generated
- [x] Streaming bubble: loading spinner → growing text → blinking cursor → static
- [x] Mic only resumes after last audio finishes (`streamDone + !isPlayingAudio`)

### Twilio Integration
- [x] Outbound calling via Twilio SDK → Ngrok webhook tunnel
- [x] Real-time WebSocket broadcast of Twilio call events
- [x] Live call overlay on Dashboard (LIVE badge, real-time transcript, timer)
- [x] Dedicated Live Call Monitor page (`/live`) with auto-reconnect WebSocket
- [x] Lazy Twilio client init (reads env at call time, not import time)
- [x] `load_dotenv(override=True)` on every call — ngrok URL changes without restart
- [x] Twilio setup guide modal (shows `.env` key template + step-by-step setup)
- [x] Polly.Aditi (Indian English female) voice for Twilio calls
- [x] Campaign KB (`business_context`, `script`, `knowledge_base`) injected into Twilio sessions
- [x] `[END_CALL]` signal handling → graceful hangup
- [x] `speech_timeout=1` for fast turn-taking

---

## 15. Session History Summary

| Session | Key work |
|---|---|
| Session 1 | Initial build: FastAPI backend, Ollama integration, Campaign + Contact models, basic simulator |
| Session 2 | Dashboard analytics, CSV upload, call log scoring, Twilio integration, premium UI overhaul |
| Session 3 | Latency reduction (SSE streaming), Emotional Intelligence (10 emotions), Twilio bug fixes, Nandita persona |
| **Session 4 (current)** | `.env` UTF-16 fix, Twilio setup guide modal, fixed `generate_ai_response` arg order, lazy Twilio client, roleplay enforcement, GitHub push |
