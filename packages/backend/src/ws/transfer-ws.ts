import type { WebSocketServer, WebSocket } from 'ws';
import { transferQueue } from '../services/transfer-queue.js';
import type { WsEvent } from '@web-ftp-client/shared';

export function setupTransferWs(wss: WebSocketServer): void {
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  transferQueue.on('ws', (event: WsEvent) => {
    const message = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  });
}
