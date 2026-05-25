import { create } from 'zustand';

interface UiState {
  focusedPanel: 'local' | 'remote';
  showDetails: boolean;
  setFocusedPanel: (panel: 'local' | 'remote') => void;
  toggleShowDetails: () => void;
}

function getInitialShowDetails(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('ftp-client-show-details') === '1';
}

export const useUiStore = create<UiState>((set) => ({
  focusedPanel: 'local',
  showDetails: getInitialShowDetails(),
  setFocusedPanel: (panel) => set({ focusedPanel: panel }),
  toggleShowDetails: () => set((state) => {
    const next = !state.showDetails;
    try { window.localStorage.setItem('ftp-client-show-details', next ? '1' : '0'); } catch { /* ignore */ }
    return { showDetails: next };
  }),
}));
