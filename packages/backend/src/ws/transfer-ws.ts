import type { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { transferQueue } from '../services/transfer-queue.js';
import { sessionUser, whenSessionsEnd } from '../services/auth.js';
import type { WsEvent } from '@web-ftp-client/shared';

const RECHECK_MS = 30_000;

export function setupTransferWs(wss: WebSocketServer): void {
  // each socket keeps the upgrade request: its cookie decides whether the session still exists
  const clients = new Map<WebSocket, IncomingMessage>();

  wss.on('connection', (ws, req) => {
    clients.set(ws, req);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // close every socket whose session ended (sign-out, password change, expiry, reset-account)
  const recheck = () => {
    for (const [ws, req] of clients) {
      if (!sessionUser(req)) {
        clients.delete(ws);
        ws.close(4401, 'Signed out');
      }
    }
  };
  whenSessionsEnd(recheck);
  setInterval(recheck, RECHECK_MS).unref();

  transferQueue.on('ws', (event: WsEvent) => {
    const message = JSON.stringify(event);
    for (const client of clients.keys()) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  });
}
