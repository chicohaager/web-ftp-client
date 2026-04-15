import { create } from 'zustand';
import type { TransferItem, WsEvent } from '@web-ftp-client/shared';

interface TransferState {
  items: TransferItem[];
  collapsed: boolean;
  addItems: (items: TransferItem[]) => void;
  updateFromWs: (event: WsEvent) => void;
  toggleCollapsed: () => void;
  clearCompleted: () => void;
  cancelTransfer: (id: string) => Promise<void>;
}

export const useTransferStore = create<TransferState>((set) => ({
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

  clearCompleted: () => set((state) => ({
    items: state.items.filter(t => t.status !== 'completed' && t.status !== 'failed'),
  })),

  cancelTransfer: async (id) => {
    try {
      await fetch(`/api/remote/transfers/${id}`, { method: 'DELETE' });
      set((state) => ({ items: state.items.filter(t => t.id !== id) }));
    } catch { /* ignore */ }
  },
}));
