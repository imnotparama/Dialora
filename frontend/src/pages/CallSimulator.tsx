import React, { useState, useRef, useEffect } from 'react';
import { Mic, Activity, User, Bot, AlertCircle } from 'lucide-react';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export default function CallSimulator() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [intent, setIntent] = useState<string>('Neutral');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    const fd = new FormData();
    fd.append('session_id', sessionId);
    fetch('http://localhost:8000/api/simulate/start', {
      method: 'POST',
      body: fd
    }).catch(console.error);

    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        handleTurn(text);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [sessionId]);

  const startRecording = () => {
    if (!recognitionRef.current) {
      alert("Your browser does not support the Web Speech API. Please use Chrome.");
      return;
    }
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (e) {
       console.error("Recording already in progress");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  const handleTurn = async (userText: string) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('user_text', userText);

    try {
      const res = await fetch('http://localhost:8000/api/simulate/turn', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.error) {
        setIsProcessing(false);
        return;
      }

      setMessages(prev => [
        ...prev, 
        { role: 'user', content: data.user_text || "[Unintelligible]" },
        { role: 'assistant', content: data.reply }
      ]);
      setIntent(data.intent);
      
      if (data.audio_url) {
        const audio = new Audio(data.audio_url);
        audio.play();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const getIntentColor = () => {
    if (intent.includes('Not Interested')) return 'bg-dialora-danger shadow-[0_0_15px_rgba(239,68,68,0.5)]';
    if (intent.includes('Interested')) return 'bg-dialora-success shadow-[0_0_15px_rgba(16,185,129,0.5)]';
    return 'bg-dialora-warning shadow-[0_0_15px_rgba(245,158,11,0.5)]';
  };

  return (
    <div className="flex flex-col h-full bg-dialora-navy p-6 gap-6 relative">
      <header className="flex justify-between items-center bg-dialora-card p-4 rounded-xl shadow-lg border border-gray-800">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-dialora-accent to-dialora-indigo bg-clip-text text-transparent">Simulator Studio</h1>
          <p className="text-gray-400 text-sm mt-1">Demoing emotion-aware response architecture.</p>
        </div>
        
        <div className="flex items-center gap-4 bg-[#0d1530] p-3 rounded-lg border border-gray-700/50 relative overflow-hidden">
          <Activity className="text-gray-400 w-5 h-5 relative z-10" />
          <span className="font-semibold text-gray-300 relative z-10">Live Intent:</span>
          <div className={`px-4 py-1.5 rounded-full text-white font-bold text-sm transition-all duration-500 relative z-10 ${getIntentColor()}`}>
            {intent.toUpperCase()}
          </div>
        </div>
      </header>

      <div className="flex-1 bg-dialora-card/50 rounded-xl overflow-y-auto p-6 flex flex-col gap-6 border border-gray-800/40 relative shadow-inner">
        {messages.length === 0 && !isProcessing && (
          <div className="m-auto flex flex-col items-center justify-center opacity-40 gap-4 text-center mt-[10%]">
            <Mic className="w-20 h-20 text-dialora-indigo object-contain" />
            <p className="text-xl font-medium tracking-wide">Hold the microphone below to start the call.</p>
            <p className="text-sm text-gray-300">Speak normally. The AI will adapt perfectly.</p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex w-full animate-fade-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-4 max-w-[80%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg ${
                m.role === 'user' ? 'bg-gradient-to-br from-dialora-indigo to-purple-600 text-white' : 'bg-[#1e2a4a] text-dialora-accent border border-dialora-accent/30'
              }`}>
                {m.role === 'user' ? <User size={24} /> : <Bot size={24} />}
              </div>
              <div className={`p-4 rounded-xl shadow-md text-[15px] leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-dialora-indigo/15 border border-dialora-indigo/30 text-blue-50' 
                  : 'bg-[#111933] border border-gray-700/50 text-gray-200'
              }`}>
                {m.content}
              </div>
            </div>
          </div>
        ))}
        {isProcessing && (
           <div className="flex w-full justify-start animate-fade-in">
             <div className="flex gap-4 max-w-[75%]">
               <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-[#1e2a4a] text-dialora-accent border border-gray-600">
                 <Bot size={24} />
               </div>
               <div className="p-4 rounded-xl bg-[#111933] border border-gray-700/50 text-gray-400 flex items-center gap-3">
                 <div className="w-2 h-2 rounded-full bg-dialora-accent animate-ping"></div>
                 Processing STT & LLM...
               </div>
             </div>
           </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex justify-center mt-auto pb-4 pt-4 relative">
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          disabled={isProcessing}
          className={`flex items-center justify-center w-28 h-28 rounded-full transition-all duration-200 z-10 ${
            isRecording 
              ? 'bg-dialora-danger scale-110 shadow-[0_0_40px_rgba(239,68,68,0.7)] animate-pulse'
              : 'bg-gradient-to-b from-dialora-indigo to-[#3c1dae] hover:scale-[1.03] shadow-[0_0_25px_rgba(92,51,255,0.4)] disabled:opacity-50'
          }`}
        >
          <Mic className="w-12 h-12 text-white" />
        </button>
        
        {!isRecording && !isProcessing && (
          <div className="absolute top-[120px] left-1/2 -translate-x-1/2 text-sm text-gray-400 font-bold tracking-[0.2em]">
            HOLD TO TALK
          </div>
        )}
      </div>
    </div>
  );
}
