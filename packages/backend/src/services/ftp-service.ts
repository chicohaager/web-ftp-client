import * as ftp from 'basic-ftp';
import type { FileItem, ConnectRequest } from '@web-ftp-client/shared';
import crypto from 'crypto';
import { Writable, Readable } from 'stream';

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
      permissions: entry.permissions?.toString() ?? '',
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
}
