import { useConnectionStore } from '@/stores/connectionStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Plug, PlugZap, Loader2, Key, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SaveConnectionDialog } from '@/components/dialogs/SaveConnectionDialog';
import { Logo } from '@/components/brand/Logo';
import type { Protocol } from '@web-ftp-client/shared';

export function ConnectionBar() {
  const {
    host, port, protocol, username, password, privateKey, passphrase,
    status, savedConnections,
    setField, setProtocol, connect, disconnect, fetchConnections, loadSavedConnection, saveConnection,
  } = useConnectionStore();

  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const isConnecting = status.status === 'connecting';
  const isConnected = status.status === 'connected';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnecting) connect();
  };

  return (
    <header className="flex items-center gap-2 border-b bg-card px-4 py-2">
      <div className="flex items-center gap-2 pr-2 shrink-0 select-none">
        <Logo size={24} />
        <span className="hidden md:inline text-sm font-semibold tracking-tight">Web FTP Client</span>
      </div>

      <Select value={protocol} onValueChange={(v) => setProtocol(v as Protocol)}>
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ftp">FTP</SelectItem>
          <SelectItem value="ftps">FTPS</SelectItem>
          <SelectItem value="sftp">SFTP</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder="Host"
        value={host}
        onChange={(e) => setField('host', e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8 text-xs flex-1 min-w-[120px]"
        disabled={isConnected}
      />

      <Input
        type="number"
        value={port}
        onChange={(e) => setField('port', parseInt(e.target.value) || 0)}
        onKeyDown={handleKeyDown}
        className="h-8 text-xs w-[65px]"
        disabled={isConnected}
      />

      <Input
        placeholder="User"
        value={username}
        onChange={(e) => setField('username', e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8 text-xs w-[100px]"
        disabled={isConnected}
      />

      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setField('password', e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8 text-xs w-[100px]"
        disabled={isConnected}
      />

      {/* SSH Key button (only for SFTP) */}
      {protocol === 'sftp' && !isConnected && (
        <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
          <DialogTrigger asChild>
            <Button
              variant={privateKey ? 'default' : 'outline'}
              size="icon"
              className="h-8 w-8 shrink-0"
              title="SSH Private Key"
            >
              <Key className="w-3.5 h-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>SSH Private Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <textarea
                className="w-full h-48 bg-background border rounded-md p-3 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Paste your private key here (PEM format)&#10;&#10;-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                value={privateKey}
                onChange={(e) => setField('privateKey', e.target.value)}
              />
              <Input
                type="password"
                placeholder="Key passphrase (if encrypted)"
                value={passphrase}
                onChange={(e) => setField('passphrase', e.target.value)}
                className="text-xs"
              />
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={async () => {
                    try {
                      const [handle] = await (window as unknown as { showOpenFilePicker: (opts: unknown) => Promise<Array<{ getFile: () => Promise<File> }>> }).showOpenFilePicker({
                        types: [{ description: 'SSH Key', accept: { 'text/plain': ['.pem', '.key', ''] } }],
                      });
                      const file = await handle.getFile();
                      const text = await file.text();
                      setField('privateKey', text);
                    } catch { /* cancelled */ }
                  }}
                >
                  Load from file...
                </Button>
                <Button size="sm" className="text-xs" onClick={() => setShowKeyDialog(false)}>
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isConnected ? (
        <>
          <Button size="sm" variant="destructive" onClick={disconnect} className="h-8 text-xs">
            <PlugZap className="w-3.5 h-3.5 mr-1" />
            Disconnect
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSaveDialog(true)}
            className="h-8 text-xs"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={connect} disabled={isConnecting || !host} className="h-8 text-xs">
          {isConnecting ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Plug className="w-3.5 h-3.5 mr-1" />
          )}
          Connect
        </Button>
      )}

      {savedConnections.length > 0 && (
        <Select
          value=""
          onValueChange={(id) => {
            const conn = savedConnections.find(c => c.id === id);
            if (conn) loadSavedConnection(conn);
          }}
        >
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Saved..." />
          </SelectTrigger>
          <SelectContent>
            {savedConnections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id}>
                {conn.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <SaveConnectionDialog
        open={showSaveDialog}
        defaultName={`${host}:${port}`}
        onConfirm={(name) => { saveConnection(name); setShowSaveDialog(false); }}
        onCancel={() => setShowSaveDialog(false)}
      />
    </header>
  );
}
