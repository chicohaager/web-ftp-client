import { Router, type Router as RouterType } from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { FileItem, ListResponse, ApiResponse } from '@web-ftp-client/shared';
import { safePath, safeFileName } from '../lib/path-guard.js';

function fileId(dirPath: string, name: string): string {
  return crypto.createHash('sha256').update(`${dirPath}/${name}`).digest('hex').slice(0, 16);
}

export const filesRouter: RouterType = Router();

filesRouter.get('/list', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const requestedPath = (req.query.path as string) || '/';
    const fullPath = safePath(dataDir, requestedPath);

    if (!fullPath) {
      res.status(403).json({ ok: false, error: 'Access denied: path traversal' } satisfies ApiResponse);
      return;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: FileItem[] = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(fullPath, entry.name);
        let stat;
        try {
          stat = await fs.stat(entryPath);
        } catch {
          stat = { size: 0, mtime: new Date(), mode: 0 };
        }
        return {
          id: fileId(requestedPath, entry.name),
          name: entry.name,
          type: entry.isDirectory() ? 'directory' as const : entry.isSymbolicLink() ? 'symlink' as const : 'file' as const,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          permissions: (stat.mode & 0o777).toString(8),
        };
      })
    );

    files.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    const response: ApiResponse<ListResponse> = { ok: true, data: { path: requestedPath, files } };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[LOCAL LIST] Error: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

filesRouter.post('/mkdir', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const { path: dirPath, name } = req.body;

    if (!safeFileName(name)) {
      res.status(400).json({ ok: false, error: 'Invalid folder name' } satisfies ApiResponse);
      return;
    }

    const parentPath = safePath(dataDir, dirPath);
    if (!parentPath) {
      res.status(403).json({ ok: false, error: 'Access denied' } satisfies ApiResponse);
      return;
    }

    await fs.mkdir(path.join(parentPath, name), { recursive: true });
    res.status(201).json({ ok: true } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

filesRouter.post('/rename', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const { path: dirPath, oldName, newName } = req.body;

    if (!safeFileName(oldName) || !safeFileName(newName)) {
      res.status(400).json({ ok: false, error: 'Invalid file name' } satisfies ApiResponse);
      return;
    }

    const parentPath = safePath(dataDir, dirPath);
    if (!parentPath) {
      res.status(403).json({ ok: false, error: 'Access denied' } satisfies ApiResponse);
      return;
    }

    await fs.rename(path.join(parentPath, oldName), path.join(parentPath, newName));
    res.json({ ok: true } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

filesRouter.delete('/delete', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const { path: dirPath, names } = req.body;

    if (!Array.isArray(names) || names.length === 0 || names.length > 100) {
      res.status(400).json({ ok: false, error: 'Invalid names array' } satisfies ApiResponse);
      return;
    }

    const parentPath = safePath(dataDir, dirPath);
    if (!parentPath) {
      res.status(403).json({ ok: false, error: 'Access denied' } satisfies ApiResponse);
      return;
    }

    for (const name of names) {
      if (!safeFileName(name)) continue;
      const targetPath = path.join(parentPath, name);
      // Double-check the target is still within dataDir
      const resolved = safePath(dataDir, path.relative(dataDir, targetPath));
      if (!resolved) continue;
      await fs.rm(resolved, { recursive: true, force: true });
    }

    res.json({ ok: true } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});
