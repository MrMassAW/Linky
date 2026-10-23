import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { FullPageSpinner } from './components/ui';
import { SessionProvider } from './state/session';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider fallback={<FullPageSpinner />}>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
