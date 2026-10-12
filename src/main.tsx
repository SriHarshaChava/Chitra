import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { enableDebugConsoleIfRequested } from './platform/debugConsole';
import './styles.css';

void enableDebugConsoleIfRequested();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
