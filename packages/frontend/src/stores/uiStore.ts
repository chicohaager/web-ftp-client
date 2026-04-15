import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface UiState {
  focusedPanel: 'local' | 'remote';
  theme: Theme;
  setFocusedPanel: (panel: 'local' | 'remote') => void;
  toggleTheme: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('ftp-client-theme') as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('ftp-client-theme', theme);
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useUiStore = create<UiState>((set) => ({
  focusedPanel: 'local',
  theme: initialTheme,
  setFocusedPanel: (panel) => set({ focusedPanel: panel }),
  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return { theme: next };
  }),
}));
