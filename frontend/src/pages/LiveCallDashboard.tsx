import React, { useState, useEffect, useRef } from 'react';
import { Phone, Clock, Zap, Activity, PhoneOff, Radio } from 'lucide-react';

const EMOTION_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  ANGRY:         { emoji: '😠', color: 'bg-red-900/50 text-red-300 border-red-700/40',       label: 'Angry' },
  FRUSTRATED:    { emoji: '😤', color: 'bg-orange-900/50 text-orange-300 border-orange-700/40', label: 'Frustrated' },
  EXCITED:       { emoji: '🤩', color: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/40', label: 'Excited' },
  INTERESTED:    { emoji: '😊', color: 'bg-green-900/50 text-green-300 border-green-700/40',   label: 'Interested' },
  CONFUSED:      { emoji: '😕', color: 'bg-blue-900/50 text-blue-300 border-blue-700/40',     label: 'Confused' },
  HESITANT:      { emoji: '🤔', color: 'bg-purple-900/50 text-purple-300 border-purple-700/40', label: 'Hesitant' },
  DISINTERESTED: { emoji: '😑', color: 'bg-gray-800/50 text-gray-400 border-gray-700/40',     label: 'Disinterested' },
  NEUTRAL:       { emoji: '😐', color: 'bg-slate-800/50 text-slate-300 border-slate-700/40',   label: 'Neutral' },
  HAPPY:         { emoji: '😄', color: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/40',     label: 'Happy' },
  SAD:           { emoji: '😢', color: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/40', label: 'Sad' },
};

type TurnRole = 'user' | 'ai';
interface Turn { role: TurnRole; text: string; intent?: string; emotion?: string; ts: string; }
type WsStatus = 'connecting' | 'live' | 'idle' | 'error';

function IntentMeter({ intent }: { intent: string }) {
  const safe = (intent || 'Neutral').toUpperCase();
  const isInterested = safe.includes('INTERESTED') && !safe.includes('NOT');
  const isNotInterested = safe.includes('NOT');
  const isCallback = safe.includes('CALLBACK');

  const label = isNotInterested ? 'Not Interested' : isInterested ? 'Interested' : isCallback ? 'Callback' : 'Neutral';
  const color = isInterested
    ? { bar: 'bg-green-400', glow: 'shadow-[0_0_20px_rgba(34,197,94,0.5)]', text: 'text-green-400', border: 'border-green-500/40', bg: 'bg-green-900/20' }
    : isNotInterested
    ? { bar: 'bg-red-400', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.5)]', text: 'text-red-400', border: 'border-red-500/40', bg: 'bg-red-900/20' }
    : isCallback
    ? { bar: 'bg-amber-400', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.5)]', text: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-900/20' }
    : { bar: 'bg-blue-400', glow: '', text: 'text-blue-400', border: 'border-blue-500/40', bg: 'bg-blue-900/20' };

  const pct = isInterested ? 90 : isNotInterested ? 10 : isCallback ? 60 : 50;

  return (
    <div className={`rounded-2xl border ${color.border} ${color.bg} p-5 flex flex-col gap-3`}>
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Lead Intent</span>
        <span className={`text-sm font-black ${color.text} ${color.glow}`}>{label}</span>
      </div>
      <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-600 font-bold uppercase tracking-wider">
        <span>Not Interested</span>
        <span>Neutral</span>
        <span>Interested</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className={`rounded-2xl border border-gray-800/60 bg-[#111827] p-5 flex items-center gap-4`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-xl font-black text-white">{value}</p>
      </div>
    </div>
  );
}

export default function LiveCallDashboard() {
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [callActive, setCallActive] = useState(false);
  const [callInfo, setCallInfo] = useState<any>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [currentIntent, setCurrentIntent] = useState('Neutral');
  const [currentEmotion, setCurrentEmotion] = useState('NEUTRAL');
  const [duration, setDuration] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const [callHistory, setCallHistory] = useState<any[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Call duration timer
  useEffect(() => {
    if (callActive) {
      durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (durationRef.current) clearInterval(durationRef.current);
      setDuration(0);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [callActive]);

  // Fetch historical call logs for sidebar
  const fetchHistory = async () => {
    try {
      const data = await fetch('http://localhost:8000/api/calllogs').then(r => r.json());
      if (Array.isArray(data)) setCallHistory(data.slice(0, 8));
    } catch {}
  };

  useEffect(() => { fetchHistory(); }, []);

  // WebSocket connection
  useEffect(() => {
    let ws: WebSocket;
    let retryTimeout: NodeJS.Timeout;

    const connect = () => {
      setWsStatus('connecting');
      ws = new WebSocket('ws://localhost:8000/ws/calls');

      ws.onopen = () => setWsStatus('idle');

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'call_started') {
            setCallActive(true);
            setCallInfo(data);
            setTranscript([]);
            setCurrentIntent('Neutral');
            setTotalCalls(c => c + 1);
            setWsStatus('live');
          }

          if (data.type === 'user_spoke') {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setTranscript(prev => [...prev, { role: 'user', text: data.text, ts: now }]);
          }

          if (data.type === 'ai_replied') {
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setTranscript(prev => [...prev, { role: 'ai', text: data.text, intent: data.intent, emotion: data.emotion, ts: now }]);
            setCurrentIntent(data.intent || 'Neutral');
            setCurrentEmotion((data.emotion || 'NEUTRAL').toUpperCase());
          }

          if (data.type === 'call_ended') {
            setCallActive(false);
            setCallInfo(null);
            setWsStatus('idle');
            fetchHistory();
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsStatus('error');
        retryTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setWsStatus('error');
        ws.close();
      };
    };

    connect();
    return () => {
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const wsStatusConfig = {
    connecting: { label: 'Connecting…', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
    live: { label: 'Live Call Active', color: 'text-red-400', dot: 'bg-red-400 animate-pulse' },
    idle: { label: 'Listening for Calls', color: 'text-green-400', dot: 'bg-green-500 animate-pulse' },
    error: { label: 'Reconnecting…', color: 'text-red-500', dot: 'bg-red-500' },
  }[wsStatus];

  const getIntentColor = (intent?: string) => {
    if (!intent) return 'text-gray-400';
    const u = intent.toUpperCase();
    if (u.includes('NOT')) return 'text-red-400';
    if (u.includes('INTERESTED')) return 'text-green-400';
    if (u.includes('CALLBACK')) return 'text-amber-400';
    return 'text-blue-400';
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto w-full h-full flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-red-400 via-orange-400 to-amber-400 bg-clip-text text-transparent leading-tight">
            Live Call Monitor
          </h1>
          <p className="text-sm text-gray-500 mt-1">Real-time AI telephony dashboard</p>
        </div>
        <div className="flex items-center gap-3 bg-[#111827] border border-gray-700/50 px-5 py-2.5 rounded-full">
          <span className={`w-2.5 h-2.5 rounded-full ${wsStatusConfig.dot}`} />
          <span className={`text-sm font-bold ${wsStatusConfig.color}`}>{wsStatusConfig.label}</span>
        </div>
      </header>

      {/* Stat Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Session Calls" value={totalCalls.toString()} icon={Phone} color="bg-blue-500/20 text-blue-400" />
        <StatCard label="Duration" value={callActive ? formatDuration(duration) : '—'} icon={Clock} color="bg-purple-500/20 text-purple-400" />
        <StatCard label="Live Intent" value={callActive ? currentIntent : '—'} icon={Zap} color="bg-amber-500/20 text-amber-400" />
        <StatCard label="Connection" value={wsStatus === 'live' ? 'LIVE' : wsStatus === 'idle' ? 'Ready' : 'Connecting'} icon={Radio} color="bg-red-500/20 text-red-400" />
      </div>

      {/* Main layout: transcript + sidebar */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0">

        {/* Transcript Panel */}
        <div className="md:col-span-2 flex flex-col gap-4 min-h-0">

          {/* Intent Meter */}
          <IntentMeter intent={currentIntent} />

          {/* Call Banner */}
          {callActive && (
            <div className="bg-red-900/20 border border-red-500/40 rounded-2xl px-6 py-4 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-black tracking-widest animate-pulse">
                  <span className="w-2 h-2 bg-white rounded-full" /> LIVE
                </div>
                <div>
                  <p className="text-white font-bold">{callInfo?.campaign_name || 'Demo Mode'}</p>
                  <p className="text-red-400/70 text-xs font-mono">{callInfo?.call_sid}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Live Emotion Badge */}
                {currentEmotion && currentEmotion !== 'NEUTRAL' && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${EMOTION_CONFIG[currentEmotion]?.color || ''}`}>
                    <span className="text-base leading-none">{EMOTION_CONFIG[currentEmotion]?.emoji}</span>
                    <span>{EMOTION_CONFIG[currentEmotion]?.label.toUpperCase()}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-red-300 font-mono text-2xl font-black">
                  <Clock className="w-5 h-5 text-red-400" />
                  {formatDuration(duration)}
                </div>
              </div>
            </div>
          )}

          {/* Transcript */}
          <div className="flex-1 bg-[#0a0f1e] border border-gray-800 rounded-2xl flex flex-col overflow-hidden min-h-[400px]">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800/60">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-gray-300 uppercase tracking-widest">Live Transcript</span>
              {callActive && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-red-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Recording
                </span>
              )}
              {!callActive && (
                <span className="ml-auto text-xs text-gray-600 font-bold">Waiting for call…</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar">
              {transcript.length === 0 ? (
                <div className="m-auto flex flex-col items-center gap-5 opacity-40 select-none">
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-ping" />
                    <div className="absolute inset-3 rounded-full border border-red-500/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                    <PhoneOff className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-gray-600 text-sm font-medium">No active call. Waiting for incoming call…</p>
                </div>
              ) : (
                transcript.map((turn, i) => (
                  <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[75%] flex flex-col gap-1 ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${turn.role === 'user' ? 'text-purple-400/70' : 'text-cyan-400/70'}`}>
                        {turn.role === 'user' ? 'Customer' : 'Nandita'}
                        {turn.intent && (
                          <span className={`ml-2 normal-case ${getIntentColor(turn.intent)}`}>• {turn.intent}</span>
                        )}
                      </span>
                      <div className={`px-5 py-3.5 text-sm leading-relaxed rounded-2xl shadow-lg ${
                        turn.role === 'user'
                          ? 'bg-gradient-to-br from-purple-900/60 to-[#1a1033] border border-purple-500/30 text-gray-100 rounded-tr-sm'
                          : 'bg-gradient-to-br from-cyan-900/40 to-[#0a1520] border border-cyan-500/30 text-gray-100 rounded-tl-sm'
                      }`}>
                        {turn.text}
                      </div>
                      {/* Emotion badge on AI turns */}
                      {turn.role === 'ai' && turn.emotion && turn.emotion !== 'NEUTRAL' && (
                        <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${EMOTION_CONFIG[turn.emotion]?.color || ''}`}>
                          <span>{EMOTION_CONFIG[turn.emotion]?.emoji}</span>
                          <span>{EMOTION_CONFIG[turn.emotion]?.label}</span>
                        </div>
                      )}
                      <span className="text-[10px] text-gray-700">{turn.ts}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={scrollRef} />
            </div>
          </div>
        </div>

        {/* Right Sidebar — Call History */}
        <div className="flex flex-col gap-4 min-h-0">
          <div className="bg-[#111827] border border-gray-800/60 rounded-2xl flex flex-col overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-bold text-gray-300 uppercase tracking-widest">Recent Calls</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-800/50">
              {callHistory.length === 0 ? (
                <p className="text-center text-gray-600 text-sm italic py-10">No call history yet</p>
              ) : (
                callHistory.map((log) => {
                  const safe = (log.intent_tag || 'Neutral').toUpperCase();
                  const isInt = safe.includes('INTERESTED') && !safe.includes('NOT');
                  const isNot = safe.includes('NOT');
                  const badgeColor = isInt ? 'text-green-400 bg-green-900/40 border-green-700/30'
                    : isNot ? 'text-red-400 bg-red-900/40 border-red-700/30'
                    : 'text-amber-400 bg-amber-900/40 border-amber-700/30';
                  const badgeLabel = isInt ? 'Interested' : isNot ? 'Not Interested' : 'Neutral';

                  return (
                    <div key={log.id} className="px-5 py-4 hover:bg-[#1a2333] transition-colors group flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-semibold text-gray-200 truncate max-w-[120px]">{log.campaign_name}</p>
                        <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors shrink-0" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}>
                          {badgeLabel}
                        </span>
                        <span className="text-xs text-gray-600 font-bold ml-auto">Score: {log.lead_score}/10</span>
                      </div>
                      {log.summary && (
                        <p className="text-xs text-gray-600 italic truncate">{log.summary}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tips box */}
          <div className="bg-[#0a0f1e] border border-cyan-900/40 rounded-2xl p-5">
            <p className="text-xs font-black uppercase tracking-widest text-cyan-500 mb-3">Live Tips</p>
            <ul className="text-xs text-gray-500 flex flex-col gap-2 leading-relaxed">
              <li>• This page auto-connects to any incoming Twilio call</li>
              <li>• Intent updates in real-time after each AI reply</li>
              <li>• Call history refreshes automatically when a call ends</li>
              <li>• Reconnects automatically if WebSocket drops</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
