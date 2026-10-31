import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { CirclesProvider } from './circles';
import './styles.css';

// service worker нужен для установки приложения; в разработке (npm run dev) не подключаем
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <CirclesProvider>
          <App />
        </CirclesProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
