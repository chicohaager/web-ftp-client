import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { FileItem } from '@web-ftp-client/shared';
import { formatBytes } from '@/lib/format';

interface DeleteDialogProps {
  open: boolean;
  files: FileItem[];
  panelType: 'local' | 'remote';
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteDialog({ open, files, panelType, onConfirm, onCancel }: DeleteDialogProps) {
  const totalSize = files.filter(f => f.type !== 'directory').reduce((sum, f) => sum + f.size, 0);
  const dirs = files.filter(f => f.type === 'directory').length;
  const fileCount = files.length - dirs;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {files.length} item{files.length > 1 ? 's' : ''}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This will permanently delete from {panelType === 'local' ? 'NAS storage' : 'remote server'}:
              </p>
              <ul className="text-sm max-h-32 overflow-y-auto space-y-0.5">
                {files.slice(0, 10).map(f => (
                  <li key={f.id} className="text-foreground">
                    {f.type === 'directory' ? '📁 ' : '📄 '}{f.name}
                  </li>
                ))}
                {files.length > 10 && <li>...and {files.length - 10} more</li>}
              </ul>
              <p className="text-xs text-muted-foreground">
                {fileCount > 0 && `${fileCount} file${fileCount > 1 ? 's' : ''} (${formatBytes(totalSize)})`}
                {fileCount > 0 && dirs > 0 && ', '}
                {dirs > 0 && `${dirs} folder${dirs > 1 ? 's' : ''}`}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
