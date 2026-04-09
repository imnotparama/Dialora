import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center text-center p-8">
        <div>
          <div className="text-6xl mb-4">⚡</div>
          <h1 className="text-cyan-400 text-2xl font-semibold mb-2">Dialora encountered an error</h1>
          <p className="text-gray-400 mb-6">The system hit an unexpected state.</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-cyan-500 text-white px-6 py-3 rounded-xl hover:bg-cyan-400 transition-colors"
          >
            Restart Dialora
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
