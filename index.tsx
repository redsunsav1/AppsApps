import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import BuyerConsent from './components/BuyerConsent';
import ErrorBoundary from './components/ErrorBoundary';

// Покупатель приходит по ссылке /consent/<токен> и пользователем приложения не
// является. Разводим до монтирования App, чтобы его не встретил экран входа.
const consentMatch = window.location.pathname.match(/^\/consent\/([a-f0-9]{64})\/?$/);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {consentMatch ? <BuyerConsent token={consentMatch[1]} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
