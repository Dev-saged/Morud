import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { firebaseBackend } from './lib/firebase';
import { SessionProvider } from './lib/session';
import './tokens.css';
import './styles.css';

const backend = firebaseBackend();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider backend={backend} apiBase={import.meta.env.VITE_API_URL ?? ''}>
      <App />
    </SessionProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js');
