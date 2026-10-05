import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore, type ThemePreference } from '@/stores/themeStore';

const CYCLE: ThemePreference[] = ['light', 'dark', 'system'];

const LABEL: Record<ThemePreference, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'System theme',
};

const ICON: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  const next = CYCLE[(CYCLE.indexOf(preference) + 1) % CYCLE.length];
  const Icon = ICON[preference];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABEL[preference]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`${LABEL[preference]} — click for ${LABEL[next].toLowerCase()}`}
      onClick={() => setPreference(next)}
    >
      <Icon />
    </Button>
  );
}
