# Dialora MVP - Knowledge Handoff

This document tracks the current state, technical decisions, and architecture of the Dialora Hackathon MVP. It is designed to provide complete context of the localized pipeline we have built.

## 1. Project Background
Dialora is an AI-powered tele-calling agent. Originally designed using Twilio, Anthropic API, and ElevenLabs, it was completely redesigned during the 2026 hackathon into a **100% Free, Fully Local** application. 

## 2. Technical Stack & Architecture

### Backend Stack (Python 3.13)
- **Framework**: `FastAPI` + `uvicorn`
- **Database**: SQLite (managed through standard `SQLAlchemy` ORM)
- **Local LLM Integration**: Uses local HTTP requests to an `Ollama` instance running on `localhost:11434`. 
- **Offline TTS**: Uses the `pyttsx3` Python library to instantly export text into WAV audio.
- *Note on Python 3.13 Constraints*: We initially attempted to use `openai-whisper` and `SpeechRecognition` for backend Speech-To-Text (STT). However, Python 3.13 drops support for the `aifc` legacy module, critically breaking those modules. We successfully pivoted the entire STT architecture to the browser (see Frontend Stack).

### Frontend Stack (React + TypeScript)
- **Engine**: Vite
- **Styling**: Tailwind CSS (Specifically downgraded to **v3.4.17** natively after Vite's Tailwind v4 plugin failed to resolve CSS nesting cleanly). 
- **The Simulator UI Wow Feature**: The `/simulate` page boasts dynamic CSS, chat bubbles, and a real-time **Live Intent Indicator** analyzing Ollama's intent tags instantly (`Interested`, `Not Interested`, `Neutral`).
- **Browser Native STT**: The Frontend implements `window.webkitSpeechRecognition`. It captures the user's voice, transcribes it securely in Google Chrome natively, and passes the **perfect raw text** via a `FormData` POST to the FastAPI backend. *This solves the entire Python 3.13 backend audio crisis while preserving the 100% free constraint.*

## 3. Workflow Diagram

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

## 4. Current State (DONE)
- [x] Legacy dependency code stripped and clean virtual environment created via `python -m venv venv`.
- [x] Backend database schemas built (`Campaign`, `Contact`, `CallLog`).
- [x] Emotion-aware prompting embedded natively into `local_ai.py`.
- [x] Custom Dashboard React elements and Call Simulator coded entirely.
- [x] Initial `.gitignore` applied avoiding 1 GB Python caches. 
- [x] **Phase 2 Complete:** Campaign Creation UI fully wired to SQLite.
- [x] **Phase 2 Complete:** Built native CSV Uploading (no Pandas needed) to attach Contacts to a specific Campaign.
- [x] **Phase 2 Complete:** The Call Simulator now features a dynamic Dropdown tying specific Campaigns to the AI Context.
- [x] **Phase 2 Complete:** Implemented End Call logic. When the call ends, the transcript is fired back through Ollama with a `QA Analyst` instruction prompt to assign a numerical `lead_score` dynamically.
- [x] **Phase 2 Complete:** Dashboard now successfully parses the SQL database real-time to compute Conversion Rates and exports a native CSV file on demand.
- [x] **Phase 3 Complete:** Redesigned the Simulator UX into a "Continuous Hands-Free Call Mode". Relegated the hold-to-talk mic button to a massive `Start Call` hero graphic. Integrated auto-trigger transcripts through `.isFinal` pauses, and engineered smart microphone pausing while the AI's `pyttsx3` voice stream plays.

### Next Steps for Handoff
- Full system test and demo recording.
- Pushing to remote repository via `git push`.

## 5. UI & Continuous Call Deep Dive
### The Simulator Paradigm Shift
The Call Simulator was successfully refactored from a "Walkie-Talkie" interaction loop into a fully autonomous, Hands-Free **Continuous Call** architecture. This represents the ultimate product vision for the Hackathon application.

**1. STT (Speech-To-Text) Continuous Native Processing:**
`webkitSpeechRecognition` handles capturing audio directly from the browser window. We employ a strict `callActiveRef` tracker to stabilize its behavior. 
- **Continuous Mode** is explicitly enabled (`recognition.continuous = true;`).
- **Chrome Limit Resilience**: Google Chrome is notorious for imposing a ~60 second hard cut-off on SpeechRecognition listeners as an internal security measure. To combat this, our `.onend` event permanently listens for `callActiveRef.current`. If the application determines the call is actively underway, it automatically catches the dropped promise and forcefully calls `recognition.start()` to seamlessly overcome the network cut.

**2. Eager Payload Firing on Silence (isFinal):**
We have permanently removed the visual mic press interaction. The system evaluates the `.isFinal` flag returned natively by the browser STT matrix. 
- As the user formulates their sentences, non-final text pushes iteratively into the `liveTranscript` interface, floating inside the chat timeline so the user clearly sees ambient real-time input capture.
- As soon as the user pauses their breath, `.isFinal` flips to `true`. This single interaction instantly commits the transcribed string block, dumps the ambient memory, resets the UI, builds a literal `user` chat bubble inline, and fires the async POST request up to FastAPI—all without requiring a single click.

**3. Graceful Recognition Suspending (Feedback Loop Prevention):**
The most critical issue with continuous ambient desktop listening is that the system's own external speakers playing the AI voice will inevitably be picked up by the microphone, creating an endless LLM feedback loop!
To mitigate this safely, right before we make the `.play()` command on the returned `pyttsx3` audio stream:
- `recognitionRef.current.stop()` is explicitly called so the microphone suspends gracefully.
- We bind `audio.onended = () => { ... }` so that the exact absolute millisecond the AI finishes articulating its generated response, `recognition.start()` re-executes natively, pulling the user right back into the ambient loop effortlessly.
