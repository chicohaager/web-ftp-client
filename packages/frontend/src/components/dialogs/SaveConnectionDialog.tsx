import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SaveConnectionDialogProps {
  open: boolean;
  defaultName: string;
  defaultLocalPath?: string;
  defaultRemotePath?: string;
  defaultReadOnly?: boolean;
  onConfirm: (
    name: string,
    opts: { defaultLocalPath: string; defaultRemotePath: string; readOnly: boolean },
  ) => void;
  onCancel: () => void;
}

export function SaveConnectionDialog({
  open, defaultName, defaultLocalPath, defaultRemotePath, defaultReadOnly, onConfirm, onCancel,
}: SaveConnectionDialogProps) {
  const [name, setName] = useState(defaultName);
  const [localPath, setLocalPath] = useState(defaultLocalPath ?? '');
  const [remotePath, setRemotePath] = useState(defaultRemotePath ?? '');
  const [readOnly, setReadOnly] = useState(!!defaultReadOnly);

  // Reset fields when dialog opens with a different connection
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setLocalPath(defaultLocalPath ?? '');
      setRemotePath(defaultRemotePath ?? '');
      setReadOnly(!!defaultReadOnly);
    }
  }, [open, defaultName, defaultLocalPath, defaultRemotePath, defaultReadOnly]);

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim(), {
        defaultLocalPath: localPath.trim(),
        defaultRemotePath: remotePath.trim(),
        readOnly,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save connection</DialogTitle>
          <DialogDescription>
            Bookmark this connection. Optionally set default folders so both panes jump there on connect.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Name
            <Input
              placeholder="e.g. Home Assistant"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              autoFocus
              className="mt-1.5"
            />
          </label>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Default local folder <span className="text-muted-foreground/70 normal-case font-normal">(optional)</span>
            <Input
              placeholder="/DATA/AppData/home-assistant"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="mt-1.5 font-mono text-xs"
            />
          </label>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Default remote folder <span className="text-muted-foreground/70 normal-case font-normal">(optional)</span>
            <Input
              placeholder="/config"
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="mt-1.5 font-mono text-xs"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="font-medium">Read-only mode</span>
              <span className="block text-xs text-muted-foreground">
                Block delete, rename, mkdir, upload and edit on the remote side. Browse and download stay enabled.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
