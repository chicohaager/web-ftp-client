import { create } from 'zustand';
import type { ConnectionConfig, ConnectionStatus, Protocol } from '@web-ftp-client/shared';

interface ConnectionState {
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
  sessionId: string | null;
  status: ConnectionStatus;
  savedConnections: ConnectionConfig[];

  setField: (field: string, value: string | number) => void;
  setProtocol: (protocol: Protocol) => void;
  setStatus: (status: ConnectionStatus) => void;
  setSavedConnections: (connections: ConnectionConfig[]) => void;
  loadSavedConnection: (conn: ConnectionConfig) => void;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  fetchConnections: () => Promise<void>;
  saveConnection: (name: string) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
}

const DEFAULT_PORTS: Record<Protocol, number> = { ftp: 21, ftps: 990, sftp: 22 };

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  host: '',
  port: 21,
  protocol: 'ftp',
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
  sessionId: null,
  status: { status: 'disconnected' },
  savedConnections: [],

  setField: (field, value) => set({ [field]: value }),
  setProtocol: (protocol) => {
    const state = get();
    const portIsDefault = Object.values(DEFAULT_PORTS).includes(state.port);
    set({ protocol, ...(portIsDefault ? { port: DEFAULT_PORTS[protocol] } : {}) });
  },
  setStatus: (status) => set({ status }),
  setSavedConnections: (connections) => set({ savedConnections: connections }),
  loadSavedConnection: (conn) => set({
    host: conn.host,
    port: conn.port,
    protocol: conn.protocol,
    username: conn.username,
    password: '',
    privateKey: '',
    passphrase: '',
  }),

  connect: async () => {
    const { host, port, protocol, username, password, privateKey, passphrase } = get();
    set({ status: { status: 'connecting' } });
    try {
      const body: Record<string, unknown> = { host, port, protocol, username, password };
      if (privateKey) body.privateKey = privateKey;
      if (passphrase) body.passphrase = passphrase;

      const res = await fetch('/api/remote/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        set({ status: data.data, sessionId: data.data.sessionId ?? null });
      } else {
        set({ status: { status: 'error', error: data.error } });
      }
    } catch (err) {
      set({ status: { status: 'error', error: err instanceof Error ? err.message : 'Connection failed' } });
    }
  },

  disconnect: async () => {
    const { sessionId } = get();
    try {
      await fetch('/api/remote/disconnect', {
        method: 'POST',
        headers: sessionId ? { 'x-session-id': sessionId } : {},
      });
    } catch { /* ignore */ }
    set({ status: { status: 'disconnected' }, sessionId: null });
  },

  fetchConnections: async () => {
    try {
      const res = await fetch('/api/connections');
      const data = await res.json();
      if (data.ok) set({ savedConnections: data.data });
    } catch { /* ignore */ }
  },

  saveConnection: async (name) => {
    const { host, port, protocol, username, password, privateKey } = get();
    try {
      await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, host, port, protocol, username, password, privateKey }),
      });
      get().fetchConnections();
    } catch { /* ignore */ }
  },

  deleteConnection: async (id) => {
    try {
      await fetch(`/api/connections/${id}`, { method: 'DELETE' });
      get().fetchConnections();
    } catch { /* ignore */ }
  },
}));
