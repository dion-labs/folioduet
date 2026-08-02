import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import AppV2 from './AppV2';
import { AppErrorBoundary } from './components/AppErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppV2 />
    </AppErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Dev: prefer a clean network path so stale shells can't mask auth fixes.
    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is best-effort; the app still works without a SW.
    });
  });
}
