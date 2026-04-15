import { Router, type Router as RouterType } from 'express';
import { FtpService } from '../services/ftp-service.js';
import { SftpService } from '../services/sftp-service.js';
import { transferQueue } from '../services/transfer-queue.js';
import { safePath, safeFileName } from '../lib/path-guard.js';
import type { ConnectRequest, ApiResponse, ListResponse, ConnectionStatus } from '@web-ftp-client/shared';
import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

export const remoteRouter: RouterType = Router();

// Session-based connections with timestamps
const sessions = new Map<string, { service: FtpService | SftpService; status: ConnectionStatus; lastUsed: number }>();

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (!session.service.isConnected() || now - session.lastUsed > 30 * 60 * 1000) {
      try { session.service.disconnect(); } catch { /* ignore */ }
      sessions.delete(id);
      console.log(`[SESSION] Cleaned up stale session ${id}`);
    }
  }
}, 5 * 60 * 1000);

function getSession(sessionId?: string): { service: FtpService | SftpService; status: ConnectionStatus; lastUsed: number } | null {
  if (!sessionId) {
    for (const session of sessions.values()) {
      if (session.service.isConnected()) {
        session.lastUsed = Date.now();
        return session;
      }
    }
    return null;
  }
  const session = sessions.get(sessionId);
  if (session) session.lastUsed = Date.now();
  return session ?? null;
}

remoteRouter.post('/connect', async (req, res) => {
  try {
    const config: ConnectRequest = req.body;
    const sessionId = uuid();

    // Validate required fields
    if (!config.host || !config.protocol || !config.username) {
      res.status(400).json({ ok: false, error: 'Missing required fields' } satisfies ApiResponse);
      return;
    }

    console.log(`[CONNECT] ${config.protocol.toUpperCase()} ${config.username}@${config.host}:${config.port}`);

    let service: FtpService | SftpService;
    if (config.protocol === 'sftp') {
      service = new SftpService();
    } else {
      service = new FtpService();
    }

    const serverInfo = await service.connect(config);
    const status: ConnectionStatus = { status: 'connected', serverInfo, sessionId };
    sessions.set(sessionId, { service, status, lastUsed: Date.now() });

    console.log(`[CONNECT] Success: ${serverInfo}`);
    const response: ApiResponse<ConnectionStatus> = { ok: true, data: status };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    console.error(`[CONNECT] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

remoteRouter.post('/disconnect', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.service.disconnect();
      sessions.delete(sessionId);
      console.log(`[DISCONNECT] Session ${sessionId}`);
    } else {
      // Disconnect all sessions
      const ids = [...sessions.keys()];
      for (const id of ids) {
        const session = sessions.get(id);
        if (session) {
          try { await session.service.disconnect(); } catch { /* ignore */ }
        }
        sessions.delete(id);
      }
    }
    const response: ApiResponse = { ok: true };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Disconnect failed';
    console.error(`[DISCONNECT] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

remoteRouter.get('/status', (req, res) => {
  const sessionId = req.headers['x-session-id'] as string | undefined;
  const session = getSession(sessionId);
  const status: ConnectionStatus = session?.status ?? { status: 'disconnected' };
  const response: ApiResponse<ConnectionStatus> = { ok: true, data: status };
  res.json(response);
});

remoteRouter.get('/list', async (req, res) => {
  const session = getSession(req.headers['x-session-id'] as string | undefined);
  if (!session || !session.service.isConnected()) {
    res.status(400).json({ ok: false, error: 'Not connected' } satisfies ApiResponse);
    return;
  }
  try {
    const remotePath = (req.query.path as string) || '/';
    const files = await session.service.list(remotePath);
    const response: ApiResponse<ListResponse> = { ok: true, data: { path: remotePath, files } };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    console.error(`[LIST] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

remoteRouter.post('/mkdir', async (req, res) => {
  const session = getSession(req.headers['x-session-id'] as string | undefined);
  if (!session || !session.service.isConnected()) {
    res.status(400).json({ ok: false, error: 'Not connected' } satisfies ApiResponse);
    return;
  }
  try {
    const { path: dirPath, name } = req.body;
    const fullPath = path.posix.join(dirPath, name);
    await session.service.mkdir(fullPath);
    console.log(`[MKDIR] ${fullPath}`);
    const response: ApiResponse = { ok: true };
    res.status(201).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mkdir failed';
    console.error(`[MKDIR] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

remoteRouter.post('/rename', async (req, res) => {
  const session = getSession(req.headers['x-session-id'] as string | undefined);
  if (!session || !session.service.isConnected()) {
    res.status(400).json({ ok: false, error: 'Not connected' } satisfies ApiResponse);
    return;
  }
  try {
    const { path: dirPath, oldName, newName } = req.body;
    const oldFullPath = path.posix.join(dirPath, oldName);
    const newFullPath = path.posix.join(dirPath, newName);
    await session.service.rename(oldFullPath, newFullPath);
    console.log(`[RENAME] ${oldFullPath} -> ${newFullPath}`);
    const response: ApiResponse = { ok: true };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rename failed';
    console.error(`[RENAME] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

remoteRouter.delete('/delete', async (req, res) => {
  const session = getSession(req.headers['x-session-id'] as string | undefined);
  if (!session || !session.service.isConnected()) {
    res.status(400).json({ ok: false, error: 'Not connected' } satisfies ApiResponse);
    return;
  }
  try {
    const { path: dirPath, names, types } = req.body;
    for (let i = 0; i < names.length; i++) {
      const fullPath = path.posix.join(dirPath, names[i]);
      const isDir = types?.[i] === 'directory';
      await session.service.remove(fullPath, isDir);
      console.log(`[DELETE] ${fullPath}`);
    }
    const response: ApiResponse = { ok: true };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    console.error(`[DELETE] Failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

// Transfer endpoints
remoteRouter.post('/download', async (req, res) => {
  const session = getSession(req.headers['x-session-id'] as string | undefined);
  if (!session || !session.service.isConnected()) {
    res.status(400).json({ ok: false, error: 'Not connected' } satisfies ApiResponse);
    return;
  }
  try {
    const { localPath, remotePath, files } = req.body;
    const dataDir: string = req.app.locals.dataDir;

    // Validate local path stays within dataDir
    if (!safePath(dataDir, localPath || '/')) {
      res.status(403).json({ ok: false, error: 'Invalid local path' } satisfies ApiResponse);
      return;
    }

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ ok: false, error: 'No files specified' } satisfies ApiResponse);
      return;
    }

    const items = [];

    let listing: Awaited<ReturnType<typeof session.service.list>> = [];
    try {
      listing = await session.service.list(remotePath);
    } catch (err) {
      console.error(`[TRANSFER] Cannot list remote: ${err instanceof Error ? err.message : err}`);
    }

    for (const fileName of files) {
      if (!safeFileName(fileName)) continue;

      const fileInfo = listing.find(f => f.name === fileName);
      if (fileInfo?.type === 'directory') continue;

      const totalBytes = fileInfo?.size ?? 0;
      const item = transferQueue.enqueue(fileName, remotePath, localPath, 'download', totalBytes);
      items.push(item);
      console.log(`[TRANSFER] Download queued: ${fileName} (${totalBytes} bytes)`);
      transferQueue.executeTransfer(item, session.service, dataDir).catch((err) => {
        console.error(`[TRANSFER] Unhandled: ${err instanceof Error ? err.message : err}`);
      });
    }

    res.json({ ok: true, data: items } satisfies ApiResponse<typeof items>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed';
    console.error(`[TRANSFER] Download failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

remoteRouter.post('/upload', async (req, res) => {
  const session = getSession(req.headers['x-session-id'] as string | undefined);
  if (!session || !session.service.isConnected()) {
    res.status(400).json({ ok: false, error: 'Not connected' } satisfies ApiResponse);
    return;
  }
  try {
    const { localPath, remotePath, files } = req.body;
    const dataDir: string = req.app.locals.dataDir;

    if (!safePath(dataDir, localPath || '/')) {
      res.status(403).json({ ok: false, error: 'Invalid local path' } satisfies ApiResponse);
      return;
    }

    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ ok: false, error: 'No files specified' } satisfies ApiResponse);
      return;
    }

    const items = [];

    for (const fileName of files) {
      if (!safeFileName(fileName)) continue;

      const resolvedLocal = safePath(dataDir, path.join(localPath, fileName));
      if (!resolvedLocal) continue;

      let totalBytes = 0;
      let isDir = false;
      try {
        const stat = await fs.stat(resolvedLocal);
        totalBytes = stat.size;
        isDir = stat.isDirectory();
      } catch { /* file might not exist */ }

      if (isDir) continue;

      const item = transferQueue.enqueue(fileName, localPath, remotePath, 'upload', totalBytes);
      items.push(item);
      console.log(`[TRANSFER] Upload queued: ${fileName} (${totalBytes} bytes)`);
      transferQueue.executeTransfer(item, session.service, dataDir).catch((err) => {
        console.error(`[TRANSFER] Unhandled: ${err instanceof Error ? err.message : err}`);
      });
    }

    res.json({ ok: true, data: items } satisfies ApiResponse<typeof items>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error(`[TRANSFER] Upload failed: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

// Transfer queue management
remoteRouter.get('/transfers', (_req, res) => {
  const response: ApiResponse<ReturnType<typeof transferQueue.getAll>> = { ok: true, data: transferQueue.getAll() };
  res.json(response);
});

remoteRouter.post('/transfers/:id/pause', (req, res) => {
  const success = transferQueue.pause(req.params.id);
  if (success) {
    res.json({ ok: true } satisfies ApiResponse);
  } else {
    res.status(400).json({ ok: false, error: 'Cannot pause this transfer' } satisfies ApiResponse);
  }
});

remoteRouter.post('/transfers/:id/resume', (req, res) => {
  const success = transferQueue.resume(req.params.id);
  if (success) {
    res.json({ ok: true } satisfies ApiResponse);
  } else {
    res.status(400).json({ ok: false, error: 'Cannot resume this transfer' } satisfies ApiResponse);
  }
});

remoteRouter.delete('/transfers/:id', (req, res) => {
  const success = transferQueue.cancel(req.params.id);
  if (success) {
    res.json({ ok: true } satisfies ApiResponse);
  } else {
    res.status(404).json({ ok: false, error: 'Transfer not found' } satisfies ApiResponse);
  }
});
