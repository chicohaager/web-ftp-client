import SftpClient from 'ssh2-sftp-client';
import type { FileItem, ConnectRequest } from '@web-ftp-client/shared';
import crypto from 'crypto';

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
    return entries.map((entry) => ({
      id: fileId(remotePath, entry.name),
      name: entry.name,
      type: entry.type === 'd' ? 'directory' as const : entry.type === 'l' ? 'symlink' as const : 'file' as const,
      size: entry.size,
      modified: new Date(entry.modifyTime).toISOString(),
      permissions: entry.rights ? `${entry.rights.user}${entry.rights.group}${entry.rights.other}` : '',
    })).sort((a, b) => {
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
}
