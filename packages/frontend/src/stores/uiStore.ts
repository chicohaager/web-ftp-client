import { create } from 'zustand';

interface UiState {
  focusedPanel: 'local' | 'remote';
  setFocusedPanel: (panel: 'local' | 'remote') => void;
}

export const useUiStore = create<UiState>((set) => ({
  focusedPanel: 'local',
  setFocusedPanel: (panel) => set({ focusedPanel: panel }),
}));
