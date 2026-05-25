import type { ReactNode } from 'react';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Download, Upload, Pencil, Trash2, FolderPlus, Copy, RefreshCw, Eye, FileEdit,
} from 'lucide-react';

interface FileContextMenuProps {
  children: ReactNode;
  panelType: 'local' | 'remote';
  hasSelection: boolean;
  selectionCount: number;
  isConnected: boolean;
  canPreview: boolean;
  canEdit: boolean;
  // When true, hide entries that would mutate this pane's filesystem
  // (Delete, Rename, NewFolder, Upload). Transfer (download for remote /
  // upload for local) is gated by the caller via the transfer entry.
  canMutate: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onTransfer: () => void;
  onRename: () => void;
  onDelete: () => void;
  onNewFolder: () => void;
  onCopyPath: () => void;
  onRefresh: () => void;
}

export function FileContextMenu({
  children, panelType, hasSelection, selectionCount, isConnected,
  canPreview, canEdit, canMutate,
  onPreview, onEdit, onTransfer, onRename, onDelete, onNewFolder, onCopyPath, onRefresh,
}: FileContextMenuProps) {
  const TransferIcon = panelType === 'local' ? Upload : Download;
  const transferLabel = panelType === 'local' ? 'Upload to Remote' : 'Download to Local';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {canPreview && (
          <ContextMenuItem onClick={onPreview}>
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </ContextMenuItem>
        )}
        {canEdit && (
          <ContextMenuItem onClick={onEdit}>
            <FileEdit className="w-4 h-4 mr-2" />
            Edit&hellip;
          </ContextMenuItem>
        )}
        {(canPreview || canEdit) && <ContextMenuSeparator />}
        {hasSelection && isConnected && (
          <>
            <ContextMenuItem onClick={onTransfer}>
              <TransferIcon className="w-4 h-4 mr-2" />
              {transferLabel}{selectionCount > 1 ? ` (${selectionCount})` : ''}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {hasSelection && selectionCount === 1 && canMutate && (
          <ContextMenuItem onClick={onRename}>
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </ContextMenuItem>
        )}
        {hasSelection && canMutate && (
          <>
            <ContextMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete{selectionCount > 1 ? ` (${selectionCount})` : ''}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {hasSelection && selectionCount === 1 && (
          <ContextMenuItem onClick={onCopyPath}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Path
          </ContextMenuItem>
        )}
        {canMutate && (
          <ContextMenuItem onClick={onNewFolder}>
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
