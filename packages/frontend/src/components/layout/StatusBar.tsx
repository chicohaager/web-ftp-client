import { useConnectionStore } from '@/stores/connectionStore';
import { useTransferStore } from '@/stores/transferStore';
import { useUiStore } from '@/stores/uiStore';
import { Circle, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatusBar() {
  const { status, host, port } = useConnectionStore();
  const { items } = useTransferStore();
  const { theme, toggleTheme } = useUiStore();

  const active = items.filter(t => t.status === 'active').length;
  const queued = items.filter(t => t.status === 'queued').length;

  return (
    <footer className="flex items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <Circle
          className={cn(
            'w-2 h-2 fill-current',
            status.status === 'connected' && 'text-[hsl(var(--success))]',
            status.status === 'connecting' && 'text-[hsl(var(--warning))] animate-pulse',
            status.status === 'error' && 'text-destructive',
            status.status === 'disconnected' && 'text-muted-foreground',
          )}
        />
        {status.status === 'connected'
          ? `Connected to ${host}:${port}`
          : status.status === 'connecting'
            ? 'Connecting...'
            : status.status === 'error'
              ? `Error: ${status.error}`
              : 'Disconnected'}
      </div>

      {/* Transfer status */}
      {(active > 0 || queued > 0) && (
        <span>{active} active, {queued} queued</span>
      )}
      {status.serverInfo && (
        <span>{status.serverInfo}</span>
      )}

      <div className="flex-1" />

      {/* Copyright */}
      <span className="text-[10px] text-muted-foreground/60">
        &copy; 2026 Virtual Services - Holger Kuehn
      </span>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className={cn(
          'relative flex items-center w-[42px] h-[20px] rounded-full px-[3px] transition-colors duration-200',
          theme === 'dark'
            ? 'bg-primary/30'
            : 'bg-muted-foreground/20',
        )}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <span
          className={cn(
            'flex items-center justify-center w-[16px] h-[16px] rounded-full bg-card shadow-sm transition-transform duration-200',
            theme === 'dark' ? 'translate-x-[20px]' : 'translate-x-0',
          )}
        >
          {theme === 'dark'
            ? <Moon className="w-[10px] h-[10px] text-primary" />
            : <Sun className="w-[10px] h-[10px] text-amber-500" />
          }
        </span>
      </button>
    </footer>
  );
}
