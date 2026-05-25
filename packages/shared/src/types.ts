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
  defaultLocalPath?: string;  // local pane jumps here on connect
  defaultRemotePath?: string; // remote pane jumps here on connect
  readOnly?: boolean;         // if true, mutating remote ops are blocked
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
  readOnly?: boolean;    // if true, server blocks mutating ops on this session
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverInfo?: string;
  error?: string;
  sessionId?: string;
  readOnly?: boolean;  // mirrored from the connection that established the session
}

// === File Types ===

export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string; // ISO 8601
  permissions: string; // e.g. "rwxr-xr-x" or "755"
  owner?: string;      // user name or numeric uid; protocol-dependent
  group?: string;      // group name or numeric gid; protocol-dependent
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

// === Preview Types ===

export interface PreviewResponse {
  content: string;
  truncated: boolean;
  size: number;        // full file size in bytes
  bytesRead: number;   // bytes actually returned (may be < size if truncated)
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
