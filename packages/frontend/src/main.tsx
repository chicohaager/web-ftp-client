import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './globals.css';
import { useAuthStore } from './stores/authStore';

// A 401 from any API call means the session is gone (expired, or signed out in another tab): back to sign-in.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await nativeFetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (res.status === 401 && url.includes('/api/') && !url.includes('/api/auth/')) useAuthStore.getState().signedOut();
  return res;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
