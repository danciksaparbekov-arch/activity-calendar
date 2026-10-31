import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { CirclesProvider } from './circles';
import './styles.css';

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
