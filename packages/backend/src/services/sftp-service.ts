import SftpClient from 'ssh2-sftp-client';
import type { FileItem, ConnectRequest } from '@web-ftp-client/shared';
import crypto from 'crypto';
import { CappedBufferWritable } from '../lib/preview-stream.js';

function fileId(dirPath: string, name: string): string {
  return crypto.createHash('sha256').update(`${dirPath}/${name}`).digest('hex').slice(0, 16);
}

export class SftpService {
  readonly protocol = 'sftp' as const;
  private client: SftpClient;
  private connected = false;

  constructor() {
    this.client = new SftpClient();
    this.client.on('close', () => { this.connected = false; });
    this.client.on('error', () => { this.connected = false; });
  }

  async connect(config: ConnectRequest): Promise<string> {
    const connectOptions: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000,
    };

    if (config.privateKey) {
      connectOptions.privateKey = Buffer.from(config.privateKey);
      if (config.passphrase) {
        connectOptions.passphrase = config.passphrase;
      }
      if (config.password) {
        connectOptions.password = config.password;
        connectOptions.authHandler = ['publickey', 'password'];
      }
    } else {
      connectOptions.password = config.password;
    }

    await this.client.connect(connectOptions);
    this.connected = true;
    return 'SFTP connected';
  }

  async disconnect(): Promise<void> {
    await this.client.end();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async list(remotePath: string): Promise<FileItem[]> {
    const entries = await this.client.list(remotePath);
    return entries.map((entry) => {
      // ssh2-sftp-client returns owner/group as numeric uid/gid (number).
      // Stringify so the wire format stays uniform with other services.
      const ownerVal = (entry as unknown as { owner?: number | string }).owner;
      const groupVal = (entry as unknown as { group?: number | string }).group;
      return {
        id: fileId(remotePath, entry.name),
        name: entry.name,
        type: entry.type === 'd' ? 'directory' as const : entry.type === 'l' ? 'symlink' as const : 'file' as const,
        size: entry.size,
        modified: new Date(entry.modifyTime).toISOString(),
        permissions: entry.rights ? `${entry.rights.user}${entry.rights.group}${entry.rights.other}` : '',
        owner: ownerVal !== undefined ? String(ownerVal) : undefined,
        group: groupVal !== undefined ? String(groupVal) : undefined,
      };
    }).sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async download(remotePath: string, localPath: string, onProgress?: (bytes: number) => void): Promise<void> {
    await this.client.fastGet(remotePath, localPath, {
      step: onProgress ? (transferred) => onProgress(transferred) : undefined,
    });
  }

  async upload(localPath: string, remotePath: string, onProgress?: (bytes: number) => void): Promise<void> {
    await this.client.fastPut(localPath, remotePath, {
      step: onProgress ? (transferred) => onProgress(transferred) : undefined,
    });
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.mkdir(remotePath, true);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.client.rename(oldPath, newPath);
  }

  async remove(remotePath: string, isDir: boolean): Promise<void> {
    if (isDir) {
      await this.client.rmdir(remotePath, true);
    } else {
      await this.client.delete(remotePath);
    }
  }

  async pwd(): Promise<string> {
    return await this.client.cwd();
  }

  // Server-side copy (used by edit-with-backup). rcopy refuses to overwrite
  // an existing destination, so we delete first; the edit endpoint
  // guarantees the .bak is intended to be replaced on each save. Delete
  // failures other than "file not found" are surfaced.
  async copy(srcPath: string, dstPath: string): Promise<void> {
    try {
      await this.client.delete(dstPath);
    } catch (err) {
      const code = (err as { code?: number; message?: string }).code;
      const msg = (err as { message?: string }).message ?? '';
      // ssh2-sftp-client surfaces "No such file" as SFTP_STATUS_CODE 2
      // (or the string in older versions). Anything else is a real error.
      if (code !== 2 && !/no such file|does not exist/i.test(msg)) throw err;
    }
    await this.client.rcopy(srcPath, dstPath);
  }

  // Upload a buffer/string as the file's full content. Used after copy()
  // by the edit endpoint.
  async writeBuffer(remotePath: string, content: Buffer): Promise<void> {
    await this.client.put(content, remotePath);
  }

  async previewText(remotePath: string, maxBytes: number): Promise<{ content: string; truncated: boolean; bytesRead: number; size: number }> {
    let size = 0;
    try {
      const stat = await this.client.stat(remotePath);
      size = stat.size;
    } catch { /* fall back to bytesRead below */ }
    const buf = new CappedBufferWritable(maxBytes);
    try {
      await this.client.get(remotePath, buf);
    } catch (err) {
      // Only swallow the destroy-on-cap throw; any other error (partial
      // download due to network drop, server reset) must surface so the
      // caller doesn't get a silently truncated buffer presented as a
      // complete read.
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
