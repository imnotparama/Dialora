import React, { useState, useRef, useEffect } from 'react';
import { Mic, Activity, PhoneOff, Send, RotateCcw, LayoutDashboard, BarChart2 } from 'lucide-react';
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
  emotion?: string;  // detected caller emotion — tagged retroactively on user bubbles
}

export default function CallSimulator() {
  const navigate = useNavigate();
  const [callActive, setCallActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [intent, setIntent] = useState<string>('Neutral');
  const [intentHistory, setIntentHistory] = useState<string[]>(['Neutral']);
  const [currentEmotion, setCurrentEmotion] = useState<string>('NEUTRAL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState(() => Math.random().toString(36).substring(7));
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [isEnding, setIsEnding] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [callDuration, setCallDuration] = useState(0);
  const [textFallback, setTextFallback] = useState('');
  const [postCallSummary, setPostCallSummary] = useState<any>(null);

  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/health/ollama')
      .then(res => res.json())
      .then(data => setOllamaStatus(data.status === 'offline' ? 'offline' : 'online'))
      .catch(() => setOllamaStatus('offline'));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  // Timeout — updates streaming bubble if still empty after 20s
  useEffect(() => {
    if (!isProcessing) return;
    const timer = setTimeout(() => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.streaming && last.content === '') {
          return prev.map(m =>
            m.streaming && m.content === ''
              ? { ...m, content: 'Still waiting on Llama — the model may be loading. Please hold on.', streaming: false }
              : m
          );
        }
        return prev;
      });
    }, 20000);
    return () => clearTimeout(timer);
  }, [isProcessing]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => setMicPermission(true))
      .catch(() => setMicPermission(false));

    fetch('http://localhost:8000/api/campaigns').then(res => res.json()).then(data => {
      setCampaigns(data);
      if (data.length > 0) setSelectedCampaign(data[0].id.toString());
    }).catch(console.error);

    const fd = new FormData();
    fd.append('session_id', sessionId);
    fetch('http://localhost:8000/api/simulate/start', { method: 'POST', body: fd }).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    let timer: any;
    if (callActive) {
      timer = setInterval(() => setCallDuration(p => p + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [callActive]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const formatChatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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

  const getScoreColor = (sc: number) => {
    if (sc >= 8) return '#22c55e';
    if (sc >= 5) return '#f59e0b';
    return '#ef4444';
  };

  const startCall = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support the Web Speech API. Please use Chrome.');
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
      if (e.error === 'network') setLiveTranscript('Network error with speech recognition.');
    };
    recognition.onend = () => {
      if (callActiveRef.current) {
        try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;
    callActiveRef.current = true;
    try {
      recognition.start();
      setCallActive(true);
    } catch (e) {}
  };

  // ─── SSE Streaming turn handler ───────────────────────────────────────────
  const handleTurn = async (userText: string) => {
    setIsProcessing(true);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('user_text', userText);
    if (selectedCampaign) formData.append('campaign_id', selectedCampaign);

    // Audio queue — sentences play sequentially as they arrive
    const audioQueue: string[] = [];
    let isPlayingAudio = false;
    let streamDone = false;

    const resumeMic = () => {
      if (callActiveRef.current && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    };

    const playNextAudio = () => {
      if (audioQueue.length === 0) {
        isPlayingAudio = false;
        if (streamDone) resumeMic();
        return;
      }
      isPlayingAudio = true;
      const url = audioQueue.shift()!;
      const audio = new Audio(url);
      audio.onended = playNextAudio;
      audio.onerror = playNextAudio;
      audio.play().catch(() => playNextAudio());
    };

    // Streaming AI bubble — shows loading spinner until first sentence arrives
    const aiMsgId = Date.now();
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      id: aiMsgId,
      streaming: true
    }]);

    try {
      const res = await fetch('http://localhost:8000/api/simulate/turn/stream', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.detail?.message || 'Failed to connect to the backend.';
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: `⚠️ System Error: ${errMsg}`, streaming: false } : m
        ));
        if (errData.detail?.error === 'OLLAMA_OFFLINE') setOllamaStatus('offline');
        setIsProcessing(false);
        resumeMic();
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

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
            accumulatedText += (accumulatedText ? ' ' : '') + data.text;
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, content: accumulatedText } : m
            ));
            if (data.audio_url) {
              audioQueue.push(data.audio_url);
              if (!isPlayingAudio) playNextAudio();
            }
          }

          if (data.type === 'done') {
            const newIntent = data.intent || 'Neutral';
            const newEmotion = data.emotion || 'NEUTRAL';

            setIntent(newIntent);
            setCurrentEmotion(newEmotion);
            setIntentHistory(prev => {
              const next = [...prev, newIntent];
              return next.length > 5 ? next.slice(-5) : next;
            });

            // Mark assistant bubble as done
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, streaming: false } : m
            ));

            // Retroactively tag the last user message with detected emotion
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

            setIsProcessing(false);
            streamDone = true;
            if (!isPlayingAudio && audioQueue.length === 0) resumeMic();
          }

          if (data.type === 'error') {
            const errMsg = data.message || 'AI encountered an error.';
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, content: `⚠️ ${errMsg}`, streaming: false } : m
            ));
            if (data.error === 'OLLAMA_OFFLINE') setOllamaStatus('offline');
            setIsProcessing(false);
            streamDone = true;
            resumeMic();
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
      resumeMic();
    }
  };

  const handleFallbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textFallback.trim() || !callActive) return;
    const text = textFallback;
    setTextFallback('');
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    await handleTurn(text);
  };

  const handleEndCall = async () => {
    callActiveRef.current = false;
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) {} }
    setCallActive(false);
    setLiveTranscript('');

    const completedMessages = messages.filter(m => !m.streaming && m.content);
    if (completedMessages.length === 0) {
      navigate('/');
      return;
    }

    setIsEnding(true);
    try {
      const payload = {
        campaign_id: selectedCampaign ? parseInt(selectedCampaign) : null,
        transcript: completedMessages.map(m => ({ role: m.role, content: m.content })),
        final_intent: intent
      };
      const res = await fetch('http://localhost:8000/api/simulate/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.status === 'saved') {
        setPostCallSummary({ score: data.lead_score, summary: data.summary, intent: data.intent_tag });
      } else {
        navigate('/');
      }
    } catch (e) {
      console.error(e);
      navigate('/');
    } finally {
      setIsEnding(false);
    }
  };

  const resetSimulation = () => {
    setPostCallSummary(null);
    setMessages([]);
    setIntent('Neutral');
    setIntentHistory(['Neutral']);
    setCurrentEmotion('NEUTRAL');
    setCallDuration(0);
    setSessionId(Math.random().toString(36).substring(7));
  };

  const emotionCfg = EMOTION_CONFIG[currentEmotion] || EMOTION_CONFIG.NEUTRAL;

  return (
    <div className="flex flex-col h-full p-6 gap-6 relative">
      {postCallSummary?.score >= 7 && (
        <div className="fixed inset-0 pointer-events-none z-50 flex justify-center">
          <div className="w-[10px] h-[10px] bg-green-500 absolute top-[-10px] animate-[confetti_3s_ease-out_forwards]" style={{ left: '10%' }}></div>
          <div className="w-[15px] h-[10px] bg-blue-500 absolute top-[-10px] animate-[confetti_2.5s_ease-out_forwards]" style={{ left: '30%', animationDelay: '0.1s' }}></div>
          <div className="w-[10px] h-[15px] bg-purple-500 absolute top-[-10px] animate-[confetti_3.2s_ease-out_forwards]" style={{ left: '50%', animationDelay: '0.2s' }}></div>
          <div className="w-[12px] h-[12px] bg-dialora-accent absolute top-[-10px] animate-[confetti_2.8s_ease-out_forwards]" style={{ left: '70%', animationDelay: '0.3s' }}></div>
          <div className="w-[10px] h-[10px] bg-yellow-500 absolute top-[-10px] animate-[confetti_3.5s_ease-out_forwards]" style={{ left: '90%', animationDelay: '0.15s' }}></div>
        </div>
      )}

      {/* Header */}
      {!postCallSummary && (
        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center bg-[#111827] p-5 rounded-2xl shadow-xl border border-gray-800/80 relative z-20 gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-dialora-accent to-dialora-indigo bg-clip-text text-transparent cursor-default">
                Simulator Studio
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Context</span>
                <select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="bg-[#1a2333] text-gray-200 border border-gray-700/50 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-dialora-indigo cursor-pointer w-[200px]"
                >
                  <option value="">- Generic Sales Profile -</option>
                  {campaigns.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {callActive && (
              <div className="hidden sm:flex items-center gap-3 bg-[#0c1222] px-4 py-2 border border-gray-800 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-dialora-accent text-xl font-mono tracking-widest">{formatTime(callDuration)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Live Emotion Badge */}
            <div className="flex flex-col items-center bg-[#0d1530] p-3 rounded-xl border border-gray-700/50 shadow-inner">
              <span className="font-semibold text-gray-400 text-[10px] uppercase tracking-wider mb-1.5 self-start">Caller Emotion</span>
              <div
                className={`px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-500 ${emotionCfg.color}`}
                style={{ boxShadow: `0 0 16px ${emotionCfg.glow}40` }}
              >
                <span className="text-base leading-none">{emotionCfg.emoji}</span>
                <span className="tracking-wide">{emotionCfg.label.toUpperCase()}</span>
              </div>
            </div>

            {/* Live Intent Badge */}
            <div className="flex flex-col items-center bg-[#0d1530] p-3 rounded-xl border border-gray-700/50 shadow-inner min-w-[160px]">
              <div className="flex items-center gap-2 mb-1.5 w-full justify-between">
                <span className="font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Live Intent</span>
                <div className="flex gap-1">
                  {intentHistory.slice(-5).map((int, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${getIntentDot(int)}`}></div>
                  ))}
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded-xl text-white font-black text-sm tracking-widest w-full text-center transition-all duration-300 ${getIntentColorBox(intent)}`}>
                {intent.toUpperCase()}
              </div>
            </div>

            {callActive && (
              <button onClick={handleEndCall} disabled={isEnding} className="flex items-center gap-2 bg-[#421518]/80 hover:bg-red-900/60 text-red-300 border border-red-500/30 px-5 py-4 rounded-xl font-bold transition-all disabled:opacity-50 group hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                {isEnding ? <Activity className="w-5 h-5 animate-spin" /> : <PhoneOff className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                END CALL
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

      {/* Main Chat Window */}
      {!postCallSummary ? (
        <div className="flex-1 bg-[#111827]/80 rounded-2xl flex flex-col border border-gray-800/80 shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">

            {!callActive && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-6 m-auto animate-fade-in max-w-sm text-center">
                <div className="w-24 h-24 bg-dialora-indigo/10 rounded-full flex items-center justify-center mb-2 border border-dialora-indigo/20 shadow-[0_0_30px_rgba(92,51,255,0.2)]">
                  <Mic className="w-10 h-10 text-dialora-accent animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold text-white">Ready for Simulation</h2>
                <p className="text-gray-400 text-sm font-medium tracking-wide">
                  Nandita will detect your emotional state and adapt her response style in real time.
                </p>
                <button
                  onClick={startCall}
                  disabled={ollamaStatus === 'offline'}
                  className={`mt-4 bg-gradient-to-b from-green-500 to-green-600 text-white font-bold px-12 py-4 rounded-full text-lg transition-all duration-200 shadow-[0_0_25px_rgba(34,197,94,0.4)] ${ollamaStatus === 'offline' ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-[1.03] active:scale-95'}`}
                >
                  Start Audio Session
                </button>
              </div>
            ) : null}

            {messages.map((m, i) => (
              <React.Fragment key={m.id ?? i}>
                {m.role === 'user' ? (
                  <div className="flex justify-end animate-fade-in">
                    <div className="flex gap-3 max-w-[78%] items-end">
                      <div className="flex flex-col items-end gap-1">
                        <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white rounded-2xl rounded-br-sm px-5 py-3 text-sm shadow-[0_4px_15px_rgba(147,51,234,0.3)]">
                          {m.content}
                        </div>
                        {/* Emotion badge — appears after AI responds */}
                        {m.emotion && m.emotion !== 'NEUTRAL' && (
                          <div
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all duration-300 ${EMOTION_CONFIG[m.emotion]?.color || EMOTION_CONFIG.NEUTRAL.color}`}
                            style={{ boxShadow: `0 0 8px ${EMOTION_CONFIG[m.emotion]?.glow || '#94a3b8'}30` }}
                          >
                            <span>{EMOTION_CONFIG[m.emotion]?.emoji}</span>
                            <span>{EMOTION_CONFIG[m.emotion]?.label.toUpperCase() || m.emotion}</span>
                          </div>
                        )}
                        <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">{formatChatTime(m.timestamp)}</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-500/50 flex items-center justify-center text-purple-300 text-xs font-bold shrink-0 shadow-lg select-none">
                        U
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start animate-fade-in">
                    <div className="flex gap-3 max-w-[78%] items-end">
                      <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 text-xs font-bold shrink-0 shadow-[0_0_10px_rgba(6,182,212,0.3)] select-none">
                        N
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <div className="bg-[#1c2336] border-l-4 border-cyan-500 text-gray-200 rounded-2xl rounded-bl-sm px-5 py-3 text-sm shadow-xl min-w-[110px]">
                          {m.content === '' && m.streaming ? (
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                              <span className="text-gray-400 animate-pulse font-medium">Nandita is thinking...</span>
                            </div>
                          ) : (
                            <>
                              {m.content}
                              {m.streaming && (
                                <span className="inline-block w-1.5 h-4 bg-cyan-400 animate-pulse rounded ml-1 -mb-0.5" />
                              )}
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

            {/* Live mic listening bubble */}
            {callActive && !isProcessing && (
              <div className="flex justify-end animate-fade-in">
                <div className="flex gap-3 max-w-[78%] items-end">
                  <div className="bg-purple-900/40 border border-purple-500/30 rounded-2xl rounded-br-sm px-5 py-3 shadow-inner min-w-[120px] flex items-center gap-3">
                    <div className="flex items-end gap-1 h-4">
                      <div className="w-1 bg-purple-400 rounded-full animate-soundwave"></div>
                      <div className="w-1 bg-purple-400 rounded-full animate-soundwave"></div>
                      <div className="w-1 bg-purple-400 rounded-full animate-soundwave"></div>
                    </div>
                    <p className="text-purple-300 text-sm italic">
                      {liveTranscript.length > 0 ? liveTranscript : 'Listening...'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-purple-900/50 border border-purple-500/30 flex items-center justify-center text-purple-300/50 text-xs font-bold shrink-0">U</div>
                </div>
              </div>
            )}

            <div ref={bottomRef} className="h-4" />
          </div>

          {/* Text Fallback Input */}
          {callActive && (
            <div className="p-4 bg-[#0d1522] border-t border-gray-800 shrink-0">
              <form onSubmit={handleFallbackSubmit} className="relative max-w-4xl mx-auto flex items-center">
                <input
                  type="text"
                  value={textFallback}
                  onChange={e => setTextFallback(e.target.value)}
                  placeholder="Or type a message to the AI..."
                  className="w-full bg-[#1a2333] border border-gray-700 text-gray-300 placeholder-gray-500 rounded-full pl-5 pr-12 py-3 focus:outline-none focus:border-dialora-indigo focus:ring-1 focus:ring-dialora-indigo text-sm font-medium transition-all"
                  disabled={isProcessing}
                />
                <button
                  type="submit"
                  disabled={isProcessing || !textFallback.trim()}
                  className="absolute right-2 w-8 h-8 bg-dialora-indigo hover:bg-purple-500 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-colors shadow-md"
                >
                  <Send className="w-4 h-4 ml-[-1px]" />
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        /* POST CALL SUMMARY SCREEN */
        <div className="flex-1 flex items-center justify-center animate-fade-in">
          <div className="bg-[#111827] border border-gray-800/80 rounded-3xl p-10 max-w-2xl w-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1" style={{ backgroundColor: getScoreColor(postCallSummary.score) }}></div>
            <div className="absolute -top-32 w-64 h-64 blur-[100px] rounded-full pointer-events-none" style={{ backgroundColor: getScoreColor(postCallSummary.score), opacity: 0.15 }}></div>

            <h2 className="text-3xl font-black text-white mb-2">Simulation Complete</h2>
            <p className="text-gray-400 font-medium mb-10 flex items-center gap-2"><Activity className="w-4 h-4" /> Analytics Processed</p>

            <div className="flex items-center gap-12 mb-10 flex-wrap justify-center">
              <div className="flex flex-col items-center gap-3">
                <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Lead Score</span>
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" r="56" fill="none" stroke="#1f2937" strokeWidth="12" />
                    <circle cx="64" cy="64" r="56" fill="none" stroke={getScoreColor(postCallSummary.score)} strokeWidth="12" strokeLinecap="round"
                      strokeDasharray="351.858" strokeDashoffset={351.858 - (351.858 * postCallSummary.score / 10)}
                      className="transition-all duration-1500 ease-out"
                    />
                  </svg>
                  <span className="text-4xl font-black text-white relative z-10">
                    {postCallSummary.score}<span className="text-xl text-gray-500 font-bold">/10</span>
                  </span>
                </div>
              </div>

              <div className="w-px h-24 bg-gray-800"></div>

              <div className="flex flex-col items-center gap-3">
                <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Final Intent</span>
                <div className={`px-6 py-3 rounded-2xl text-white font-black tracking-widest shadow-xl uppercase ${getIntentColorBox(postCallSummary.intent)}`}>
                  {postCallSummary.intent}
                </div>
              </div>

              <div className="w-px h-24 bg-gray-800 hidden sm:block"></div>

              <div className="flex flex-col items-center gap-3">
                <span className="text-xs uppercase tracking-widest font-bold text-gray-500">Last Emotion</span>
                <div
                  className={`px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 ${emotionCfg.color}`}
                  style={{ boxShadow: `0 0 12px ${emotionCfg.glow}40` }}
                >
                  <span className="text-xl">{emotionCfg.emoji}</span>
                  <span className="tracking-wider">{emotionCfg.label.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div className="w-full bg-[#1a2333] border border-gray-700/50 rounded-2xl p-6 mb-10 relative">
              <BarChart2 className="w-8 h-8 text-gray-600 absolute -top-4 -left-4 bg-[#111827] rounded-full p-1 border border-gray-800" />
              <p className="text-gray-300 text-sm leading-relaxed font-medium italic relative z-10">
                "{postCallSummary.summary}"
              </p>
            </div>

            <div className="flex items-center gap-4 w-full">
              <button onClick={resetSimulation} className="flex-1 bg-gradient-to-r from-dialora-indigo to-cyan-500 hover:from-cyan-500 hover:to-dialora-indigo text-white font-bold py-3.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center justify-center gap-2 group">
                <RotateCcw className="w-5 h-5 group-hover:-rotate-90 transition-transform duration-300" /> Simulate Again
              </button>
              <button onClick={() => navigate('/')} className="flex-1 bg-[#1a2333] hover:bg-[#253147] border border-gray-700 text-gray-200 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2">
                <LayoutDashboard className="w-5 h-5" /> View Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
