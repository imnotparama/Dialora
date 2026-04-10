// Central API configuration
// In production: set VITE_BACKEND_URL in your Vercel environment variables
// In development: falls back to localhost:8000

const raw = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Strip trailing slash
export const BACKEND_URL = raw.replace(/\/$/, '');

// WebSocket base (ws:// or wss://)
export const WS_URL = BACKEND_URL
  .replace(/^https:\/\//, 'wss://')
  .replace(/^http:\/\//, 'ws://');
