import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Phone, LayoutDashboard, PlusCircle, Radio } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import CallSimulator from './pages/CallSimulator';
import Campaign from './pages/Campaign';
import LiveCallDashboard from './pages/LiveCallDashboard';
import CallPage from './pages/CallPage';

export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  window.dispatchEvent(new CustomEvent('dialora-toast', { detail: { message, type } }));
};

function ToastContainer() {
  const [toasts, setToasts] = useState<{id: number, message: string, type: string}[]>([]);

  useEffect(() => {
    const handleToast = (e: any) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    };
    window.addEventListener('dialora-toast', handleToast);
    return () => window.removeEventListener('dialora-toast', handleToast);
  }, []);

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl animate-fade-in font-medium transition-all ${
          t.type === 'success' ? 'bg-[#0f2922] border border-green-500/50 text-green-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]' :
          t.type === 'error' ? 'bg-[#3b1212] border border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]' :
          'bg-[#0c2040] border border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
        }`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function NavLink({ to, icon: Icon, children }: { to: string, icon: any, children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`relative group flex items-center gap-3 p-3 rounded-lg transition-transform duration-200 hover-slide-right ${
        isActive 
          ? 'bg-dialora-indigo/10 text-white font-medium' 
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 rounded-r shadow-[0_0_10px_rgba(6,182,212,0.8)] animate-fade-in" />
      )}
      <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : ''}`} />
      <span>{children}</span>
      
      {/* Tooltip */}
      <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 border border-gray-700 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-xl pointer-events-none hidden md:group-hover:block">
        {children}
      </span>
    </Link>
  );
}

function AppContent() {
  const location = useLocation();
  const [ollamaStatus, setOllamaStatus] = useState<'online'|'offline'>('offline');
  const [ngrokUrl, setNgrokUrl] = useState<string>('');
  
  useEffect(() => {
    const checkOllama = () => {
      fetch('http://localhost:8000/api/health/ollama')
        .then(res => res.ok ? res.json() : { status: 'offline' })
        .then(data => {
          setOllamaStatus(data.status);
          if (data.ngrok_url) setNgrokUrl(data.ngrok_url);
        })
        .catch(() => setOllamaStatus('offline'));
    };
    checkOllama();
    const int = setInterval(checkOllama, 10000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="min-h-screen flex text-gray-100 bg-dialora-navy">
      <ToastContainer />
      {location.pathname !== '/call' && (
      <aside className="w-64 border-r border-gray-800/50 bg-[#080c17] p-6 flex flex-col shadow-2xl relative z-10 justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 font-bold text-2xl tracking-wide text-white mb-10 select-none cursor-default">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[conic-gradient(var(--tw-gradient-stops))] from-cyan-400 via-purple-500 to-cyan-400 animate-[spin_3s_linear_infinite]" />
              <div className="absolute inset-[2px] bg-[#080c17] rounded-full flex items-center justify-center">
                <Phone className="w-4 h-4 text-white" />
              </div>
            </div>
            DIALORA
          </div>
          
          <nav className="flex flex-col gap-2">
            <NavLink to="/" icon={LayoutDashboard}>Dashboard</NavLink>
            <NavLink to="/campaigns/new" icon={PlusCircle}>New Campaign</NavLink>
            <NavLink to="/simulate" icon={Phone}>Simulate Call</NavLink>
            <NavLink to="/live" icon={Radio}>Live Monitor</NavLink>
          </nav>
        </div>
        
        {/* Bottom Section */}
        <div className="flex flex-col gap-4">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent opacity-50" />
          <div className="flex items-center gap-3 px-2">
            <div className="relative flex items-center justify-center">
              <span className={`w-2.5 h-2.5 rounded-full ${ollamaStatus === 'online' ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></span>
            </div>
            <span className="text-sm font-medium text-gray-400">
              AI Engine: <span className={ollamaStatus === 'online' ? 'text-green-400' : 'text-red-400'}>{ollamaStatus === 'online' ? 'Online' : 'Offline'}</span>
            </span>
          </div>
          {ngrokUrl && (
            <div className="px-2 flex items-center gap-1.5 group cursor-default" title={ngrokUrl}>
              <span className="w-2 h-2 rounded-full bg-cyan-500/70 shrink-0" />
              <span className="text-[10px] text-gray-600 font-mono truncate max-w-[180px] group-hover:text-gray-400 transition-colors">
                {ngrokUrl.replace('https://', '')}
              </span>
            </div>
          )}
          <div className="px-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-gray-600 bg-gray-800/50 px-2 py-1 rounded-md border border-gray-700/50">
              v2.0 · EI Edition
            </span>
          </div>
        </div>
      </aside>
      )}

      <main className="flex-1 max-h-screen overflow-y-auto flex flex-col shrink-0 min-w-0 bg-[#0a0f1e]">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaigns/new" element={<Campaign />} />
          <Route path="/simulate" element={<CallSimulator />} />
          <Route path="/live" element={<LiveCallDashboard />} />
          <Route path="/call" element={<CallPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
