import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { autoCardTables } from './lib/tables';
import { firebaseBackend } from './lib/firebase';
import { SessionProvider } from './lib/session';
import { UpdateToast } from './ui/UpdateToast';
import './tokens.css';
import './styles.css';

const backend = firebaseBackend();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider backend={backend} apiBase={import.meta.env.VITE_API_URL ?? ''}>
      <App />
      <UpdateToast />
    </SessionProvider>
  </StrictMode>,
);
autoCardTables();
