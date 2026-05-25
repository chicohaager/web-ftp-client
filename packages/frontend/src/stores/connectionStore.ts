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
  // Read-only intent for the next connect; sourced from a loaded saved-connection
  // or the manual checkbox, sent in the /connect body, and echoed back from
  // status.readOnly to keep the UI in sync.
  readOnly: boolean;
  sessionId: string | null;
  status: ConnectionStatus;
  savedConnections: ConnectionConfig[];

  // Defaults from the most recently loaded saved-connection, consumed by AppLayout
  // after a successful connect to jump both panes to the right folders.
  pendingDefaultLocalPath: string | null;
  pendingDefaultRemotePath: string | null;

  setField: (field: string, value: string | number) => void;
  setProtocol: (protocol: Protocol) => void;
  setStatus: (status: ConnectionStatus) => void;
  setReadOnly: (value: boolean) => void;
  setSavedConnections: (connections: ConnectionConfig[]) => void;
  loadSavedConnection: (conn: ConnectionConfig) => void;
  clearPendingDefaults: () => void;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  fetchConnections: () => Promise<void>;
  saveConnection: (name: string, opts?: { defaultLocalPath?: string; defaultRemotePath?: string; readOnly?: boolean }) => Promise<void>;
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
  readOnly: false,
  sessionId: null,
  status: { status: 'disconnected' },
  savedConnections: [],
  pendingDefaultLocalPath: null,
  pendingDefaultRemotePath: null,

  setField: (field, value) => set({ [field]: value }),
  setProtocol: (protocol) => {
    const state = get();
    const portIsDefault = Object.values(DEFAULT_PORTS).includes(state.port);
    set({ protocol, ...(portIsDefault ? { port: DEFAULT_PORTS[protocol] } : {}) });
  },
  setStatus: (status) => set({ status }),
  setReadOnly: (value) => set({ readOnly: value }),
  setSavedConnections: (connections) => set({ savedConnections: connections }),
  loadSavedConnection: (conn) => set({
    host: conn.host,
    port: conn.port,
    protocol: conn.protocol,
    username: conn.username,
    password: '',
    privateKey: '',
    passphrase: '',
    readOnly: !!conn.readOnly,
    pendingDefaultLocalPath: conn.defaultLocalPath ?? null,
    pendingDefaultRemotePath: conn.defaultRemotePath ?? null,
  }),
  clearPendingDefaults: () => set({ pendingDefaultLocalPath: null, pendingDefaultRemotePath: null }),

  connect: async () => {
    const { host, port, protocol, username, password, privateKey, passphrase, readOnly } = get();
    set({ status: { status: 'connecting' } });
    try {
      const body: Record<string, unknown> = { host, port, protocol, username, password, readOnly };
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
        // Drop any pending bookmark defaults on failure so they don't latch
        // onto the next successful connection (which may be a different host).
        set({
          status: { status: 'error', error: data.error },
          pendingDefaultLocalPath: null,
          pendingDefaultRemotePath: null,
        });
      }
    } catch (err) {
      set({
        status: { status: 'error', error: err instanceof Error ? err.message : 'Connection failed' },
        pendingDefaultLocalPath: null,
        pendingDefaultRemotePath: null,
      });
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
    set({
      status: { status: 'disconnected' },
      sessionId: null,
      pendingDefaultLocalPath: null,
      pendingDefaultRemotePath: null,
    });
  },

  fetchConnections: async () => {
    try {
      const res = await fetch('/api/connections');
      const data = await res.json();
      if (data.ok) set({ savedConnections: data.data });
    } catch { /* ignore */ }
  },

  saveConnection: async (name, opts) => {
    const { host, port, protocol, username, password, privateKey, readOnly } = get();
    try {
      await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, host, port, protocol, username, password, privateKey,
          defaultLocalPath: opts?.defaultLocalPath ?? '',
          defaultRemotePath: opts?.defaultRemotePath ?? '',
          readOnly: opts?.readOnly ?? readOnly,
        }),
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
