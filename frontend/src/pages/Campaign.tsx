import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, CheckCircle, UploadCloud, ChevronRight, ChevronLeft, Building2, BrainCircuit, Rocket, Phone } from 'lucide-react';
import { showToast } from '../App';

export default function Campaign() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Sales Outreach',
    business_context: '',
    script: '',
    knowledge_base: ''
  });
  
  // Auto-Dialer tracking states
  const [newCampaignId, setNewCampaignId] = useState<number | null>(null);
  const [dialingStatus, setDialingStatus] = useState<'idle' | 'starting' | 'dialing'>('idle');
  const [totalQueued, setTotalQueued] = useState(0);
  const [dialedContacts, setDialedContacts] = useState<string[]>([]);
  
  // Listen for websocket events on success screen
  useEffect(() => {
    if (step === 4 && dialingStatus === 'dialing') {
      const ws = new WebSocket('ws://localhost:8000/ws/calls');
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'auto_dial') {
          setDialedContacts(prev => [data.contact_name, ...prev].slice(0, 5));
        }
      };
      return () => ws.close();
    }
  }, [step, dialingStatus]);

  const handleNext = () => {
    if (step === 1 && !formData.name.trim()) {
      showToast('Please enter a campaign name', 'error');
      return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => setStep(s => s - 1);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileObj(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('http://localhost:8000/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          business_context: formData.business_context,
          script: formData.script,
          knowledge_base: formData.knowledge_base
        })
      });
      const data = await res.json();
      
      if (res.ok && fileObj) {
        const fd = new FormData();
        fd.append('file', fileObj);
        const contactRes = await fetch(`http://localhost:8000/api/campaigns/${data.id}/contacts/upload`, {
          method: 'POST',
          body: fd
        });
        if (contactRes.ok) showToast('Contacts uploaded successfully', 'info');
      }
      
      if (res.ok) {
        setNewCampaignId(data.id);
        showToast('Campaign successfully launched! 🎉', 'success');
        setStep(4); // Success screen
        // Removed auto-redirect so user can choose to Auto-Dial
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to connect to backend', 'error');
      setIsSubmitting(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-12 mt-4 relative animate-fade-in z-20">
      <div className="absolute top-1/2 -translate-y-1/2 left-10 right-10 max-w-lg mx-auto h-0.5 bg-gray-800 z-0 hidden sm:block"></div>
      <div className="absolute top-1/2 -translate-y-1/2 left-10 max-w-lg mx-auto h-0.5 bg-dialora-indigo transition-all duration-700 z-0 hidden sm:block" style={{ width: `${(step-1)*50}%`}}></div>
      
      <div className="flex justify-between w-full max-w-lg z-10 relative">
        {[1,2,3].map(i => (
          <div key={i} className={`flex flex-col items-center gap-3 transition-opacity duration-300 ${step >= i ? 'opacity-100' : 'opacity-40 grayscale'} bg-dialora-card px-4`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-lg transition-colors duration-500 relative ${
              step > i ? 'bg-dialora-success text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 
              step === i ? 'bg-dialora-indigo text-white shadow-[0_0_20px_rgba(92,51,255,0.5)] ring-4 ring-dialora-indigo/30' : 
              'bg-gray-800 text-gray-500 border border-gray-700'
            }`}>
              {step > i ? <CheckCircle className="w-6 h-6" /> : i}
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${step === i ? 'text-dialora-accent' : 'text-gray-400'}`}>
              {i === 1 ? 'Basic Info' : i === 2 ? 'AI Persona' : 'Upload Leads'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto w-full animate-fade-in relative h-full flex flex-col">
      <header className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-dialora-accent to-dialora-indigo bg-clip-text text-transparent transform transition-all hover:scale-[1.01] cursor-default">
          Create New Campaign
        </h1>
        <p className="text-gray-400 mt-2 font-medium">Design an intelligent tele-calling workflow from scratch.</p>
      </header>

      {step < 4 && <StepIndicator />}

      <div className="bg-[#111827] border border-gray-800/80 shadow-2xl rounded-2xl p-8 flex flex-col gap-6 relative overflow-hidden flex-1 max-h-[650px]">
        {/* Glow Effects */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-dialora-indigo/10 blur-[100px] rounded-full pointer-events-none" />
        
        {step === 1 && (
          <div className="space-y-6 relative z-10 animate-fade-in">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-4">
              <Building2 className="text-dialora-accent w-5 h-5" />
              Campaign Logistics
            </h2>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-300 tracking-wide uppercase">Campaign Name</label>
              <input 
                required 
                type="text"
                autoFocus
                className="w-full bg-[#1a2333] border border-gray-700/50 rounded-xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-dialora-indigo/50 transition-all font-medium text-lg placeholder-gray-600"
                placeholder="e.g. Q4 SaaS Renewal Outreach"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-300 tracking-wide uppercase">Business Category</label>
              <select
                className="w-full bg-[#1a2333] border border-gray-700/50 rounded-xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-dialora-indigo/50 transition-all font-medium appearance-none cursor-pointer"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                <option>Sales Outreach</option>
                <option>Event Promotion</option>
                <option>Customer Re-engagement</option>
                <option>Survey & Feedback</option>
                <option>Support Follow-up</option>
                <option>Lead Qualification</option>
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 relative z-10 animate-fade-in flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-4 sticky top-0 bg-[#111827] z-20">
              <BrainCircuit className="text-dialora-accent w-5 h-5" />
              AI Configuration
            </h2>
            
            <div className="space-y-2 group">
              <label className="text-sm font-bold text-gray-300 tracking-wide uppercase flex justify-between">
                Business Context
                <span className={`text-xs ${formData.business_context.length > 500 ? 'text-red-400' : 'text-gray-500'}`}>{formData.business_context.length}/500</span>
              </label>
              <textarea 
                rows={2}
                className="w-full bg-[#1a2333] border border-gray-700/50 rounded-xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-dialora-indigo/50 transition-all resize-none group-hover:border-gray-600"
                placeholder="What does your company do? Give the AI the elevator pitch..."
                value={formData.business_context}
                onChange={e => setFormData({ ...formData, business_context: e.target.value })}
              />
            </div>

            <div className="space-y-2 group">
              <label className="text-sm font-bold text-gray-300 tracking-wide uppercase flex justify-between">
                Agent Script & Goal
                <span className={`text-xs ${formData.script.length > 300 ? 'text-red-400' : 'text-gray-500'}`}>{formData.script.length}/300</span>
              </label>
              <textarea 
                rows={2}
                className="w-full bg-[#1a2333] border border-gray-700/50 rounded-xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-dialora-indigo/50 transition-all resize-none group-hover:border-gray-600"
                placeholder="What exactly should the AI say or try to accomplish?"
                value={formData.script}
                onChange={e => setFormData({ ...formData, script: e.target.value })}
              />
            </div>

            <div className="space-y-2 group">
              <label className="text-sm font-bold text-gray-300 tracking-wide uppercase flex justify-between">
                Knowledge Base & FAQs
                <span className={`text-xs ${formData.knowledge_base.length > 1000 ? 'text-red-400' : 'text-gray-500'}`}>{formData.knowledge_base.length}/1000</span>
              </label>
              <textarea 
                rows={4}
                className="w-full bg-[#1a2333] border border-gray-700/50 rounded-xl px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-dialora-indigo/50 transition-all resize-none group-hover:border-gray-600"
                placeholder="Q: How much does it cost? A: $99/mo.
Objection: Too expensive -> Offer 30 days free."
                value={formData.knowledge_base}
                onChange={e => setFormData({ ...formData, knowledge_base: e.target.value })}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 relative z-10 animate-fade-in flex-1 flex flex-col items-center justify-center">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white">Upload Lead Contacts</h2>
              <p className="text-gray-400 mt-2">Optional. You can also simulate the campaign directly.</p>
            </div>
            
            <label className="w-full max-w-lg cursor-pointer group">
              <div className={`border-2 border-dashed rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center gap-4 ${fileObj ? 'border-dialora-success bg-dialora-success/5' : 'border-gray-600 hover:border-dialora-accent hover:bg-[#1a2333]/50'}`}>
                {fileObj ? (
                  <>
                    <div className="w-16 h-16 bg-dialora-success/20 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-dialora-success animate-fade-in" />
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold text-lg">{fileObj.name}</p>
                      <p className="text-sm text-dialora-success mt-1">Ready for import</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-[#1a2333] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                      <UploadCloud className="w-8 h-8 text-dialora-accent" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-white font-bold text-lg group-hover:text-dialora-accent transition-colors">Click to upload CSV</p>
                      <p className="text-sm text-gray-500">Format: name, phone_number</p>
                    </div>
                  </>
                )}
                <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
              </div>
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in text-center p-10">
            <div className="w-24 h-24 bg-dialora-success/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <CheckCircle className="w-12 h-12 text-dialora-success" />
            </div>
            <h2 className="text-3xl font-black text-white mb-2">Campaign Activated!</h2>
            <p className="text-gray-400 text-lg mb-10">Local AI framework initialized.</p>
            
            {/* Auto Dialer Feature */}
            <div className="bg-[#0a0f1e] border border-gray-800 rounded-2xl p-8 w-full max-w-md flex flex-col items-center">
              {dialingStatus === 'idle' ? (
                <>
                  <button 
                    onClick={async () => {
                      if (!newCampaignId) return;
                      setDialingStatus('starting');
                      try {
                        const res = await fetch(`http://localhost:8000/api/campaign/${newCampaignId}/autodial`, { method: 'POST' });
                        if (!res.ok) throw new Error();
                        const d = await res.json();
                        setTotalQueued(d.contacts_queued);
                        setDialingStatus('dialing');
                        showToast(`Started auto-dialing ${d.contacts_queued} contacts`, 'success');
                      } catch {
                        showToast('Failed to start auto-dialer or no pending contacts', 'error');
                        setDialingStatus('idle');
                      }
                    }}
                    className="flex justify-center items-center gap-3 w-full bg-[#2ee2a3] hover:bg-[#20c28a] text-[#0a0f1e] font-bold text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(46,226,163,0.3)] transition-all hover:scale-105"
                  >
                    <Rocket className="w-6 h-6" /> Launch Auto-Dialer
                  </button>
                  <p className="text-gray-500 text-xs mt-4 italic">Automatically rings pending contacts via local Asterisk SIP</p>
                </>
              ) : (
                <div className="w-full flex flex-col items-center">
                  <div className="flex items-center gap-3 text-[#2ee2a3] font-bold text-lg mb-4">
                    <Phone className="w-5 h-5 animate-pulse" /> 
                    Dialing contact {Math.min(dialedContacts.length + 1, totalQueued)} of {totalQueued}...
                  </div>
                  
                  {/* Live Feed */}
                  <div className="w-full h-32 overflow-hidden flex flex-col gap-2 relative">
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[#0a0f1e] to-transparent z-10"></div>
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-[#0a0f1e] to-transparent z-10"></div>
                    {dialedContacts.map((name, i) => (
                      <div key={i} className="bg-[#111827] border border-gray-800 text-gray-300 text-sm py-2 px-4 rounded-lg flex justify-between animate-fade-in" style={{ opacity: 1 - (i * 0.2) }}>
                        <span>Dialing <strong>{name}</strong></span>
                        <span className="text-[#2ee2a3] text-xs uppercase tracking-widest">Calling</span>
                      </div>
                    ))}
                    {dialedContacts.length === 0 && (
                      <div className="text-gray-600 text-sm mt-4">Waiting for first connection...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <button onClick={() => navigate('/')} className="mt-8 text-gray-400 hover:text-white transition-colors">
              Return to Dashboard
            </button>
          </div>
        )}

        {/* Navigation Footer */}
        {step < 4 && (
          <div className="mt-auto pt-6 border-t border-gray-800 flex justify-between items-center relative z-10 bg-[#111827]">
            {step > 1 ? (
              <button onClick={handleBack} className="flex items-center gap-2 text-gray-400 hover:text-white px-4 py-2 transition-colors font-medium rounded-lg hover:bg-[#1a2333]">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : <div></div>}
            
            {step < 3 ? (
              <button onClick={handleNext} className="flex items-center gap-2 bg-[#1a2333] hover:bg-[#253147] text-white px-6 py-2.5 rounded-full font-bold transition-all shadow-md group">
                Continue <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <button 
                onClick={handleSubmit} 
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-gradient-to-r from-dialora-indigo to-cyan-500 hover:from-cyan-500 hover:to-dialora-indigo text-white px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                {isSubmitting ? <span className="animate-pulse">Launching...</span> : <><Save size={18}/> Create Campaign</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
