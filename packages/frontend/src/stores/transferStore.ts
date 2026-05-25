import { create } from 'zustand';
import type { TransferItem, WsEvent } from '@web-ftp-client/shared';
import { useConnectionStore } from '@/stores/connectionStore';

interface TransferState {
  items: TransferItem[];
  collapsed: boolean;
  addItems: (items: TransferItem[]) => void;
  updateFromWs: (event: WsEvent) => void;
  toggleCollapsed: () => void;
  clearCompleted: () => void;
  cancelTransfer: (id: string) => Promise<void>;
  retryTransfer: (id: string) => Promise<void>;
  retryAllFailed: () => Promise<void>;
}

function sessionHeaders(): Record<string, string> {
  const sessionId = useConnectionStore.getState().sessionId;
  return sessionId ? { 'x-session-id': sessionId } : {};
}

export const useTransferStore = create<TransferState>((set, get) => ({
  items: [],
  collapsed: false,

  addItems: (items) => set((state) => ({ items: [...state.items, ...items] })),

  updateFromWs: (event) => {
    set((state) => {
      const items = [...state.items];
      if (event.type === 'transfer:progress') {
        const idx = items.findIndex(t => t.id === event.data.id);
        if (idx !== -1) {
          items[idx] = { ...items[idx], ...event.data };
        }
      } else if (event.type === 'transfer:complete') {
        const idx = items.findIndex(t => t.id === event.data.id);
        if (idx !== -1) {
          items[idx] = { ...items[idx], status: 'completed' };
        }
      } else if (event.type === 'transfer:error') {
        const idx = items.findIndex(t => t.id === event.data.id);
        if (idx !== -1) {
          items[idx] = { ...items[idx], status: 'failed', error: event.data.error };
        }
      }
      return { items };
    });
  },

  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),

  // Only clears completed transfers — failed items stay so the user can retry.
  clearCompleted: () => set((state) => ({
    items: state.items.filter(t => t.status !== 'completed'),
  })),

  cancelTransfer: async (id) => {
    try {
      await fetch(`/api/remote/transfers/${id}`, { method: 'DELETE' });
      set((state) => ({ items: state.items.filter(t => t.id !== id) }));
    } catch { /* ignore */ }
  },

  retryTransfer: async (id) => {
    try {
      const res = await fetch(`/api/remote/transfers/${id}/retry`, {
        method: 'POST',
        headers: sessionHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        // Optimistic local reset; WS keeps us in sync from here.
        set((state) => ({
          items: state.items.map(t => t.id === id
            ? { ...t, status: 'queued', transferredBytes: 0, speed: 0, startTime: null, error: null }
            : t,
          ),
        }));
      }
    } catch { /* ignore */ }
  },

  retryAllFailed: async () => {
    const failed = get().items.filter(t => t.status === 'failed');
    await Promise.all(failed.map(t => get().retryTransfer(t.id)));
  },
}));
