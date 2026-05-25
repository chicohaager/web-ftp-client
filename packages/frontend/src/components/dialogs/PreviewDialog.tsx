import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatBytes } from '@/lib/format';
import { Loader2, AlertCircle } from 'lucide-react';

interface PreviewDialogProps {
  open: boolean;
  fileName: string;
  path: string;
  loading: boolean;
  error: string | null;
  content: string | null;
  truncated: boolean;
  size: number;
  bytesRead: number;
  onClose: () => void;
}

export function PreviewDialog({
  open, fileName, path, loading, error, content, truncated, size, bytesRead, onClose,
}: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[min(800px,92vw)] grid-rows-[auto_1fr_auto] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{fileName}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{path}</DialogDescription>
          {!loading && content !== null && (
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="secondary">
                {formatBytes(bytesRead)}{truncated ? ` / ${formatBytes(size)}` : ''}
              </Badge>
              {truncated && (
                <Badge variant="warning">truncated &mdash; download for the full file</Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 overflow-hidden rounded-md border border-border bg-secondary">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading preview&hellip;</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-destructive gap-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[60vh]">
              <pre className="font-mono text-xs leading-relaxed p-4 whitespace-pre-wrap break-words text-foreground">
                {content}
              </pre>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
