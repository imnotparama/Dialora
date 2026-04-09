import React, { useState, useEffect, useRef } from 'react';
import { PhoneOutgoing, Activity, Users, FileDown, UploadCloud, Search, Play, Clock, Phone, X, Mic, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function AnimatedCounter({ value }: { value: number | string }) {
  const [count, setCount] = useState(0);
  const isNumeric = typeof value === 'number' || !isNaN(parseFloat(value as string));
  const target = isNumeric ? parseFloat(value as string) : 0;
  
  useEffect(() => {
    if (!isNumeric) return;
    let start = 0;
    const duration = 1500;
    const increment = target / (duration / 16);
    if (target === 0) return;
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, isNumeric]);
  
  if (!isNumeric) return <>{value}</>;
  return <>{value % 1 === 0 ? Math.floor(count) : count.toFixed(1)}</>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total_calls: 0, conversion_rate: 0, active_campaigns: 0, recent_campaigns: [] as any[]});
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());

  // Twilio Demo State
  const [liveCall, setLiveCall] = useState<any>(null);
  const [liveTranscript, setLiveTranscript] = useState<any[]>([]);
  const [liveIntent, setLiveIntent] = useState<string>('Neutral');
  const [callDuration, setCallDuration] = useState(0);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [serverConfig, setServerConfig] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/calls');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'call_started') {
          setLiveCall(data);
          setLiveTranscript([]);
          setLiveIntent('Neutral');
          setCallDuration(0);
        }
        if (data.type === 'user_spoke') {
          setLiveTranscript(prev => [...prev, { role: 'user', text: data.text }]);
        }
        if (data.type === 'ai_replied') {
          setLiveTranscript(prev => [...prev, { role: 'ai', text: data.text, intent: data.intent }]);
          setLiveIntent(data.intent);
        }
        if (data.type === 'call_ended') {
          setLiveCall(null);
          // Fetch data again after call ends to update logs
          fetchData();
        }
      } catch (e) {}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (liveCall) {
      timer = setInterval(() => setCallDuration(p => p + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [liveCall]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript]);

  const fetchData = async () => {
    try {
      const [st, cl, ac, camps, conf] = await Promise.all([
        fetch('http://localhost:8000/api/stats').then(r => r.json()),
        fetch('http://localhost:8000/api/calllogs').then(r => r.json()),
        fetch('http://localhost:8000/api/activity').then(r => r.json()),
        fetch('http://localhost:8000/api/campaigns').then(r => r.json()),
        fetch('http://localhost:8000/api/health/ollama').then(r => r.json())
      ]);
      setStats(st && !st.detail ? st : { total_calls: 0, conversion_rate: 0, active_campaigns: 0, recent_campaigns: [] });
      setCallLogs(Array.isArray(cl) ? cl : []);
      setActivity(Array.isArray(ac) ? ac : []);
      setCampaigns(Array.isArray(camps) ? camps : []);
      setServerConfig(conf);
      if (Array.isArray(camps) && camps.length > 0 && !selectedCampaign) setSelectedCampaign(camps[0].id.toString());
    } catch(e) { console.error(e); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleStartDemo = async () => {
    if (serverConfig) {
      if (!serverConfig.twilio_configured) {
        alert("Twilio credentials not found in .env");
        return;
      }
      if (!serverConfig.ngrok_url || serverConfig.ngrok_url.includes("xxxx") || serverConfig.ngrok_url.includes("your-ngrok-url")) {
        alert("Please set your NGROK_URL in .env before making live calls");
        return;
      }
    }

    try {
      const res = await fetch('http://localhost:8000/api/demo/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: selectedCampaign })
      });
      if (!res.ok) {
        const err = await res.json();
        alert("Failed to start call: " + err.detail);
      }
    } catch (e) {
      alert("Network err");
    }
    setShowDemoModal(false);
  };

  const getIntentBadge = (intent: string) => {
    const safe = (intent || 'Neutral').toUpperCase();
    if (safe.includes('NOT')) return <span className="text-[10px] uppercase font-bold tracking-widest text-red-300 bg-red-900/60 px-2.5 py-1 rounded-md border border-red-500/30">Not Interested</span>;
    if (safe.includes('INTERESTED')) return <span className="text-[10px] uppercase font-bold tracking-widest text-green-300 bg-green-900/60 px-2.5 py-1 rounded-md border border-green-500/30">Interested</span>;
    return <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300 bg-amber-900/60 px-2.5 py-1 rounded-md border border-amber-500/30">Neutral</span>;
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]';
    if (score >= 5) return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]';
    return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]';
  };

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return 'Just now';
    const mins = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="p-8 mx-auto w-full max-w-[1600px] animate-fade-in flex flex-col gap-8 h-full relative">
      
      {/* Header Bar */}
      <header className="flex justify-between items-center w-full">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-dialora-accent to-dialora-indigo bg-clip-text text-transparent transform transition-all hover:scale-[1.01] cursor-default leading-tight">
            Overview
          </h1>
          <div className="flex items-center gap-2 text-gray-400 mt-1 font-medium text-sm">
            <Clock className="w-4 h-4 text-dialora-indigo" />
            {time.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} • {time.toLocaleTimeString()}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group hidden md:block">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input type="text" placeholder="Search anything..." className="bg-[#111827] border border-gray-700/50 rounded-full pl-10 pr-4 py-2 text-sm text-gray-300 focus:outline-none focus:border-dialora-indigo focus:ring-1 focus:ring-dialora-indigo transition-all w-64 group-hover:bg-[#1a2333]" />
          </div>
          
          <button onClick={() => setShowDemoModal(true)} className="flex items-center gap-2 bg-red-900/40 hover:bg-red-800/60 border border-red-500/50 px-5 py-2 rounded-full text-red-200 font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] text-sm">
            <Phone className="w-4 h-4 fill-current" />
            Live Demo Call
          </button>

          <button onClick={() => window.location.href='http://localhost:8000/api/export/csv'} className="flex items-center gap-2 bg-[#111827] hover:bg-[#1a2333] border border-gray-700/50 px-4 py-2 rounded-full transition-all text-gray-300 font-medium text-sm hover:text-white">
            <FileDown className="w-4 h-4" />
            Export
          </button>
          
          <button onClick={() => navigate('/simulate')} className="flex items-center gap-2 bg-gradient-to-r from-dialora-indigo to-cyan-500 hover:from-cyan-500 hover:to-dialora-indigo px-5 py-2 rounded-full text-white font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] text-sm ml-2">
            <Play className="w-4 h-4 fill-current" />
            Quick Start
          </button>
        </div>
      </header>

      {/* Demo Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in custom-scrollbar">
          <div className="bg-[#111827] border border-gray-700 p-8 rounded-2xl shadow-2xl max-w-md w-full relative">
            <button onClick={() => setShowDemoModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X className="w-5 h-5"/></button>
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Phone className="text-red-400"/> Dispatch Live Call</h2>
            <p className="text-sm text-gray-400 mb-6">This will dial out via Twilio immediately. Ensure your phone is ready.</p>
            
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Link Campaign Context</label>
            <select 
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="w-full bg-[#1a2333] border border-gray-700 rounded-xl px-4 py-3 text-white mb-6 focus:border-dialora-indigo focus:ring-1 focus:ring-dialora-indigo outline-none"
            >
              <option value="">- Generic Sales Profile -</option>
              {campaigns.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
            </select>

            <button onClick={handleStartDemo} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg">
              Dial Twilio Target Now
            </button>
          </div>
        </div>
      )}

      {/* LIVE CALL MONITOR */}
      {liveCall && (
        <div className="w-full bg-[#111827] border-2 border-red-500/50 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.2)] overflow-hidden flex flex-col mb-4 animate-fade-in">
          <div className="bg-red-900/30 px-6 py-4 flex justify-between items-center border-b border-red-500/30">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-black tracking-widest animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]">
                <div className="w-2 h-2 bg-white rounded-full"></div> LIVE
              </div>
              <span className="text-red-200 font-bold">{liveCall.campaign_name || "Demo Mode"}</span>
              <span className="text-red-400/70 text-sm font-mono">{liveCall.call_sid}</span>
            </div>
            
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2">
                 <span className="uppercase text-[10px] text-gray-400 font-bold tracking-widest">Intent Pipeline</span>
                 {getIntentBadge(liveIntent)}
               </div>
               <div className="text-white font-mono text-xl tracking-widest">{formatTime(callDuration)}</div>
            </div>
          </div>

          <div className="p-6 h-64 overflow-y-auto bg-[#0a0f1e] flex flex-col gap-4 custom-scrollbar">
            {liveTranscript.length === 0 ? (
               <div className="m-auto flex flex-col items-center gap-4 text-gray-500 opacity-60">
                 <Mic className="w-8 h-8 animate-pulse text-red-400" />
                 Waiting for pickup...
               </div>
            ) : null}

            {liveTranscript.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                <div className={`max-w-[75%] px-5 py-3 text-sm shadow-xl ${
                  t.role === 'user' 
                  ? 'bg-[#1a2333] text-gray-200 border-l-4 border-gray-500 rounded-2xl rounded-bl-sm' 
                  : 'bg-gradient-to-br from-cyan-900 to-cyan-950 text-white border-l-4 border-cyan-400 rounded-2xl rounded-br-sm'
                }`}>
                  <span className="block text-[10px] uppercase font-bold tracking-widest text-cyan-500/60 mb-1">
                    {t.role === 'user' ? 'Customer' : 'Nandita'}
                  </span>
                  {t.text}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="w-full h-64 rounded-2xl animate-shimmer" style={{ background: 'linear-gradient(90deg, #111827 25%, #1f2937 50%, #111827 75%)', backgroundSize: '200% 100%' }}></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 w-full">
          
          {/* Main Left Content */}
          <div className="md:col-span-3 flex flex-col gap-6">
            
            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-b from-[#0e1730] to-[#111827] border-t-2 border-t-blue-500 border-x border-b border-gray-800/80 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-gray-700 transition-all">
                <div className="absolute -top-4 -right-4 bg-blue-500/10 p-6 rounded-full group-hover:scale-110 transition-transform"><PhoneOutgoing className="w-8 h-8 text-blue-400" /></div>
                <p className="text-gray-400 font-medium text-sm mb-1 uppercase tracking-wider relative z-10">Total Calls</p>
                <div className="text-4xl font-black text-white mb-4 relative z-10"><AnimatedCounter value={stats?.total_calls || 0} /></div>
                <svg className="w-full h-8 opacity-40 group-hover:opacity-100 transition-opacity" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline fill="none" stroke="#3b82f6" strokeWidth="2" points="0,20 20,15 40,18 60,8 80,12 100,2" /></svg>
              </div>
              
              <div className="bg-gradient-to-b from-[#0a201c] to-[#111827] border-t-2 border-t-green-500 border-x border-b border-gray-800/80 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-gray-700 transition-all">
                <div className="absolute -top-4 -right-4 bg-green-500/10 p-6 rounded-full group-hover:scale-110 transition-transform"><Activity className="w-8 h-8 text-green-400" /></div>
                <p className="text-gray-400 font-medium text-sm mb-1 uppercase tracking-wider relative z-10">Conversion Rate</p>
                <div className="text-4xl font-black text-transparent bg-gradient-to-r from-green-400 to-[#2ee2a3] bg-clip-text mb-4 relative z-10"><AnimatedCounter value={stats?.conversion_rate || 0} />%</div>
                <svg className="w-full h-8 opacity-40 group-hover:opacity-100 transition-opacity" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline fill="none" stroke="#22c55e" strokeWidth="2" points="0,20 20,18 40,12 60,15 80,5 100,2" /></svg>
              </div>
              
              <div className="bg-gradient-to-b from-[#1b1033] to-[#111827] border-t-2 border-t-purple-500 border-x border-b border-gray-800/80 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-gray-700 transition-all">
                <div className="absolute -top-4 -right-4 bg-purple-500/10 p-6 rounded-full group-hover:scale-110 transition-transform"><Users className="w-8 h-8 text-purple-400" /></div>
                <p className="text-gray-400 font-medium text-sm mb-1 uppercase tracking-wider relative z-10">Active Campaigns</p>
                <div className="text-4xl font-black text-white mb-4 relative z-10"><AnimatedCounter value={stats?.active_campaigns || 0} /></div>
                <svg className="w-full h-8 opacity-40 group-hover:opacity-100 transition-opacity" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline fill="none" stroke="#a855f7" strokeWidth="2" points="0,20 20,10 40,15 60,5 80,10 100,5" /></svg>
              </div>
            </div>

            {/* Recent Call Logs Table */}
            <div className="bg-[#111827] border border-gray-800/80 rounded-2xl p-6 flex-1 flex flex-col shadow-xl">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Phone className="w-5 h-5 text-dialora-accent" /> Recent Call Logs
              </h2>
              
              <div className="overflow-x-auto flex-1">
                {callLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center text-gray-500 py-10">
                    <PhoneOutgoing className="w-12 h-12 opacity-20" />
                    <div>
                      <p className="font-semibold text-gray-400">No calls yet</p>
                      <p className="text-sm">Start a simulation to see AI performance here.</p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs uppercase tracking-widest text-gray-500">
                        <th className="py-3 px-4 font-semibold">Campaign</th>
                        <th className="py-3 px-4 font-semibold">Intent</th>
                        <th className="py-3 px-4 font-semibold w-40">Score</th>
                        <th className="py-3 px-4 font-semibold">Summary</th>
                        <th className="py-3 px-4 font-semibold text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {callLogs.slice(0,6).map((log) => (
                        <tr key={log.id} onClick={() => setSelectedLog(log)} className="cursor-pointer border-b border-gray-800/50 hover:bg-[#1a2333] transition-colors group">
                          <td className="py-4 px-4 font-medium text-gray-200">{log.campaign_name}</td>
                          <td className="py-4 px-4">{getIntentBadge(log.intent_tag)}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white w-4 text-right">{log.lead_score}</span>
                              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${getScoreColor(log.lead_score)}`} style={{ width: `${(log.lead_score/10)*100}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-gray-400 truncate max-w-[250px]" title={log.summary}>{log.summary}</td>
                          <td className="py-4 px-4 text-right text-gray-500 text-xs flex items-center justify-end gap-2">
                            {timeAgo(log.created_at)}
                            <MessageSquare className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-500" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
          </div>

          {/* Right Sidebar - Live Activity */}
          <div className="bg-[#111827] border border-gray-800/80 rounded-2xl p-6 shadow-xl flex flex-col h-full max-h-[800px]">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center w-2 h-2">
                  <span className="absolute animate-ping w-full h-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative rounded-full w-2 h-2 bg-cyan-500"></span>
                </div>
                Live Activity
              </div>
            </h2>
            
            <div className="flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {activity.length === 0 ? (
                <div className="text-center text-sm text-gray-500 italic mt-10">No recent activity</div>
              ) : (
                activity.map((act, i) => (
                  <div key={i} className="flex gap-4 animate-fade-in group" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${act.type === 'call' ? 'bg-dialora-indigo/20 text-dialora-indigo' : 'bg-cyan-500/20 text-cyan-400'}`}>
                        {act.type === 'call' ? <Phone className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
                      </div>
                      {i !== activity.length - 1 && <div className="w-px h-full bg-gray-800 group-hover:bg-gray-700 transition-colors my-2"></div>}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-semibold text-gray-200">{act.message}</p>
        <p className="text-xs text-gray-400 mt-0.5">{act.sub_message}</p>
                      <p className="text-[10px] text-gray-600 font-medium mt-1.5 uppercase tracking-wide">{timeAgo(act.timestamp)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* PAST LOG VIEWER MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in p-4">
           <div className="bg-[#111827] border border-gray-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col relative overflow-hidden">
              <button 
                onClick={() => setSelectedLog(null)} 
                className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-full p-2 transition-colors z-10"
              >
                <X className="w-5 h-5"/>
              </button>
              
              <div className="bg-[#0a0f1e] px-8 py-6 border-b border-gray-800">
                 <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                   <PhoneOutgoing className="text-blue-400 w-6 h-6"/> Call Interaction History
                 </h2>
                 <div className="flex items-center gap-4 text-sm mt-3">
                   <div className="text-gray-400"><span className="text-gray-500">Campaign:</span> <span className="font-bold text-gray-200">{selectedLog.campaign_name}</span></div>
                   <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
                   <div className="text-gray-400"><span className="text-gray-500">Lead Score:</span> <span className="font-bold text-white">{selectedLog.lead_score}/10</span></div>
                   <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
                   <div className="flex items-center gap-2 text-gray-400"><span className="text-gray-500">Status:</span> {getIntentBadge(selectedLog.intent_tag)}</div>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-5 bg-gradient-to-b from-[#111827] to-[#0a0f1e] custom-scrollbar">
                {(!selectedLog.transcript || selectedLog.transcript.length === 0) ? (
                   <p className="text-gray-500 text-center italic mt-10">No transcript recorded for this session.</p>
                ) : (
                  selectedLog.transcript.map((msg: any, i: number) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`} style={{ animationDelay: `${i * 0.05}s` }}>
                      <div className={`max-w-[75%] px-5 py-4 text-sm shadow-lg leading-relaxed ${
                        msg.role === 'user' 
                        ? 'bg-gradient-to-br from-[#1a2333] to-[#253147] text-gray-200 border-r-4 border-purple-500 rounded-2xl rounded-tr-sm' 
                        : 'bg-[#151c2b] text-gray-300 border-l-4 border-cyan-500 rounded-2xl rounded-bl-sm border border-gray-800/50'
                      }`}>
                        <span className={`block text-[10px] uppercase font-bold tracking-widest mb-1.5 ${msg.role === 'user' ? 'text-purple-400/80 text-right' : 'text-cyan-500/80'}`}>
                          {msg.role === 'user' ? 'Customer' : 'Nandita'}
                        </span>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {selectedLog.summary && (
                <div className="p-5 bg-[#0a0f1e] border-t border-gray-800 mt-auto">
                  <div className="bg-[#1a2333] border border-gray-700/50 rounded-xl p-4">
                     <span className="uppercase text-[10px] text-gray-500 font-bold tracking-widest mb-1 block">QA AI Summary</span>
                     <p className="text-gray-300 text-sm italic">"{selectedLog.summary}"</p>
                  </div>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
}
