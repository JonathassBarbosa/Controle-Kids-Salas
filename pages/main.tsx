import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../app/page';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

// Modo offline: registra o service worker (public/sw.js) para o app abrir sem internet.
// Só funciona em HTTPS (GitHub Pages) ou localhost.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
