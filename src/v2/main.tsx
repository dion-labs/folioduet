import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import AppV2 from './AppV2';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppV2 />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is best-effort; the app still works without a SW.
    });
  });
}
