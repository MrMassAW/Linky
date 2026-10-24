import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { FullPageSpinner } from './components/ui';
import { SessionProvider } from './state/session';
import './index.css';

registerSW({ immediate: true });

const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <SessionProvider fallback={<FullPageSpinner />}>
        <App />
      </SessionProvider>
    </Router>
  </StrictMode>,
);
