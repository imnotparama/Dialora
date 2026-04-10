import React, { useState, useRef, useEffect } from 'react';
import { Mic, Activity, PhoneOff, Send, RotateCcw, LayoutDashboard, BarChart2, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

// ─── Types ─────────────────────────────────────────────────────────────────
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  id?: number;
  streaming?: boolean;
  emotion?: string;
}

// ─── Shared audio queue helpers (module-level refs) ────────────────────────
let globalAudioQueue: string[] = [];
let globalIsPlayingAudio = false;
let globalSetIsSpeaking: ((v: boolean) => void) | null = null;
let globalResumeMicFn: (() => void) | null = null;
let globalStreamDone = false;

function playNextAudio() {
  if (globalAudioQueue.length === 0) {
    globalIsPlayingAudio = false;
    globalSetIsSpeaking?.(false);
    if (globalStreamDone) globalResumeMicFn?.();
    return;
  }
  globalIsPlayingAudio = true;
  globalSetIsSpeaking?.(true);
  const url = globalAudioQueue.shift()!;
  const audio = new Audio(url);
  audio.onended = playNextAudio;
  audio.onerror = playNextAudio;
  audio.play().catch(() => playNextAudio());
}

function enqueueAudio(url: string) {
  globalAudioQueue.push(url);
  if (!globalIsPlayingAudio) playNextAudio();
}

export default function CallSimulator() {
  const navigate = useNavigate();
  const [callActive, setCallActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [intent, setIntent] = useState<string>('Neutral');
  const [intentHistory, setIntentHistory] = useState<string[]>(['Neutral']);
  const [currentEmotion, setCurrentEmotion] = useState<string>('NEUTRAL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [selectedCampaignName, setSelectedCampaignName] = useState<string>('');
  const [isEnding, setIsEnding] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [callDuration, setCallDuration] = useState(0);
  const [textFallback, setTextFallback] = useState('');
  const [postCallSummary, setPostCallSummary] = useState<any>(null);
  const [sessionMsgCount, setSessionMsgCount] = useState(0);

  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Wire module-level refs to component state
  useEffect(() => {
    globalSetIsSpeaking = setIsSpeaking;
  }, []);

  useEffect(() => {
  const check = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:8000/api/health/ollama`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'online') {
          setOllamaStatus('online');
          return;
        }
      }
    } catch {}
    setOllamaStatus('offline');
  };
  check();
  const interval = setInterval(check, 10000);
  return () => clearInterval(interval);
}, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  useEffect(() => {
    fetch(`http://${window.location.hostname}:8000/api/campaigns`).then(res => res.json()).then(data => {
      setCampaigns(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) {
        setSelectedCampaign(data[0].id.toString());
        setSelectedCampaignName(data[0].name);
      }
    }).catch(console.error);

    const fd = new FormData();
    fd.append('session_id', sessionId);
    fetch(`http://${window.location.hostname}:8000/api/simulate/start`, { method: 'POST', body: fd }).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    let timer: any;
    if (callActive) timer = setInterval(() => setCallDuration(p => p + 1), 1000);
    return () => clearInterval(timer);
  }, [callActive]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const formatChatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getIntentColorBox = (int: string) => {
    const s = (int || '').toUpperCase();
    if (s.includes('NOT')) return 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] border border-red-400';
    if (s.includes('INTERESTED')) return 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)] border border-green-400';
    return 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)] border border-amber-400';
  };
  const getIntentDot = (int: string) => {
    const s = (int || '').toUpperCase();
    if (s.includes('NOT')) return 'bg-red-500';
    if (s.includes('INTERESTED')) return 'bg-green-500';
    return 'bg-amber-500';
  };
  const getScoreColor = (sc: number) => sc >= 8 ? '#22c55e' : sc >= 5 ? '#f59e0b' : '#ef4444';

  const resumeMic = () => {
    if (callActiveRef.current && recognitionRef.current) {
      try { recognitionRef.current.start(); } catch (e) {}
    }
  };

  // ─── SSE stream consumer (shared by greeting + turn) ─────────────────────
  const consumeStream = async (
    url: string,
    formData: FormData,
    aiMsgId: number,
    isGreeting = false
  ) => {
    globalStreamDone = false;
    globalResumeMicFn = resumeMic;

    try {
      const res = await fetch(url, { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: `⚠️ ${errData.detail?.message || 'Backend error'}`, streaming: false }
            : m
        ));
        setIsProcessing(false);
        if (!isGreeting) resumeMic();
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let data: any;
          try { data = JSON.parse(raw); } catch { continue; }

          if (data.type === 'sentence') {
            accumulated += (accumulated ? ' ' : '') + data.text;
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, content: accumulated } : m
            ));
            if (data.audio_url) enqueueAudio(data.audio_url);
          }

          if (data.type === 'done') {
            if (!isGreeting) {
              const newIntent = data.intent || 'Neutral';
              const newEmotion = data.emotion || 'NEUTRAL';
              setIntent(newIntent);
              setCurrentEmotion(newEmotion);
              setIntentHistory(prev => {
                const next = [...prev, newIntent];
                return next.length > 5 ? next.slice(-5) : next;
              });
              setMessages(prev => {
                const msgs = [...prev];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === 'user' && !msgs[i].emotion) {
                    msgs[i] = { ...msgs[i], emotion: newEmotion };
                    break;
                  }
                }
                return msgs;
              });
            }
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, streaming: false } : m
            ));
            setIsProcessing(false);
            globalStreamDone = true;
            if (!globalIsPlayingAudio && globalAudioQueue.length === 0) {
              setIsSpeaking(false);
              resumeMic();
            }
          }

          if (data.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId
                ? { ...m, content: `⚠️ ${data.message || 'Error'}`, streaming: false }
                : m
            ));
            if (data.error === 'OLLAMA_OFFLINE') setOllamaStatus('offline');
            setIsProcessing(false);
            globalStreamDone = true;
            setIsSpeaking(false);
            if (!isGreeting) resumeMic();
          }
        }
      }
    } catch (e) {
      console.error('[SSE error]', e);
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, content: '⚠️ Network error. Is the backend running?', streaming: false }
          : m
      ));
      setIsProcessing(false);
      setIsSpeaking(false);
      if (!isGreeting) resumeMic();
    }
  };

  // ─── Auto-greeting when call starts ──────────────────────────────────────
  const handleGreeting = async () => {
    setIsProcessing(true);
    const aiMsgId = Date.now();
    setMessages([{
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      id: aiMsgId,
      streaming: true
    }]);
    setSessionMsgCount(1);

    const fd = new FormData();
    fd.append('session_id', sessionId);
    if (selectedCampaign) fd.append('campaign_id', selectedCampaign);
    await consumeStream(`http://${window.location.hostname}:8000/api/simulate/greeting`, fd, aiMsgId, true);
  };

  // ─── Main turn handler ────────────────────────────────────────────────────
  const handleTurn = async (userText: string) => {
    setIsProcessing(true);
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) {} }

    const fd = new FormData();
    fd.append('session_id', sessionId);
    fd.append('user_text', userText);
    if (selectedCampaign) fd.append('campaign_id', selectedCampaign);

    const aiMsgId = Date.now() + 1;
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      id: aiMsgId,
      streaming: true
    }]);
    setSessionMsgCount(c => c + 1);

    await consumeStream(`http://${window.location.hostname}:8000/api/simulate/turn/stream`, fd, aiMsgId, false);
  };

  // ─── Start call + auto-greeting ───────────────────────────────────────────
  const startCall = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert('Please use Google Chrome for the microphone feature.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onresult = async (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal && transcript.length > 0) {
          setMessages(prev => [...prev, { role: 'user', content: transcript, timestamp: new Date() }]);
          setLiveTranscript('');
          await handleTurn(transcript);
        } else {
          setLiveTranscript(event.results[i][0].transcript);
        }
      }
    };
    recognition.onerror = (e: any) => {
      if (e.error === 'network') setLiveTranscript('Network error with STT.');
    };
    recognition.onend = () => {
      if (callActiveRef.current && !globalIsPlayingAudio) {
        try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    callActiveRef.current = true;

    // Reset audio queue state for new call
    globalAudioQueue = [];
    globalIsPlayingAudio = false;
    globalStreamDone = false;

    setCallActive(true);

    // Try to start mic — will pause during greeting audio playback
    try { recognition.start(); } catch (e) {}

    // Auto-trigger Nandita's opening line
    handleGreeting();
  };

  const handleFallbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textFallback.trim() || !callActive || isProcessing) return;
    const text = textFallback;
    setTextFallback('');
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    await handleTurn(text);
  };

  const handleEndCall = async () => {
    callActiveRef.current = false;
    globalAudioQueue = [];
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) {} }
    setCallActive(false);
    setLiveTranscript('');
    setIsSpeaking(false);

    const completedMessages = messages.filter(m => !m.streaming && m.content.length > 0 && !m.content.startsWith('⚠️'));
    if (completedMessages.length === 0) { navigate('/'); return; }

    setIsEnding(true);
    try {
      const payload = {
        campaign_id: selectedCampaign ? parseInt(selectedCampaign) : null,
        transcript: completedMessages.map(m => ({ role: m.role, content: m.content })),
        final_intent: intent
      };
      const res = await fetch(`http://${window.location.hostname}:8000/api/simulate/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.status === 'saved') {
        setPostCallSummary({ score: data.lead_score, summary: data.summary, intent: data.intent_tag });
      } else { navigate('/'); }
    } catch { navigate('/'); }
    finally { setIsEnding(false); }
  };

  const resetSimulation = () => {
    setPostCallSummary(null);
    setMessages([]);
    setIntent('Neutral');
    setIntentHistory(['Neutral']);
    setCurrentEmotion('NEUTRAL');
    setCallDuration(0);
    setSessionMsgCount(0);
    setIsSpeaking(false);
    globalAudioQueue = [];
    globalIsPlayingAudio = false;
  };

  const emotionCfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.NEUTRAL;

  return (
    <div className="flex flex-col h-full p-6 gap-4 relative">
      {/* Confetti */}
      {postCallSummary?.score >= 7 && (
        <div className="fixed inset-0 pointer-events-none z-50 flex justify-center">
          {['10%','30%','50%','70%','90%'].map((left, i) => (
            <div key={i} className="absolute top-[-10px] animate-[confetti_3s_ease-out_forwards]"
              style={{ left, width: 10, height: 10, backgroundColor: ['#22c55e','#3b82f6','#a855f7','#f59e0b','#06b6d4'][i], animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      {!postCallSummary && (
        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center bg-[#111827] px-5 py-4 rounded-2xl shadow-xl border border-gray-800/80 gap-4 relative z-20">
          <div className="flex items-center gap-5 flex-wrap">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-dialora-accent to-dialora-indigo bg-clip-text text-transparent cursor-default">
                Simulator Studio
                {selectedCampaignName && (
                  <span className="ml-2 text-sm font-normal text-gray-500">· {selectedCampaignName}</span>
                )}
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Campaign</span>
                <select
                  value={selectedCampaign}
                  onChange={e => {
                    setSelectedCampaign(e.target.value);
                    const found = campaigns.find(c => c.id.toString() === e.target.value);
                    setSelectedCampaignName(found?.name || '');
                  }}
                  disabled={callActive}
                  className="bg-[#1a2333] text-gray-200 border border-gray-700/50 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-dialora-indigo cursor-pointer w-[180px] disabled:opacity-50"
                >
                  <option value="">- Generic -</option>
                  {campaigns.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {callActive && (
              <div className="flex items-center gap-3 bg-[#0c1222] px-4 py-2 border border-gray-800 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-dialora-accent text-lg font-mono tracking-widest">{formatTime(callDuration)}</span>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-gray-500 text-xs">{sessionMsgCount} turns</span>
              </div>
            )}

            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center gap-2 bg-cyan-950/60 border border-cyan-700/40 px-3 py-1.5 rounded-xl animate-fade-in">
                <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-cyan-400 text-xs font-bold tracking-wider uppercase">Nandita speaking</span>
                <div className="flex items-end gap-0.5 h-3">
                  <div className="w-0.5 bg-cyan-400 rounded-full animate-soundwave" />
                  <div className="w-0.5 bg-cyan-400 rounded-full animate-soundwave" style={{ animationDelay: '0.1s' }} />
                  <div className="w-0.5 bg-cyan-400 rounded-full animate-soundwave" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Emotion Badge */}
            <div className="flex flex-col bg-[#0d1530] p-3 rounded-xl border border-gray-700/50 shadow-inner">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1.5">Caller Emotion</span>
              <div
                className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-500 ${emotionCfg.color}`}
                style={{ boxShadow: `0 0 14px ${emotionCfg.glow}40` }}
              >
                <span className="text-base leading-none">{emotionCfg.emoji}</span>
                <span className="tracking-wide">{emotionCfg.label.toUpperCase()}</span>
              </div>
            </div>

            {/* Intent Badge */}
            <div className="flex flex-col bg-[#0d1530] p-3 rounded-xl border border-gray-700/50 shadow-inner min-w-[150px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Intent</span>
                <div className="flex gap-1">
                  {intentHistory.slice(-5).map((int, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${getIntentDot(int)}`} />
                  ))}
                </div>
              </div>
              <div className={`px-3 py-1 rounded-xl text-white font-black text-xs tracking-widest text-center transition-all duration-300 ${getIntentColorBox(intent)}`}>
                {intent.toUpperCase()}
              </div>
            </div>

            {callActive && (
              <button onClick={handleEndCall} disabled={isEnding}
                className="flex items-center gap-2 bg-[#421518]/80 hover:bg-red-900/60 text-red-300 border border-red-500/30 px-5 py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 group">
                {isEnding ? <Activity className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                End Call
              </button>
            )}
          </div>
        </header>
      )}

      {ollamaStatus === 'offline' && !postCallSummary && (
        <div className="bg-[#301618] border border-red-500/50 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-red-400 text-lg animate-pulse">⚠️</span>
          <div>
            <p className="text-red-300 font-bold text-sm">Ollama Engine is Offline</p>
            <p className="text-red-400/80 text-xs mt-0.5">Run: <code className="bg-[#1c0d0e] px-1.5 py-0.5 rounded font-mono border border-red-900/50">ollama serve</code></p>
          </div>
        </div>
      )}

      {/* Chat Area */}
      {!postCallSummary ? (
        <div className="flex-1 bg-[#111827]/80 rounded-2xl flex flex-col border border-gray-800/80 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 custom-scrollbar">

            {!callActive && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-5 m-auto max-w-sm text-center animate-fade-in">
                <div className="w-24 h-24 bg-dialora-indigo/10 rounded-full flex items-center justify-center border border-dialora-indigo/20 shadow-[0_0_30px_rgba(92,51,255,0.2)]">
                  <Mic className="w-10 h-10 text-dialora-accent animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold text-white">Ready for Simulation</h2>
                <p className="text-gray-400 text-sm font-medium leading-relaxed">
                  Nandita will greet you automatically and adapt to your emotional state in real time.
                </p>
                <button
                  onClick={startCall}
                  disabled={ollamaStatus === 'offline'}
                  className={`mt-2 bg-gradient-to-b from-green-500 to-green-600 text-white font-bold px-12 py-4 rounded-full text-lg transition-all shadow-[0_0_25px_rgba(34,197,94,0.4)] ${ollamaStatus === 'offline' ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-[1.03] active:scale-95'}`}
                >
                  Start Audio Session
                </button>
                <p className="text-gray-600 text-xs">Chrome only · Microphone required</p>
              </div>
            )}

            {messages.map((m, i) => (
              <React.Fragment key={m.id ?? i}>
                {m.role === 'user' ? (
                  <div className="flex justify-end animate-fade-in">
                    <div className="flex gap-3 max-w-[78%] items-end">
                      <div className="flex flex-col items-end gap-1">
                        <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white rounded-2xl rounded-br-sm px-5 py-3 text-sm shadow-[0_4px_15px_rgba(147,51,234,0.3)]">
                          {m.content}
                        </div>
                        {m.emotion && m.emotion !== 'NEUTRAL' && (
                          <div
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all ${EMOTION_CONFIG[m.emotion]?.color || ''}`}
                            style={{ boxShadow: `0 0 8px ${EMOTION_CONFIG[m.emotion]?.glow || '#94a3b8'}30` }}
                          >
                            <span>{EMOTION_CONFIG[m.emotion]?.emoji}</span>
                            <span>{EMOTION_CONFIG[m.emotion]?.label.toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{formatChatTime(m.timestamp)}</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-500/50 flex items-center justify-center text-purple-300 text-xs font-bold shrink-0 select-none">U</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start animate-fade-in">
                    <div className="flex gap-3 max-w-[78%] items-end">
                      <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 text-xs font-bold shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.3)] select-none">N</div>
                      <div className="flex flex-col items-start gap-1">
                        <div className="bg-[#1c2336] border-l-4 border-cyan-500 text-gray-200 rounded-2xl rounded-bl-sm px-5 py-3 text-sm shadow-xl min-w-[110px]">
                          {m.content === '' && m.streaming ? (
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                              <span className="text-gray-400 animate-pulse font-medium text-xs">Nandita is thinking…</span>
                            </div>
                          ) : (
                            <>
                              {m.content}
                              {m.streaming && <span className="inline-block w-1.5 h-4 bg-cyan-400 animate-pulse rounded ml-1 -mb-0.5" />}
                            </>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase px-1">{formatChatTime(m.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* Listening bubble */}
            {callActive && !isProcessing && !isSpeaking && (
              <div className="flex justify-end animate-fade-in">
                <div className="flex gap-3 max-w-[78%] items-end">
                  <div className="bg-purple-900/40 border border-purple-500/30 rounded-2xl rounded-br-sm px-5 py-3 shadow-inner min-w-[120px] flex items-center gap-3">
                    <div className="flex items-end gap-1 h-4">
                      <div className="w-1 bg-purple-400 rounded-full animate-soundwave" />
                      <div className="w-1 bg-purple-400 rounded-full animate-soundwave" />
                      <div className="w-1 bg-purple-400 rounded-full animate-soundwave" />
                    </div>
                    <p className="text-purple-300 text-sm italic">{liveTranscript || 'Listening…'}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-500/30 flex items-center justify-center text-purple-300/50 text-xs font-bold shrink-0">U</div>
                </div>
              </div>
            )}

            <div ref={bottomRef} className="h-2" />
          </div>

          {/* Text fallback */}
          {callActive && (
            <div className="p-4 bg-[#0d1522] border-t border-gray-800 shrink-0">
              <form onSubmit={handleFallbackSubmit} className="relative max-w-4xl mx-auto flex items-center">
                <input
                  type="text"
                  value={textFallback}
                  onChange={e => setTextFallback(e.target.value)}
                  placeholder="Or type a message…"
                  disabled={isProcessing || isSpeaking}
                  className="w-full bg-[#1a2333] border border-gray-700 text-gray-300 placeholder-gray-500 rounded-full pl-5 pr-12 py-3 focus:outline-none focus:border-dialora-indigo text-sm transition-all disabled:opacity-40"
                />
                <button type="submit" disabled={isProcessing || isSpeaking || !textFallback.trim()}
                  className="absolute right-2 w-8 h-8 bg-dialora-indigo hover:bg-purple-500 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-colors">
                  <Send className="w-4 h-4 ml-[-1px]" />
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        /* Post-Call Summary */
        <div className="flex-1 flex items-center justify-center animate-fade-in">
          <div className="bg-[#111827] border border-gray-800/80 rounded-3xl p-10 max-w-2xl w-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1" style={{ backgroundColor: getScoreColor(postCallSummary.score) }} />
            <div className="absolute -top-32 w-64 h-64 blur-[100px] rounded-full pointer-events-none" style={{ backgroundColor: getScoreColor(postCallSummary.score), opacity: 0.12 }} />

            <h2 className="text-3xl font-black text-white mb-1">Simulation Complete</h2>
            <p className="text-gray-400 font-medium mb-8 flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4" /> Analytics Processed · {sessionMsgCount} turns
            </p>

            <div className="flex items-center gap-10 mb-8 flex-wrap justify-center">
              {/* Lead Score */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Lead Score</span>
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle cx="64" cy="64" r="56" fill="none" stroke="#1f2937" strokeWidth="12" />
                    <circle cx="64" cy="64" r="56" fill="none" stroke={getScoreColor(postCallSummary.score)} strokeWidth="12" strokeLinecap="round"
                      strokeDasharray="351.858"
                      strokeDashoffset={351.858 - (351.858 * postCallSummary.score / 10)}
                      className="transition-all duration-1000 ease-out" />
                  </svg>
                  <span className="text-4xl font-black text-white relative z-10">
                    {postCallSummary.score}<span className="text-xl text-gray-500 font-bold">/10</span>
                  </span>
                </div>
              </div>

              <div className="w-px h-20 bg-gray-800 hidden sm:block" />

              {/* Final Intent */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Final Intent</span>
                <div className={`px-5 py-2 rounded-2xl text-white font-black tracking-widest shadow-xl uppercase text-sm ${getIntentColorBox(postCallSummary.intent)}`}>
                  {postCallSummary.intent}
                </div>
              </div>

              <div className="w-px h-20 bg-gray-800 hidden sm:block" />

              {/* Last Emotion */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Last Emotion</span>
                <div
                  className={`px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 ${emotionCfg.color}`}
                  style={{ boxShadow: `0 0 12px ${emotionCfg.glow}40` }}
                >
                  <span className="text-xl">{emotionCfg.emoji}</span>
                  <span className="tracking-wider">{emotionCfg.label.toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="w-full bg-[#1a2333] border border-gray-700/50 rounded-2xl p-5 mb-8 relative">
              <BarChart2 className="w-7 h-7 text-gray-600 absolute -top-3.5 -left-3.5 bg-[#111827] rounded-full p-1 border border-gray-800" />
              <p className="text-gray-300 text-sm leading-relaxed font-medium italic">"{postCallSummary.summary}"</p>
            </div>

            <div className="flex gap-4 w-full">
              <button onClick={resetSimulation}
                className="flex-1 bg-gradient-to-r from-dialora-indigo to-cyan-500 hover:from-cyan-500 hover:to-dialora-indigo text-white font-bold py-3.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center justify-center gap-2 group">
                <RotateCcw className="w-5 h-5 group-hover:-rotate-90 transition-transform duration-300" /> Simulate Again
              </button>
              <button onClick={() => navigate('/')}
                className="flex-1 bg-[#1a2333] hover:bg-[#253147] border border-gray-700 text-gray-200 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2">
                <LayoutDashboard className="w-5 h-5" /> Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
