import { useEffect, useRef } from 'react';
import { useTransferStore } from '@/stores/transferStore';
import type { WsEvent } from '@web-ftp-client/shared';

export function useWebSocket() {
  const updateFromWs = useTransferStore((s) => s.updateFromWs);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 10;

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        retriesRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: WsEvent = JSON.parse(event.data);
          updateFromWs(data);
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (retriesRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 16000);
          retriesRef.current++;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      retriesRef.current = maxRetries; // Prevent reconnect on cleanup
      wsRef.current?.close();
    };
  }, [updateFromWs]);
}
