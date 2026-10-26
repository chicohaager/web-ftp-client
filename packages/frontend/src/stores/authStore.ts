import { create } from 'zustand';

export type AuthPhase = 'loading' | 'setup' | 'login' | 'ready' | 'unreachable';

interface AuthState {
  phase: AuthPhase;
  username: string | null;
  refresh: () => Promise<void>;
  setup: (username: string, password: string, setupCode: string) => Promise<string | null>;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  signedOut: () => void;
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; error?: string; data?: { username?: string } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    return { ...(await res.json()), status: res.status };
  } catch {
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  phase: 'loading',
  username: null,

  refresh: async () => {
    try {
      const res = await fetch('/api/auth/status');
      const json = await res.json();
      const d = json.data as { setupRequired: boolean; signedIn: boolean; username: string | null };
      set({ phase: d.setupRequired ? 'setup' : d.signedIn ? 'ready' : 'login', username: d.username });
    } catch {
      set({ phase: 'unreachable' });
    }
  },

  setup: async (username, password, setupCode) => {
    const r = await post('/api/auth/setup', { username, password, setupCode });
    if (r.status === 409) { await get().refresh(); return null; }  // created meanwhile (another tab): sign in
    if (!r.ok) return r.error ?? 'Setup failed';
    set({ phase: 'ready', username: r.data?.username ?? username });
    return null;
  },

  login: async (username, password) => {
    const r = await post('/api/auth/login', { username, password });
    if (!r.ok) return r.error ?? 'Sign-in failed';
    set({ phase: 'ready', username: r.data?.username ?? username });
    return null;
  },

  logout: async () => {
    await post('/api/auth/logout', {}).catch(() => undefined);
    set({ phase: 'login', username: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    const r = await post('/api/auth/password', { currentPassword, newPassword });
    return r.ok ? null : (r.error ?? 'Password change failed');
  },

  // Session gone (expired, signed out elsewhere, account reset): ask the server whether sign-in or setup is next.
  signedOut: () => {
    if (get().phase === 'ready') void get().refresh();
  },
}));
