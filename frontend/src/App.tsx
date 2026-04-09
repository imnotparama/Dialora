import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Phone, LayoutDashboard, PlusCircle } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import CallSimulator from './pages/CallSimulator';

function NavLink({ to, icon: Icon, children }: { to: string, icon: any, children: React.ReactNode }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
        isActive 
          ? 'bg-dialora-indigo text-white font-medium shadow-[0_0_15px_rgba(92,51,255,0.4)]' 
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5" />
      {children}
    </Link>
  );
}

function AppContent() {
  return (
    <div className="min-h-screen flex text-gray-100 bg-dialora-navy">
      <aside className="w-64 border-r border-gray-800/50 bg-dialora-card p-6 flex flex-col gap-6 shadow-2xl relative z-10">
        <div className="flex items-center gap-3 text-dialora-accent font-bold text-2xl tracking-wide">
          <Phone className="w-8 h-8 text-dialora-indigo" />
          DIALORA
        </div>
        
        <nav className="flex flex-col gap-2 mt-8">
          <NavLink to="/" icon={LayoutDashboard}>Dashboard</NavLink>
          <NavLink to="/simulate" icon={PlusCircle}>Simulate Call</NavLink>
        </nav>
      </aside>

      <main className="flex-1 overflow-x-hidden flex flex-col shrink-0 min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/simulate" element={<CallSimulator />} />
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
