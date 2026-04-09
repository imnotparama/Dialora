import React, { useEffect, useState } from 'react';
import { Users, PhoneCall, TrendingUp, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/campaigns')
      .then(r => r.json())
      .then(setCampaigns)
      .catch(console.error);
  }, []);

  return (
    <div className="p-8 h-full overflow-y-auto w-full">
      <div className="flex justify-between items-center mb-8">
         <div>
           <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Overview</h1>
           <p className="text-gray-400 mt-1">Live metrics across all local campaigns.</p>
         </div>
         <button className="px-5 py-2.5 bg-dialora-indigo hover:bg-[#6c48ff] text-white rounded-lg shadow-[0_0_15px_rgba(92,51,255,0.4)] transition-all font-medium flex items-center gap-2">
           <BarChart3 className="w-5 h-5" /> Export Report
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <AnalyticsCard title="Total Simulated Calls" value="12" icon={PhoneCall} color="text-dialora-accent" bg="bg-dialora-accent/10" border="border-dialora-accent/20" />
        <AnalyticsCard title="Leads Conversion" value="45.2%" icon={TrendingUp} color="text-dialora-success" bg="bg-dialora-success/10" border="border-dialora-success/20" />
        <AnalyticsCard title="Active Campaigns" value={campaigns.length} icon={Users} color="text-dialora-indigo" bg="bg-dialora-indigo/10" border="border-dialora-indigo/20" />
      </div>

      <div className="bg-dialora-card border border-gray-800 rounded-xl overflow-hidden shadow-xl max-w-full">
        <div className="p-5 border-b border-gray-800 bg-gray-900/40">
          <h2 className="text-xl font-bold text-gray-200">Recent Campaigns</h2>
        </div>
        <div className="p-0 overflow-x-auto w-full">
          <table className="w-full min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#111933] text-gray-400 border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 font-semibold tracking-wide">ID</th>
                <th className="px-6 py-4 font-semibold tracking-wide">Name</th>
                <th className="px-6 py-4 font-semibold tracking-wide">Context / Script</th>
                <th className="px-6 py-4 font-semibold tracking-wide">Contacts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {campaigns.length > 0 ? campaigns.map(c => (
                <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-dialora-accent">#{c.id}</td>
                  <td className="px-6 py-4 font-medium text-gray-200">{c.name}</td>
                  <td className="px-6 py-4 text-gray-400 truncate max-w-xs">{c.business_context}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-dialora-indigo/20 text-dialora-indigo rounded-full font-medium">
                      {c.contacts_count} Contacts
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No campaigns yet. Run the /demo/seed endpoint!
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AnalyticsCard({ title, value, icon: Icon, color, bg, border }: any) {
  return (
    <div className={`p-6 rounded-xl border ${border} bg-dialora-card shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-transform`}>
      <div className={`absolute top-0 right-0 w-32 h-32 ${bg} rounded-bl-full -mr-8 -mt-8 px-4 opacity-50`}></div>
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-gray-400 font-medium mb-2 leading-none">{title}</p>
          <h3 className="text-4xl font-bold tracking-tight text-white">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${bg} ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
