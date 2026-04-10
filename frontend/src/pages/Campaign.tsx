import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, CheckCircle, UploadCloud, ChevronRight, ChevronLeft, Building2, BrainCircuit } from 'lucide-react';
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
        showToast('Campaign successfully launched! 🎉', 'success');
        setStep(4); // Success screen
        setTimeout(() => navigate('/'), 2500);
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
            <div className="w-24 h-24 bg-dialora-success/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-12 h-12 text-dialora-success" />
            </div>
            <h2 className="text-3xl font-black text-white">Campaign Activated!</h2>
            <p className="text-gray-400 mt-2 text-lg">Wiring up local LLM endpoints...</p>
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
