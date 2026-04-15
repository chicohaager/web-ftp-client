import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import type { TransferItem, TransferDirection, WsEvent } from '@web-ftp-client/shared';
import type { FtpService } from './ftp-service.js';
import type { SftpService } from './sftp-service.js';

const MAX_CONCURRENT = 2;

export class TransferQueue extends EventEmitter {
  private queue: TransferItem[] = [];
  private activeCount = 0;

  getAll(): TransferItem[] {
    return [...this.queue];
  }

  enqueue(
    fileName: string,
    sourcePath: string,
    destinationPath: string,
    direction: TransferDirection,
    totalBytes: number,
  ): TransferItem {
    const item: TransferItem = {
      id: uuid(),
      fileName,
      sourcePath,
      destinationPath,
      direction,
      status: 'queued',
      totalBytes,
      transferredBytes: 0,
      speed: 0,
      startTime: null,
      error: null,
    };
    this.queue.push(item);
    return item;
  }

  async executeTransfer(
    item: TransferItem,
    remoteService: FtpService | SftpService,
    dataDir: string,
  ): Promise<void> {
    // Wait for slot
    while (this.activeCount >= MAX_CONCURRENT) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    item.status = 'active';
    item.startTime = Date.now();
    this.activeCount++;
    this.emitProgress(item);

    try {
      const localFullPath = path.join(
        dataDir,
        item.direction === 'upload' ? item.sourcePath : item.destinationPath,
        item.fileName,
      );
      const remoteFullPath = path.posix.join(
        item.direction === 'upload' ? item.destinationPath : item.sourcePath,
        item.fileName,
      );

      // Ensure local directory exists for downloads
      if (item.direction === 'download') {
        const localDir = path.dirname(localFullPath);
        fs.mkdirSync(localDir, { recursive: true });
      }

      console.log(`[TRANSFER] Executing ${item.direction}: local=${localFullPath} remote=${remoteFullPath}`);

      let lastProgressTime = Date.now();
      let lastBytes = 0;

      const onProgress = (bytes: number) => {
        const now = Date.now();
        const elapsed = (now - lastProgressTime) / 1000;
        if (elapsed > 0.25) {
          item.speed = (bytes - lastBytes) / elapsed;
          lastProgressTime = now;
          lastBytes = bytes;
        }
        item.transferredBytes = bytes;
        this.emitProgress(item);
      };

      // Check service type via protocol discriminator
      if (remoteService.protocol === 'sftp') {
        const sftpSvc = remoteService as SftpService;
        if (item.direction === 'download') {
          await sftpSvc.download(remoteFullPath, localFullPath, onProgress);
        } else {
          await sftpSvc.upload(localFullPath, remoteFullPath, onProgress);
        }
      } else {
        const ftpSvc = remoteService as FtpService;
        if (item.direction === 'download') {
          const writable = fs.createWriteStream(localFullPath);
          await ftpSvc.download(remoteFullPath, writable, onProgress);
        } else {
          const readable = fs.createReadStream(localFullPath);
          await ftpSvc.upload(remoteFullPath, readable, onProgress);
        }
      }

      item.status = 'completed';
      item.transferredBytes = item.totalBytes || item.transferredBytes;
      console.log(`[TRANSFER] Completed: ${item.fileName}`);
      this.emitComplete(item);
    } catch (err) {
      item.status = 'failed';
      item.error = err instanceof Error ? err.message : 'Transfer failed';
      console.error(`[TRANSFER] Failed: ${item.fileName}: ${item.error}`);
      this.emitError(item);
    } finally {
      this.activeCount--;
    }
  }

  pause(id: string): boolean {
    const item = this.queue.find(t => t.id === id);
    if (item && item.status === 'queued') {
      item.status = 'paused';
      return true;
    }
    return false;
  }

  resume(id: string): boolean {
    const item = this.queue.find(t => t.id === id);
    if (item && item.status === 'paused') {
      item.status = 'queued';
      return true;
    }
    return false;
  }

  cancel(id: string): boolean {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  private emitProgress(item: TransferItem): void {
    const event: WsEvent = {
      type: 'transfer:progress',
      data: { id: item.id, transferredBytes: item.transferredBytes, speed: item.speed, status: item.status },
    };
    this.emit('ws', event);
  }

  private emitComplete(item: TransferItem): void {
    const event: WsEvent = { type: 'transfer:complete', data: { id: item.id } };
    this.emit('ws', event);
  }

  private emitError(item: TransferItem): void {
    const event: WsEvent = { type: 'transfer:error', data: { id: item.id, error: item.error! } };
    this.emit('ws', event);
  }
}

// Singleton
export const transferQueue = new TransferQueue();
