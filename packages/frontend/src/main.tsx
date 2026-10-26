import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './globals.css';
import { useAuthStore } from './stores/authStore';

// The session is gone (expired, signed out in another tab, account reset): the server marks exactly that 401
// with X-Signed-Out. Other 401s (e.g. a remote action without a connection) must not sign anyone out.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await nativeFetch(input, init);
  if (res.status === 401 && res.headers.get('X-Signed-Out') === '1') useAuthStore.getState().signedOut();
  return res;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
