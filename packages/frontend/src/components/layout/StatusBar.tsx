import { useConnectionStore } from '@/stores/connectionStore';
import { useTransferStore } from '@/stores/transferStore';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatusBar() {
  const { status, host, port } = useConnectionStore();
  const { items } = useTransferStore();

  const active = items.filter(t => t.status === 'active').length;
  const queued = items.filter(t => t.status === 'queued').length;

  return (
    <footer className="flex items-center gap-4 border-t bg-card px-4 text-[12px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Circle
          className={cn(
            'w-2 h-2 fill-current',
            status.status === 'connected' && 'text-success',
            status.status === 'connecting' && 'text-warning animate-pulse',
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

      {(active > 0 || queued > 0) && (
        <span>{active} active, {queued} queued</span>
      )}
      {status.serverInfo && (
        <span>{status.serverInfo}</span>
      )}

      <div className="flex-1" />

      <span className="text-[10px] text-muted-foreground/60">
        &copy; 2026 Virtual Services &mdash; Holger Kuehn
      </span>
    </footer>
  );
}
