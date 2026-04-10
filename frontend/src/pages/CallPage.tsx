import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function CallPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  // Use the actual IP the phone connected to, ignoring the backend's guess
  const host = window.location.hostname;
  const [callState, setCallState] = useState<'idle'|'connecting'|'active'|'ended'>('idle');
  const [messages, setMessages] = useState<{role:string, text:string, emotion?:string}[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [currentIntent, setCurrentIntent] = useState('NEUTRAL');
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const wsRef = useRef<WebSocket|null>(null);
  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, liveTranscript]);

  const startCall = () => {
    setCallState('connecting');
    const ws = new WebSocket(`ws://${host}:8000/ws/call/${sessionId}`);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setCallState('active');
      callActiveRef.current = true;
      startListening();
    };
    
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'ai_reply') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: data.text,
          emotion: data.emotion
        }]);
        setCurrentIntent(data.intent);
        
        // Play audio
        if (data.audio_url) {
          setIsAISpeaking(true);
          recognitionRef.current?.stop();
          const audio = new Audio(data.audio_url);
          audio.onended = () => {
            setIsAISpeaking(false);
            if (callActiveRef.current) {
              startListening();
            }
          };
          audio.onerror = () => {
            setIsAISpeaking(false);
            if (callActiveRef.current) startListening();
          };
          audio.play().catch(() => {
            setIsAISpeaking(false);
            if (callActiveRef.current) startListening();
          });
        }
      }
      
      if (data.type === 'call_ended' || data.type === 'error') {
        endCall();
      }
    };
    
    ws.onerror = () => setCallState('ended');
    ws.onclose = () => {
      if (callActiveRef.current) setCallState('ended');
    };
  };

  const startListening = () => {
    if (!callActiveRef.current || isAISpeaking) return;
    
    const SR = (window as any).webkitSpeechRecognition 
      || (window as any).SpeechRecognition;
    if (!SR) return;
    
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    
    let finalTranscript = '';
    
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
          setLiveTranscript('');
          setMessages(prev => [...prev, {
            role: 'user', text: finalTranscript.trim()
          }]);
          wsRef.current?.send(JSON.stringify({
            type: 'user_speech',
            text: finalTranscript.trim()
          }));
          finalTranscript = '';
        } else {
          interim += t;
          setLiveTranscript(interim);
        }
      }
    };
    
    recognition.onend = () => {
      if (callActiveRef.current && !isAISpeaking) {
        // Delay slightly to prevent browser freeze loops on strict HTTP denial
        setTimeout(() => {
          if (callActiveRef.current && !isAISpeaking) {
            try { recognition.start(); } catch (e) { console.error("Mic start err:", e); }
          }
        }, 300);
      }
    };
    
    recognition.onerror = (e: any) => {
      console.error("Speech Recognition Error:", e.error);
      if (e.error === 'not-allowed') {
        setCallState('ended');
        wsRef.current?.close();
        alert("Microphone permission denied! Mobile browsers require HTTPS for microphone access.");
        return;
      }
      if (e.error === 'no-speech') {
        try { recognition.start(); } catch (err) {}
      }
    };
    
    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { console.error("Initial mic start err:", e); }
  };

  const endCall = () => {
    callActiveRef.current = false;
    recognitionRef.current?.stop();
    wsRef.current?.send(JSON.stringify({ type: 'end_call' }));
    wsRef.current?.close();
    setCallState('ended');
  };

  if (callState === 'idle') {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6">
        <div className="text-4xl mb-2">🤙</div>
        <h1 className="text-cyan-400 text-3xl font-bold mb-1">DIALORA</h1>
        <p className="text-gray-400 text-sm mb-2">AI Voice Agent</p>
        <div className="w-px h-8 bg-gray-700 mb-6"></div>
        <div className="bg-[#111827] border border-cyan-500/20 rounded-2xl p-6 w-full max-w-sm mb-8 text-center">
          <p className="text-gray-300 text-sm">
            You are connected to an AI calling agent.
            Press the button below to start the conversation.
          </p>
        </div>
        <button onClick={startCall}
          className="bg-green-500 hover:bg-green-400 text-white font-bold px-12 py-5 rounded-full text-xl flex items-center gap-3 shadow-lg shadow-green-500/30 active:scale-95 transition-all duration-150">
          📞 Call Now
        </button>
        <p className="text-gray-600 text-xs mt-4">
          Chrome + Microphone required
        </p>
      </div>
    );
  }

  if (callState === 'ended') {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-white text-2xl font-semibold mb-2">Call Ended</h2>
        <p className="text-gray-400 text-sm mb-6">Thank you for speaking with Dialora.</p>
        <p className="text-cyan-400 text-sm">Final Intent: {currentIntent}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <div className="bg-[#111827] border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h2 className="text-cyan-400 font-bold text-lg">DIALORA</h2>
          <p className="text-gray-500 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            LIVE CALL
          </p>
        </div>
        <div className="bg-[#1a2333] border border-cyan-500/30 text-cyan-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
          {currentIntent}
        </div>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 text-sm shadow-md ${
              m.role === 'user'
              ? 'bg-[#1a2333] text-gray-200 rounded-2xl rounded-tr-sm border border-gray-700'
              : 'bg-gradient-to-br from-cyan-900 to-cyan-950 text-white border-l-4 border-cyan-400 rounded-2xl rounded-tl-sm'
            }`}>
              <span className="block text-[10px] uppercase font-bold tracking-widest text-cyan-500/60 mb-1">
                {m.role === 'user' ? 'You' : 'Nandita'}
              </span>
              {m.text}
            </div>
          </div>
        ))}
        {liveTranscript && (
          <div className="flex justify-end opacity-70">
            <div className="max-w-[85%] px-4 py-3 text-sm bg-[#1a2333] text-gray-400 rounded-2xl rounded-tr-sm border border-gray-700 italic">
              {liveTranscript}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      
      <div className="p-4 bg-[#111827] border-t border-gray-800 sticky bottom-0">
        <button onClick={endCall}
          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-red-600/20 active:scale-95 text-lg">
          End Call
        </button>
      </div>
    </div>
  );
}
