import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

const MAX_EDIT_BYTES = 1 * 1024 * 1024; // mirror of backend PREVIEW_MAX_BYTES

interface EditDialogProps {
  open: boolean;
  fileName: string;
  path: string;
  initialContent: string | null;
  loading: boolean;            // pre-load fetch in progress
  saving: boolean;
  error: string | null;
  truncated: boolean;          // if true, edit is disabled (file too large)
  onSave: (content: string) => void;
  onClose: () => void;
}

export function EditDialog({
  open, fileName, path, initialContent, loading, saving, error, truncated, onSave, onClose,
}: EditDialogProps) {
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);

  // Sync draft to initialContent whenever the dialog re-opens with a fresh file
  useEffect(() => {
    if (open && initialContent !== null) {
      setDraft(initialContent);
      setDirty(false);
    }
  }, [open, initialContent]);

  // Live byte size in UTF-8 — disables Save before the user gets a 413 from
  // the backend. TextEncoder runs every keystroke, but the work is microscopic
  // for sub-megabyte buffers.
  const draftBytes = useMemo(() => new TextEncoder().encode(draft).byteLength, [draft]);
  const overSize = draftBytes > MAX_EDIT_BYTES;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-3xl w-[min(800px,92vw)] grid-rows-[auto_1fr_auto] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{fileName}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{path}</DialogDescription>
          {(initialContent !== null && !error && !truncated) && (
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="success" className="gap-1 normal-case tracking-normal">
                <ShieldCheck className="w-3 h-3" />
                .bak backup created on save
              </Badge>
              <Badge
                variant={overSize ? 'destructive' : 'secondary'}
                className="font-mono normal-case tracking-normal"
              >
                {formatBytes(draftBytes)} / {formatBytes(MAX_EDIT_BYTES)}
              </Badge>
            </div>
          )}
          {truncated && (
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="destructive">File too large to edit (&gt; 1 MiB)</Badge>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 overflow-hidden rounded-md border border-border bg-card">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading file&hellip;</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-destructive gap-2">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
              spellCheck={false}
              disabled={truncated || saving}
              className={cn(
                'block w-full h-[55vh] font-mono text-xs leading-relaxed p-4 bg-card text-foreground resize-none focus:outline-none disabled:opacity-60',
                overSize && 'ring-2 ring-destructive ring-inset',
              )}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={!dirty || saving || loading || truncated || overSize || error !== null}
            title={overSize ? `Content exceeds ${formatBytes(MAX_EDIT_BYTES)} cap` : undefined}
          >
            {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save with backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
