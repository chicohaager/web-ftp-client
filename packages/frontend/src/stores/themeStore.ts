import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Shared with the inline no-flash script in index.html — keep in sync. */
export const THEME_STORAGE_KEY = 'ftp-client-theme';

/** Drives the browser UI (address bar, ZimaOS webview chrome) per theme. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#234B3E',
  dark: '#0F1915',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(stored)) return stored;
  } catch {
    // Private mode / blocked storage — fall through to the OS preference.
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Stamps the resolved theme on <html>. The attribute — not a media query — is
 * what globals.css keys off, so an explicit choice always beats the OS.
 */
function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved]);
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const initialPreference = readStoredPreference();

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initialPreference,
  resolved: resolveTheme(initialPreference),

  setPreference: (preference) => {
    const resolved = resolveTheme(preference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Preference is lost on reload, but the current session still applies.
    }
    applyTheme(resolved);
    set({ preference, resolved });
  },
}));

// Re-apply on OS changes, but only while the user is still on 'system'.
window.matchMedia(DARK_QUERY).addEventListener('change', () => {
  const { preference } = useThemeStore.getState();
  if (preference !== 'system') return;
  const resolved = systemTheme();
  applyTheme(resolved);
  useThemeStore.setState({ resolved });
});

// The no-flash script already set the attribute before paint; this reconciles
// the meta colour and covers the case where the script was stripped.
applyTheme(resolveTheme(initialPreference));
