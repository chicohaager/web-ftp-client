// === Connection Types ===

export type Protocol = 'ftp' | 'ftps' | 'sftp';

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  hasPrivateKey?: boolean;
  lastUsed?: string; // ISO 8601
}

export interface ConnectRequest {
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  password: string;
  privateKey?: string;   // PEM-encoded private key
  passphrase?: string;   // Passphrase for encrypted key
  sessionId?: string;    // Reuse existing session
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverInfo?: string;
  error?: string;
  sessionId?: string;
}

// === File Types ===

export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string; // ISO 8601
  permissions: string; // e.g. "rwxr-xr-x" or "755"
}

export interface ListResponse {
  path: string;
  files: FileItem[];
  sessionId?: string;
}

export interface MkdirRequest {
  path: string;
  name: string;
}

export interface RenameRequest {
  path: string;
  oldName: string;
  newName: string;
}

export interface DeleteRequest {
  path: string;
  names: string[];
  types?: string[];
}

// === Transfer Types ===

export type TransferDirection = 'upload' | 'download';
export type TransferStatus = 'queued' | 'active' | 'paused' | 'completed' | 'failed';

export interface TransferItem {
  id: string;
  fileName: string;
  sourcePath: string;
  destinationPath: string;
  direction: TransferDirection;
  status: TransferStatus;
  totalBytes: number;
  transferredBytes: number;
  speed: number; // bytes per second
  startTime: number | null;
  error: string | null;
}

export interface TransferRequest {
  localPath: string;
  remotePath: string;
  files: string[];
}

// === WebSocket Events ===

export type WsEvent =
  | { type: 'transfer:progress'; data: Pick<TransferItem, 'id' | 'transferredBytes' | 'speed' | 'status'> }
  | { type: 'transfer:complete'; data: { id: string } }
  | { type: 'transfer:error'; data: { id: string; error: string } }
  | { type: 'connection:status'; data: ConnectionStatus };

// === API Response Wrapper ===

export interface ApiResponse<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}
