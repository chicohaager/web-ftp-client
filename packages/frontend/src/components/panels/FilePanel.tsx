import { useState, useCallback } from 'react';
import type { FileItem, PreviewResponse } from '@web-ftp-client/shared';
import { FileTable } from '@/components/files/FileTable';
import { FileContextMenu } from '@/components/files/FileContextMenu';
import { DeleteDialog } from '@/components/dialogs/DeleteDialog';
import { RenameDialog } from '@/components/dialogs/RenameDialog';
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog';
import { PreviewDialog } from '@/components/dialogs/PreviewDialog';
import { EditDialog } from '@/components/dialogs/EditDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  ArrowLeft, ArrowRight, ArrowUp, RefreshCw, FolderPlus, Unplug,
  Upload, Download, Search, Columns3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { isPreviewable } from '@/lib/preview';

interface FilePanelProps {
  panelType: 'local' | 'remote';
  label: string;
  currentPath: string;
  files: FileItem[];
  filteredFiles: FileItem[];
  loading: boolean;
  selectedIds: Set<string>;
  sortColumn: 'name' | 'size' | 'modified';
  sortDirection: 'asc' | 'desc';
  searchFilter: string;
  disabled?: boolean;
  isConnected: boolean;
  // True if mutating ops on this pane's filesystem should be blocked. Only
  // ever true for the remote pane (when the session is read-only); local
  // edits/renames/mkdirs aren't related to remote read-only. AppLayout
  // hard-codes false for the local pane.
  isReadOnly?: boolean;
  onSelect: (id: string, ctrl: boolean, shift: boolean) => void;
  onSort: (column: 'name' | 'size' | 'modified') => void;
  onSearchFilter: (filter: string) => void;
  onNavigateTo: (path: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoUp: () => void;
  onRefresh: () => void;
  onMkdir: (name: string) => void;
  onDelete: (files: FileItem[]) => void;
  onRename: (oldName: string, newName: string) => void;
  onTransfer: (files: FileItem[]) => void;
  onDropReceive: (files: FileItem[], sourcePath: string) => void;
  getSelectedFiles: () => FileItem[];
}

export function FilePanel({
  panelType, label, currentPath, files, filteredFiles, loading, selectedIds,
  sortColumn, sortDirection, searchFilter, disabled, isConnected, isReadOnly,
  onSelect, onSort, onSearchFilter, onNavigateTo, onGoBack, onGoForward,
  onGoUp, onRefresh, onMkdir, onDelete, onRename, onTransfer, onDropReceive, getSelectedFiles,
}: FilePanelProps) {
  const { focusedPanel, setFocusedPanel, showDetails, toggleShowDetails } = useUiStore();
  const isFocused = focusedPanel === panelType;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState('');

  const sessionId = useConnectionStore((s) => s.sessionId);
  // Whether the active remote session is read-only — needed for the Upload
  // button on the LOCAL pane, where the action mutates the REMOTE side.
  const remoteSessionReadOnly = useConnectionStore((s) => s.status.status === 'connected' && s.status.readOnly === true);
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    fileName: string;
    path: string;
    loading: boolean;
    error: string | null;
    content: string | null;
    truncated: boolean;
    size: number;
    bytesRead: number;
  }>({ open: false, fileName: '', path: '', loading: false, error: null, content: null, truncated: false, size: 0, bytesRead: 0 });

  const pathSegments = currentPath.split('/').filter(Boolean);
  const selectedFiles = getSelectedFiles();
  const previewCandidate = selectedFiles.length === 1 && selectedFiles[0].type === 'file' && isPreviewable(selectedFiles[0].name)
    ? selectedFiles[0]
    : null;
  // Edit requires a previewable file, an active connection (for remote), and
  // not in read-only mode (since edit mutates).
  const editCandidate = previewCandidate
    && (panelType === 'local' || isConnected)
    && !isReadOnly
    ? previewCandidate
    : null;

  const [editState, setEditState] = useState<{
    open: boolean;
    fileName: string;
    path: string;
    initialContent: string | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    truncated: boolean;
  }>({ open: false, fileName: '', path: '', initialContent: null, loading: false, saving: false, error: null, truncated: false });

  const handleOpen = (file: FileItem) => {
    if (file.type === 'directory') {
      const newPath = currentPath === '/'
        ? `/${file.name}`
        : `${currentPath}/${file.name}`;
      onNavigateTo(newPath);
    } else if (isConnected) {
      // Double-click file = transfer
      onTransfer([file]);
    }
  };

  const handleTransfer = useCallback(() => {
    const sel = getSelectedFiles();
    if (sel.length > 0) onTransfer(sel);
  }, [getSelectedFiles, onTransfer]);

  const handleDeleteConfirm = useCallback(() => {
    onDelete(selectedFiles);
    setShowDeleteDialog(false);
  }, [selectedFiles, onDelete]);

  const handleRename = useCallback(() => {
    if (selectedFiles.length === 1) {
      setRenameTarget(selectedFiles[0].name);
      setShowRenameDialog(true);
    }
  }, [selectedFiles]);

  const handleEdit = useCallback(async () => {
    if (!editCandidate) return;
    const file = editCandidate;
    const fullPath = currentPath === '/'
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;
    setEditState({
      open: true, fileName: file.name, path: fullPath,
      initialContent: null, loading: true, saving: false, error: null, truncated: false,
    });
    try {
      const headers: Record<string, string> = {};
      if (panelType === 'remote' && sessionId) headers['x-session-id'] = sessionId;
      const res = await fetch(`/api/${panelType}/preview?path=${encodeURIComponent(fullPath)}`, { headers });
      const data = await res.json();
      if (data.ok) {
        const p = data.data as PreviewResponse;
        setEditState((s) => ({ ...s, loading: false, initialContent: p.content, truncated: p.truncated }));
      } else {
        setEditState((s) => ({ ...s, loading: false, error: data.error ?? 'Could not load file' }));
      }
    } catch (err) {
      setEditState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Could not load file' }));
    }
  }, [editCandidate, currentPath, panelType, sessionId]);

  const handleEditSave = useCallback(async (content: string) => {
    setEditState((s) => ({ ...s, saving: true, error: null }));
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (panelType === 'remote' && sessionId) headers['x-session-id'] = sessionId;
      const res = await fetch(`/api/${panelType}/edit`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ path: editState.path, content }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('Saved', { description: `${editState.fileName} — backup at ${editState.fileName}.bak` });
        setEditState((s) => ({ ...s, open: false, saving: false }));
        onRefresh();
      } else {
        setEditState((s) => ({ ...s, saving: false, error: data.error ?? 'Save failed' }));
      }
    } catch (err) {
      setEditState((s) => ({ ...s, saving: false, error: err instanceof Error ? err.message : 'Save failed' }));
    }
  }, [panelType, sessionId, editState.path, editState.fileName, onRefresh]);

  const handlePreview = useCallback(async () => {
    if (!previewCandidate) return;
    const file = previewCandidate;
    const fullPath = currentPath === '/'
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;
    setPreviewState({
      open: true, fileName: file.name, path: fullPath,
      loading: true, error: null, content: null,
      truncated: false, size: 0, bytesRead: 0,
    });
    try {
      const headers: Record<string, string> = {};
      if (panelType === 'remote' && sessionId) headers['x-session-id'] = sessionId;
      const res = await fetch(`/api/${panelType}/preview?path=${encodeURIComponent(fullPath)}`, { headers });
      const data = await res.json();
      if (data.ok) {
        const p = data.data as PreviewResponse;
        setPreviewState((s) => ({ ...s, loading: false, content: p.content, truncated: p.truncated, size: p.size, bytesRead: p.bytesRead }));
      } else {
        setPreviewState((s) => ({ ...s, loading: false, error: data.error ?? 'Preview failed' }));
      }
    } catch (err) {
      setPreviewState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Preview failed' }));
    }
  }, [previewCandidate, currentPath, panelType, sessionId]);

  const handleCopyPath = useCallback(() => {
    if (selectedFiles.length === 1) {
      const fullPath = currentPath === '/'
        ? `/${selectedFiles[0].name}`
        : `${currentPath}/${selectedFiles[0].name}`;
      navigator.clipboard.writeText(fullPath);
    }
  }, [selectedFiles, currentPath]);

  // Drag and drop
  const handleDragStart = (e: React.DragEvent) => {
    const sel = getSelectedFiles();
    if (sel.length === 0) return;
    e.dataTransfer.setData('application/json', JSON.stringify({
      source: panelType,
      path: currentPath,
      files: sel.map(f => ({ name: f.name, type: f.type })),
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // Drop onto Remote means upload from Local → mutates remote → blocked in
    // read-only mode. Drop onto Local is always a download from Remote.
    if (panelType === 'remote' && (isReadOnly || remoteSessionReadOnly)) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.source !== panelType) {
        // Dropped from other panel — trigger transfer in correct direction
        const droppedFiles = data.files.map((f: { name: string; type: string }) => ({
          name: f.name,
          type: f.type || 'file',
        }));
        onDropReceive(droppedFiles as FileItem[], data.path);
      }
    } catch { /* ignore */ }
  };

  if (disabled) {
    return (
      <div
        className="flex flex-col h-full items-center justify-center text-muted-foreground gap-3"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Unplug className="w-12 h-12 opacity-30" />
        <p className="text-sm">Connect to an FTP server</p>
        <p className="text-xs opacity-60">to browse remote files</p>
      </div>
    );
  }

  return (
    <FileContextMenu
      panelType={panelType}
      hasSelection={selectedIds.size > 0}
      selectionCount={selectedIds.size}
      isConnected={isConnected}
      canPreview={previewCandidate !== null}
      canEdit={editCandidate !== null}
      canMutate={!isReadOnly}
      onPreview={handlePreview}
      onEdit={handleEdit}
      onTransfer={handleTransfer}
      onRename={handleRename}
      onDelete={() => setShowDeleteDialog(true)}
      onNewFolder={() => setShowNewFolderDialog(true)}
      onCopyPath={handleCopyPath}
      onRefresh={onRefresh}
    >
      <div
        className={cn('flex flex-col h-full', isFocused && 'ring-2 ring-primary/20 ring-inset')}
        onClick={() => setFocusedPanel(panelType)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
          <Badge
            variant="secondary"
            className={cn(
              'text-[11px] px-2 py-0.5 shrink-0',
              panelType === 'local' ? 'bg-[hsl(var(--local-accent))] text-primary' : 'bg-[hsl(var(--remote-accent))] text-muted-foreground',
            )}
          >
            {label}
          </Badge>
          <Breadcrumb className="flex-1 min-w-0">
            <BreadcrumbList className="text-sm flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink className="cursor-pointer hover:text-foreground" onClick={() => onNavigateTo('/')}>
                  /
                </BreadcrumbLink>
              </BreadcrumbItem>
              {pathSegments.map((segment, i) => (
                <span key={i} className="contents">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      className="cursor-pointer hover:text-foreground truncate max-w-[100px]"
                      onClick={() => onNavigateTo('/' + pathSegments.slice(0, i + 1).join('/'))}
                    >
                      {segment}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-card">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGoBack} title="Back">
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGoForward} title="Forward">
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGoUp} title="Up (Backspace)">
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} title="Refresh (F5)">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>

          {/* Search */}
          <div className="flex-1 mx-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Filter..."
              value={searchFilter}
              onChange={(e) => onSearchFilter(e.target.value)}
              className="h-7 text-sm pl-6 pr-2"
            />
          </div>

          {isConnected && selectedIds.size > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleTransfer}
              // Local→Remote upload is the only direction blocked by read-only.
              // Wired here via remoteSessionReadOnly read off the connection
              // status (AppLayout's handleTransfer is the actual gate; this
              // disables the button so the user can see why it's inactive).
              disabled={panelType === 'local' && remoteSessionReadOnly}
              title={
                panelType === 'local'
                  ? (remoteSessionReadOnly ? 'Upload blocked — connection is read-only' : 'Upload')
                  : 'Download'
              }
            >
              {panelType === 'local' ? <Upload className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            </Button>
          )}

          {!isReadOnly && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewFolderDialog(true)} title="New Folder">
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant={showDetails ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={toggleShowDetails}
            title={showDetails ? 'Hide permissions/owner columns' : 'Show permissions/owner columns'}
          >
            <Columns3 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* File Table */}
        <div className="flex-1 min-h-0" draggable={selectedIds.size > 0} onDragStart={handleDragStart}>
          <FileTable
            files={filteredFiles}
            selectedIds={selectedIds}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            loading={loading}
            showDetails={showDetails}
            onSelect={onSelect}
            onSort={onSort}
            onOpen={handleOpen}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-card text-[11px] text-muted-foreground shrink-0">
          <span>{filteredFiles.length}{searchFilter ? `/${files.length}` : ''} items</span>
          <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : ''}</span>
        </div>

        {/* Dialogs */}
        <DeleteDialog
          open={showDeleteDialog}
          files={selectedFiles}
          panelType={panelType}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
        />
        <RenameDialog
          open={showRenameDialog}
          currentName={renameTarget}
          onConfirm={(newName) => { onRename(renameTarget, newName); setShowRenameDialog(false); }}
          onCancel={() => setShowRenameDialog(false)}
        />
        <NewFolderDialog
          open={showNewFolderDialog}
          onConfirm={(name) => { onMkdir(name); setShowNewFolderDialog(false); }}
          onCancel={() => setShowNewFolderDialog(false)}
        />
        <PreviewDialog
          open={previewState.open}
          fileName={previewState.fileName}
          path={previewState.path}
          loading={previewState.loading}
          error={previewState.error}
          content={previewState.content}
          truncated={previewState.truncated}
          size={previewState.size}
          bytesRead={previewState.bytesRead}
          onClose={() => setPreviewState((s) => ({ ...s, open: false }))}
        />
        <EditDialog
          open={editState.open}
          fileName={editState.fileName}
          path={editState.path}
          initialContent={editState.initialContent}
          loading={editState.loading}
          saving={editState.saving}
          error={editState.error}
          truncated={editState.truncated}
          onSave={handleEditSave}
          onClose={() => setEditState((s) => ({ ...s, open: false }))}
        />
      </div>
    </FileContextMenu>
  );
}
