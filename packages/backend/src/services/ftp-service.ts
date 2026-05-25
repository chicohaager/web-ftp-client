import * as ftp from 'basic-ftp';
import type { FileItem, ConnectRequest } from '@web-ftp-client/shared';
import crypto from 'crypto';
import { Writable, Readable } from 'stream';
import { CappedBufferWritable } from '../lib/preview-stream.js';

function fileId(dirPath: string, name: string): string {
  return crypto.createHash('sha256').update(`${dirPath}/${name}`).digest('hex').slice(0, 16);
}

export class FtpService {
  readonly protocol = 'ftp' as const;
  private client: ftp.Client;
  private connected = false;

  constructor() {
    this.client = new ftp.Client(10000);
    this.client.ftp.verbose = false;
  }

  async connect(config: ConnectRequest): Promise<string> {
    const secure = config.protocol === 'ftps';
    await this.client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      secure,
      secureOptions: secure ? { rejectUnauthorized: false } : undefined,
    });
    this.connected = true;

    // Track disconnection
    this.client.ftp.socket.once('close', () => { this.connected = false; });
    this.client.ftp.socket.once('error', () => { this.connected = false; });

    return 'FTP connected';
  }

  async disconnect(): Promise<void> {
    this.client.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async list(remotePath: string): Promise<FileItem[]> {
    const entries = await this.client.list(remotePath);
    return entries.map((entry) => ({
      id: fileId(remotePath, entry.name),
      name: entry.name,
      type: entry.isDirectory ? 'directory' as const : entry.isSymbolicLink ? 'symlink' as const : 'file' as const,
      size: entry.size,
      modified: entry.modifiedAt?.toISOString() ?? new Date().toISOString(),
      // basic-ftp exposes user/group as strings parsed from LIST output;
      // many servers omit one or both, in which case they stay undefined.
      permissions: entry.permissions?.toString() ?? '',
      owner: entry.user || undefined,
      group: entry.group || undefined,
    })).sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async download(remotePath: string, writable: Writable, onProgress?: (bytes: number) => void): Promise<void> {
    if (onProgress) {
      this.client.trackProgress((info) => onProgress(info.bytes));
    }
    await this.client.downloadTo(writable, remotePath);
    this.client.trackProgress();
  }

  async upload(remotePath: string, readable: Readable, onProgress?: (bytes: number) => void): Promise<void> {
    if (onProgress) {
      this.client.trackProgress((info) => onProgress(info.bytes));
    }
    await this.client.uploadFrom(readable, remotePath);
    this.client.trackProgress();
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.ensureDir(remotePath);
    await this.client.cd('/');
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.client.rename(oldPath, newPath);
  }

  async remove(remotePath: string, isDir: boolean): Promise<void> {
    if (isDir) {
      await this.client.removeDir(remotePath);
    } else {
      await this.client.remove(remotePath);
    }
  }

  async pwd(): Promise<string> {
    return await this.client.pwd();
  }

  // basic-ftp has no server-side copy. Used by the edit endpoint: read the
  // current file fully into memory (the edit endpoint stat-caps the source
  // at 1 MiB; the 2 MiB writable ceiling is a defense-in-depth guard) then
  // re-upload to dstPath as the .bak. Bytes are preserved verbatim — no
  // UTF-8 round-trip — so a Latin-1 or binary-tinged source's backup is
  // byte-identical to the original.
  async copy(srcPath: string, dstPath: string): Promise<void> {
    const buf = new CappedBufferWritable(2 * 1024 * 1024);
    try {
      await this.client.downloadTo(buf, srcPath);
    } catch (err) {
      // Only the cap-destroy is expected here; partial download must surface.
      if (!buf.truncated) throw err;
    }
    const readable = Readable.from(buf.asBuffer());
    await this.client.uploadFrom(readable, dstPath);
  }

  async writeBuffer(remotePath: string, content: Buffer): Promise<void> {
    const readable = Readable.from(content);
    await this.client.uploadFrom(readable, remotePath);
  }

  async previewText(remotePath: string, maxBytes: number): Promise<{ content: string; truncated: boolean; bytesRead: number; size: number }> {
    let size = 0;
    try { size = await this.client.size(remotePath); } catch { /* SIZE not supported; we'll fall back to bytesRead */ }
    const buf = new CappedBufferWritable(maxBytes);
    try {
      await this.client.downloadTo(buf, remotePath);
    } catch (err) {
      // Only swallow the cap-induced destroy; partial download due to a
      // dropped data connection must surface so the caller can fail rather
      // than render a half-file as if it were complete.
      if (!buf.truncated) throw err;
    }
    return {
      content: buf.asString(),
      truncated: buf.truncated,
      bytesRead: buf.total,
      size: size || buf.total,
    };
  }
}
