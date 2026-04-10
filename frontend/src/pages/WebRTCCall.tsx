import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Volume2, Activity } from 'lucide-react';
import { showToast } from '../App';
import { BACKEND_URL, WS_URL } from '../config';

// ─── Emotion Config ────────────────────────────────────────────────────────
const EMOTION_CONFIG: Record<string, { emoji: string; color: string; glow: string; label: string }> = {
  ANGRY:         { emoji: '😠', color: 'bg-red-900/60 text-red-300 border border-red-700/50',         glow: '#ef4444', label: 'Angry' },
  FRUSTRATED:    { emoji: '😤', color: 'bg-orange-900/60 text-orange-300 border border-orange-700/50', glow: '#f97316', label: 'Frustrated' },
  EXCITED:       { emoji: '🤩', color: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700/50', glow: '#eab308', label: 'Excited' },
  INTERESTED:    { emoji: '😊', color: 'bg-green-900/60 text-green-300 border border-green-700/50',    glow: '#10b981', label: 'Interested' },
  CONFUSED:      { emoji: '😕', color: 'bg-blue-900/60 text-blue-300 border border-blue-700/50',       glow: '#3b82f6', label: 'Confused' },
  HESITANT:      { emoji: '🤔', color: 'bg-purple-900/60 text-purple-300 border border-purple-700/50', glow: '#8b5cf6', label: 'Hesitant' },
  DISINTERESTED: { emoji: '😑', color: 'bg-gray-800/60 text-gray-400 border border-gray-700/50',       glow: '#6b7280', label: 'Disinterested' },
  NEUTRAL:       { emoji: '😐', color: 'bg-slate-800/60 text-slate-300 border border-slate-700/50',    glow: '#94a3b8', label: 'Neutral' },
  HAPPY:         { emoji: '😄', color: 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50',       glow: '#06b6d4', label: 'Happy' },
  SAD:           { emoji: '😢', color: 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50', glow: '#6366f1', label: 'Sad' },
};

interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
  emotion?: string;
  intent?: string;
}

// ─── Browser TTS queue ───────────────────────────────────────────────────────
let _speakQueue: string[] = [];
let _isSpeakingNow = false;
let _setSpeakingState: ((v: boolean) => void) | null = null;
let _onSpeakDone: (() => void) | null = null;

function _speakNext() {
  if (_speakQueue.length === 0) {
    _isSpeakingNow = false;
    _setSpeakingState?.(false);
    _onSpeakDone?.();
    return;
  }
  _isSpeakingNow = true;
  _setSpeakingState?.(true);
  const text = _speakQueue.shift()!;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-IN';
  utter.rate = 1.0;
  utter.pitch = 1.1;

  // Pick a female voice if available
  const voices = window.speechSynthesis.getVoices();
  const femaleVoice = voices.find(v =>
    /female|zira|hazel|susan|fiona|karen|samantha|victoria/i.test(v.name)
  );
  if (femaleVoice) utter.voice = femaleVoice;

  utter.onend = _speakNext;
  utter.onerror = _speakNext;
  window.speechSynthesis.speak(utter);
}

function _enqueueSpeech(text: string) {
  _speakQueue.push(text);
  if (!_isSpeakingNow) _speakNext();
}

function _stopSpeaking() {
  _speakQueue = [];
  _isSpeakingNow = false;
  window.speechSynthesis.cancel();
}

// ─── Soundwave animation ──────────────────────────────────────────────────
function SoundWave({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-full bg-[#2ee2a3] transition-all ${active ? 'animate-pulse' : ''}`}
          style={{
            height: active ? `${(i % 3) * 8 + 8}px` : '4px',
            animationDelay: `${i * 80}ms`,
            animationDuration: `${400 + i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default function WebRTCCall() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [callActive, setCallActive] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL');
  const [currentIntent, setCurrentIntent] = useState('Neutral');
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [isConnecting, setIsConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Register speaking setter
  useEffect(() => {
    _setSpeakingState = setIsSpeaking;
    // Preload voices
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    return () => { _setSpeakingState = null; };
  }, []);

  // Fetch campaigns
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/campaigns`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCampaigns(d); })
      .catch(() => {});
  }, []);

  // Call timer
  useEffect(() => {
    let t: ReturnType<typeof setInterval>;
    if (callActive) {
      t = setInterval(() => setCallDuration(p => p + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(t);
  }, [callActive]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Speech recognition ────────────────────────────────────────────────────
  const startRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported. Use Chrome.', 'error');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      if (callActiveRef.current && !_isSpeakingNow) {
        setTimeout(() => { if (callActiveRef.current) startRecognition(); }, 400);
      }
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      if (e.error === 'not-allowed') {
        showToast('Microphone access denied.', 'error');
        stopCall();
        return;
      }
      if (callActiveRef.current) {
        setTimeout(() => { if (callActiveRef.current) startRecognition(); }, 600);
      }
    };
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.trim();
      if (!transcript) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'user_speech', text: transcript }));
        setMessages(prev => [...prev, { role: 'user', text: transcript, timestamp: new Date() }]);
        setIsListening(false);
      }
    };

    try { recognition.start(); } catch {}
  };

  // ─── Start call ───────────────────────────────────────────────────────────
  const startCall = async () => {
    if (!window.speechSynthesis) {
      showToast('Browser TTS not supported. Use Chrome.', 'error');
      return;
    }
    setIsConnecting(true);
    _speakQueue = [];
    _isSpeakingNow = false;

    const ws = new WebSocket(`${WS_URL}/ws/webrtc/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'init', campaign_id: selectedCampaign || null }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'greeting' || data.type === 'sentence') {
          const text = data.text as string;
          // Add to transcript only once per complete message
          if (data.type === 'greeting') {
            setMessages(prev => [...prev, { role: 'ai', text, timestamp: new Date() }]);
          }
          // Speak client-side
          _enqueueSpeech(text);
          _onSpeakDone = () => {
            if (callActiveRef.current) startRecognition();
          };
        }

        if (data.type === 'done') {
          setCurrentEmotion((data.emotion || 'NEUTRAL').toUpperCase());
          setCurrentIntent(data.intent || 'Neutral');
          // Add full AI reply to transcript after done marker
        }

        if (data.type === 'call_ended') stopCall();
      } catch {}
    };

    ws.onclose = () => { if (callActiveRef.current) stopCall(); };
    ws.onerror = () => {
      showToast('WebSocket connection failed.', 'error');
      setIsConnecting(false);
    };

    // Wait for open
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    });

    setIsConnecting(false);
    setCallActive(true);
    callActiveRef.current = true;
    setMessages([]);
  };

  // ─── Stop call ────────────────────────────────────────────────────────────
  const stopCall = () => {
    callActiveRef.current = false;
    setCallActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    _stopSpeaking();

    try { recognitionRef.current?.stop(); } catch {}
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'end_call' }));
        wsRef.current.close();
      }
    } catch {}
    wsRef.current = null;
  };

  // Accumulate sentences into transcript per AI turn
  const sentenceBuffer = useRef<string[]>([]);

  const emotionCfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.NEUTRAL;

  const getIntentColor = (intent: string) => {
    const i = intent.toUpperCase();
    if (i.includes('NOT')) return 'text-red-400 bg-red-900/30 border-red-700/50';
    if (i.includes('INTERESTED')) return 'text-green-400 bg-green-900/30 border-green-700/50';
    if (i.includes('CALLBACK')) return 'text-amber-400 bg-amber-900/30 border-amber-700/50';
    return 'text-slate-300 bg-slate-800/40 border-slate-700/50';
  };

  // Track sentence accumulation
  useEffect(() => {
    if (!wsRef.current) return;

    const originalOnMessage = wsRef.current.onmessage;
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sentence') {
          sentenceBuffer.current.push(data.text);
          _enqueueSpeech(data.text);
          _onSpeakDone = () => { if (callActiveRef.current) startRecognition(); };
        }
        if (data.type === 'done') {
          if (sentenceBuffer.current.length > 0) {
            const fullText = sentenceBuffer.current.join(' ');
            setMessages(prev => [...prev, { role: 'ai', text: fullText, timestamp: new Date() }]);
            sentenceBuffer.current = [];
          }
          setCurrentEmotion((data.emotion || 'NEUTRAL').toUpperCase());
          setCurrentIntent(data.intent || 'Neutral');
        }
      } catch {}
      // Also call the original handler for greeting/call_ended
      if (typeof originalOnMessage === 'function') {
        const origData = JSON.parse(event.data);
        if (origData.type === 'greeting' || origData.type === 'call_ended') {
          (originalOnMessage as any)(event);
        }
      }
    };
  }, [callActive]);

  return (
    <div className="p-6 max-w-4xl mx-auto w-full animate-fade-in flex flex-col gap-6 h-full">

      {/* Header */}
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#2ee2a3] to-[#5c33ff] bg-clip-text text-transparent">
            WebRTC Live Call
          </h1>
          <p className="text-gray-400 text-sm mt-1">Browser microphone · Real-time AI conversation</p>
        </div>

        {callActive && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-mono bg-[#111827] px-3 py-1 rounded-full border border-gray-700">
              {formatTime(callDuration)}
            </span>
            <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1 rounded-full border border-red-500/40">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-bold tracking-widest">LIVE</span>
            </div>
          </div>
        )}
      </header>

      {/* Campaign Selector */}
      {!callActive && (
        <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Campaign Context (optional)
          </label>
          <select
            value={selectedCampaign}
            onChange={e => setSelectedCampaign(e.target.value)}
            className="w-full bg-[#0a0f1e] border border-gray-700 rounded-xl px-4 py-3 text-gray-300 focus:border-[#2ee2a3] focus:outline-none text-sm"
          >
            <option value="">— Generic Demo (no campaign) —</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-gray-500 text-xs">
            Selecting a campaign gives Nandita your business context, script, and knowledge base.
          </p>
        </div>
      )}

      {/* Status indicators */}
      {callActive && (
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${emotionCfg.color} transition-all duration-500`}
            style={{ boxShadow: `0 0 16px ${emotionCfg.glow}44` }}
          >
            <span className="text-lg">{emotionCfg.emoji}</span>
            <span>{emotionCfg.label}</span>
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border uppercase tracking-widest ${getIntentColor(currentIntent)}`}>
            <Activity className="w-3 h-3" />
            {currentIntent}
          </div>

          {isListening && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2ee2a3]/10 border border-[#2ee2a3]/40 text-[#2ee2a3] text-sm font-semibold animate-pulse">
              <Mic className="w-4 h-4" />
              Listening…
            </div>
          )}

          {isSpeaking && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[#5c33ff]/10 border border-[#5c33ff]/40 text-purple-300 text-sm font-semibold">
              <Volume2 className="w-4 h-4 animate-pulse" />
              Nandita is speaking
              <SoundWave active={true} />
            </div>
          )}
        </div>
      )}

      {/* Chat bubble area */}
      <div className="flex-1 bg-[#111827] border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 overflow-y-auto min-h-[320px] max-h-[420px] custom-scrollbar">
        {messages.length === 0 && !callActive && (
          <div className="m-auto flex flex-col items-center gap-4 text-gray-600 opacity-60 select-none">
            <div className="w-16 h-16 rounded-full bg-[#2ee2a3]/10 flex items-center justify-center">
              <Mic className="w-8 h-8 text-[#2ee2a3]/60" />
            </div>
            <p className="text-sm">Start a call to begin the conversation</p>
          </div>
        )}

        {messages.length === 0 && callActive && (
          <div className="m-auto flex flex-col items-center gap-3 text-gray-500">
            <div className="w-3 h-3 rounded-full bg-[#2ee2a3] animate-ping" />
            <p className="text-sm">Connecting to Nandita…</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'} animate-fade-in`}
          >
            <div className={`max-w-[78%] px-5 py-3 rounded-2xl text-sm shadow-lg leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#1a2333] text-gray-200 rounded-tl-none border border-gray-700/50'
                : 'bg-gradient-to-br from-[#5c33ff]/30 to-[#2ee2a3]/20 text-white rounded-tr-none border border-[#2ee2a3]/20'
            }`}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 opacity-50">
                {msg.role === 'user' ? '🎤 You' : '🤖 Nandita'}
              </div>
              {msg.text}
              <div className="text-[10px] opacity-30 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Call control */}
      <div className="flex justify-center">
        {!callActive ? (
          <button
            id="webrtc-start-btn"
            onClick={startCall}
            disabled={isConnecting}
            className="flex items-center gap-3 bg-gradient-to-r from-[#2ee2a3] to-[#5c33ff] hover:from-[#5c33ff] hover:to-[#2ee2a3] text-white font-bold px-10 py-4 rounded-full text-lg shadow-[0_0_30px_rgba(46,226,163,0.4)] transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <span className="animate-pulse">Connecting…</span>
            ) : (
              <>
                <Phone className="w-6 h-6 fill-current" />
                Start WebRTC Call
              </>
            )}
          </button>
        ) : (
          <button
            id="webrtc-stop-btn"
            onClick={stopCall}
            className="flex items-center gap-3 bg-red-600 hover:bg-red-500 text-white font-bold px-10 py-4 rounded-full text-lg shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all hover:scale-105"
          >
            <PhoneOff className="w-6 h-6" />
            End Call
          </button>
        )}
      </div>

      {!callActive && (
        <p className="text-center text-gray-600 text-xs">
          Requires Chrome with microphone access. Nandita speaks via your browser's built-in voice engine.
        </p>
      )}
    </div>
  );
}
