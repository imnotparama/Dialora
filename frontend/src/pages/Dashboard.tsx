import React, { useState, useEffect } from 'react';
import { PhoneOutgoing, Activity, Users, FileDown, UploadCloud, Search, Play, Clock, Phone } from 'lucide-react';
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

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      const [st, cl, ac] = await Promise.all([
        fetch('http://localhost:8000/api/stats').then(r => r.json()),
        fetch('http://localhost:8000/api/calllogs').then(r => r.json()),
        fetch('http://localhost:8000/api/activity').then(r => r.json())
      ]);
      setStats(st);
      setCallLogs(cl);
      setActivity(ac);
    } catch(e) { console.error(e); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

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
                <div className="text-4xl font-black text-white mb-4 relative z-10"><AnimatedCounter value={stats.total_calls} /></div>
                <svg className="w-full h-8 opacity-40 group-hover:opacity-100 transition-opacity" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline fill="none" stroke="#3b82f6" strokeWidth="2" points="0,20 20,15 40,18 60,8 80,12 100,2" /></svg>
              </div>
              
              <div className="bg-gradient-to-b from-[#0a201c] to-[#111827] border-t-2 border-t-green-500 border-x border-b border-gray-800/80 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-gray-700 transition-all">
                <div className="absolute -top-4 -right-4 bg-green-500/10 p-6 rounded-full group-hover:scale-110 transition-transform"><Activity className="w-8 h-8 text-green-400" /></div>
                <p className="text-gray-400 font-medium text-sm mb-1 uppercase tracking-wider relative z-10">Conversion Rate</p>
                <div className="text-4xl font-black text-transparent bg-gradient-to-r from-green-400 to-[#2ee2a3] bg-clip-text mb-4 relative z-10"><AnimatedCounter value={stats.conversion_rate} />%</div>
                <svg className="w-full h-8 opacity-40 group-hover:opacity-100 transition-opacity" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline fill="none" stroke="#22c55e" strokeWidth="2" points="0,20 20,18 40,12 60,15 80,5 100,2" /></svg>
              </div>
              
              <div className="bg-gradient-to-b from-[#1b1033] to-[#111827] border-t-2 border-t-purple-500 border-x border-b border-gray-800/80 p-6 rounded-2xl shadow-lg relative overflow-hidden group hover:border-gray-700 transition-all">
                <div className="absolute -top-4 -right-4 bg-purple-500/10 p-6 rounded-full group-hover:scale-110 transition-transform"><Users className="w-8 h-8 text-purple-400" /></div>
                <p className="text-gray-400 font-medium text-sm mb-1 uppercase tracking-wider relative z-10">Active Campaigns</p>
                <div className="text-4xl font-black text-white mb-4 relative z-10"><AnimatedCounter value={stats.active_campaigns} /></div>
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
                        <tr key={log.id} className="border-b border-gray-800/50 hover:bg-[#1a2333] transition-colors group">
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
                          <td className="py-4 px-4 text-right text-gray-500 text-xs">{timeAgo(log.created_at)}</td>
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
    </div>
  );
}
