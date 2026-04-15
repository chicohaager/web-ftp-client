import { useEffect, useCallback, useMemo } from 'react';
import { ConnectionBar } from '@/components/connection/ConnectionBar';
import { FilePanel } from '@/components/panels/FilePanel';
import { TransferQueue } from '@/components/transfer/TransferQueue';
import { StatusBar } from '@/components/layout/StatusBar';
import { useLocalPanel, useRemotePanel } from '@/stores/panelStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useTransferStore } from '@/stores/transferStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useUiStore } from '@/stores/uiStore';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { FileItem } from '@web-ftp-client/shared';

export function AppLayout() {
  const local = useLocalPanel();
  const remote = useRemotePanel();
  const connectionStatus = useConnectionStore((s) => s.status);
  const sessionId = useConnectionStore((s) => s.sessionId);
  const addTransferItems = useTransferStore((s) => s.addItems);
  const theme = useUiStore((s) => s.theme);
  const isConnected = connectionStatus.status === 'connected';

  useWebSocket();

  useEffect(() => {
    local.fetchFiles('/api/local', '/');
  }, []);

  useEffect(() => {
    if (isConnected) {
      remote.fetchFiles('/api/remote', '/');
      toast.success('Connected', { description: connectionStatus.serverInfo });
    }
  }, [isConnected]);

  useEffect(() => {
    if (connectionStatus.status === 'error' && connectionStatus.error) {
      toast.error('Connection failed', { description: connectionStatus.error });
    }
  }, [connectionStatus.status, connectionStatus.error]);

  // Transfer handler
  const handleTransfer = useCallback(async (
    direction: 'upload' | 'download',
    files: FileItem[],
    localPath: string,
    remotePath: string,
  ) => {
    const fileNames = files.filter(f => f.type !== 'directory').map(f => f.name);
    if (fileNames.length === 0) return;

    const endpoint = direction === 'upload' ? '/api/remote/upload' : '/api/remote/download';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionId) headers['x-session-id'] = sessionId;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ localPath, remotePath, files: fileNames }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        addTransferItems(data.data);
        toast.info(`${direction === 'upload' ? 'Upload' : 'Download'} started`, {
          description: `${fileNames.length} file${fileNames.length > 1 ? 's' : ''}`,
        });
      } else {
        toast.error('Transfer failed', { description: data.error });
      }
    } catch (err) {
      toast.error('Transfer failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [sessionId, addTransferItems]);

  const handleLocalTransfer = useCallback((files: FileItem[]) => {
    handleTransfer('upload', files, local.currentPath, remote.currentPath);
  }, [handleTransfer, local.currentPath, remote.currentPath]);

  const handleRemoteTransfer = useCallback((files: FileItem[]) => {
    handleTransfer('download', files, local.currentPath, remote.currentPath);
  }, [handleTransfer, local.currentPath, remote.currentPath]);

  // Drop handlers: when files are dropped ONTO a panel, the direction is opposite to that panel's transfer
  // Drop onto Local = Download (remote→local)
  const handleLocalDropReceive = useCallback((files: FileItem[], _sourcePath: string) => {
    handleTransfer('download', files, local.currentPath, remote.currentPath);
  }, [handleTransfer, local.currentPath, remote.currentPath]);

  // Drop onto Remote = Upload (local→remote)
  const handleRemoteDropReceive = useCallback((files: FileItem[], _sourcePath: string) => {
    handleTransfer('upload', files, local.currentPath, remote.currentPath);
  }, [handleTransfer, local.currentPath, remote.currentPath]);

  // File operations
  const apiCall = useCallback(async (url: string, method: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionId) headers['x-session-id'] = sessionId;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }, [sessionId]);

  const handleLocalMkdir = useCallback(async (name: string) => {
    await apiCall('/api/local/mkdir', 'POST', { path: local.currentPath, name });
    local.refresh();
  }, [apiCall, local]);

  const handleRemoteMkdir = useCallback(async (name: string) => {
    await apiCall('/api/remote/mkdir', 'POST', { path: remote.currentPath, name });
    remote.refresh();
  }, [apiCall, remote]);

  const handleLocalDelete = useCallback(async (files: FileItem[]) => {
    await apiCall('/api/local/delete', 'DELETE', {
      path: local.currentPath, names: files.map(f => f.name),
    });
    local.clearSelection();
    local.refresh();
    toast.success(`Deleted ${files.length} item${files.length > 1 ? 's' : ''}`);
  }, [apiCall, local]);

  const handleRemoteDelete = useCallback(async (files: FileItem[]) => {
    await apiCall('/api/remote/delete', 'DELETE', {
      path: remote.currentPath,
      names: files.map(f => f.name),
      types: files.map(f => f.type),
    });
    remote.clearSelection();
    remote.refresh();
    toast.success(`Deleted ${files.length} item${files.length > 1 ? 's' : ''}`);
  }, [apiCall, remote]);

  const handleLocalRename = useCallback(async (oldName: string, newName: string) => {
    await apiCall('/api/local/rename', 'POST', { path: local.currentPath, oldName, newName });
    local.refresh();
  }, [apiCall, local]);

  const handleRemoteRename = useCallback(async (oldName: string, newName: string) => {
    await apiCall('/api/remote/rename', 'POST', { path: remote.currentPath, oldName, newName });
    remote.refresh();
  }, [apiCall, remote]);

  // Keyboard shortcuts
  const localShortcuts = useMemo(() => ({
    onDelete: () => { if (local.selectedIds.size > 0) handleLocalDelete(local.getSelectedFiles()); },
    onRename: () => { /* handled by FilePanel dialog */ },
    onRefresh: () => local.refresh(),
    onSelectAll: () => local.selectAll(),
    onGoUp: () => local.goUp(),
  }), [local, handleLocalDelete]);

  const remoteShortcuts = useMemo(() => ({
    onDelete: () => { if (remote.selectedIds.size > 0 && isConnected) handleRemoteDelete(remote.getSelectedFiles()); },
    onRename: () => { /* handled by FilePanel dialog */ },
    onRefresh: () => { if (isConnected) remote.refresh(); },
    onSelectAll: () => remote.selectAll(),
    onGoUp: () => remote.goUp(),
  }), [remote, isConnected, handleRemoteDelete]);

  useKeyboardShortcuts(localShortcuts, remoteShortcuts);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr_auto_28px] overflow-hidden bg-background">
      <ConnectionBar />

      <main className="flex min-h-0">
        <div className="flex-1 min-w-0">
          <FilePanel
            panelType="local"
            label="Local (NAS)"
            currentPath={local.currentPath}
            files={local.files}
            filteredFiles={local.getFilteredFiles()}
            loading={local.loading}
            selectedIds={local.selectedIds}
            sortColumn={local.sortColumn}
            sortDirection={local.sortDirection}
            searchFilter={local.searchFilter}
            isConnected={isConnected}
            onSelect={local.select}
            onSort={local.setSort}
            onSearchFilter={local.setSearchFilter}
            onNavigateTo={local.navigateTo}
            onGoBack={local.goBack}
            onGoForward={local.goForward}
            onGoUp={local.goUp}
            onRefresh={local.refresh}
            onMkdir={handleLocalMkdir}
            onDelete={handleLocalDelete}
            onRename={handleLocalRename}
            onTransfer={handleLocalTransfer}
            onDropReceive={handleLocalDropReceive}
            getSelectedFiles={local.getSelectedFiles}
          />
        </div>

        <Separator orientation="vertical" />

        <div className="flex-1 min-w-0">
          <FilePanel
            panelType="remote"
            label="Remote (FTP)"
            currentPath={remote.currentPath}
            files={remote.files}
            filteredFiles={remote.getFilteredFiles()}
            loading={remote.loading}
            selectedIds={remote.selectedIds}
            sortColumn={remote.sortColumn}
            sortDirection={remote.sortDirection}
            searchFilter={remote.searchFilter}
            disabled={!isConnected}
            isConnected={isConnected}
            onSelect={remote.select}
            onSort={remote.setSort}
            onSearchFilter={remote.setSearchFilter}
            onNavigateTo={remote.navigateTo}
            onGoBack={remote.goBack}
            onGoForward={remote.goForward}
            onGoUp={remote.goUp}
            onRefresh={remote.refresh}
            onMkdir={handleRemoteMkdir}
            onDelete={handleRemoteDelete}
            onRename={handleRemoteRename}
            onTransfer={handleRemoteTransfer}
            onDropReceive={handleRemoteDropReceive}
            getSelectedFiles={remote.getSelectedFiles}
          />
        </div>
      </main>

      <TransferQueue />
      <StatusBar />
      <Toaster position="bottom-right" theme={theme} />
    </div>
  );
}
