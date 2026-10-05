import { Router, type Router as RouterType } from 'express';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { FileItem, ListResponse, ApiResponse, PreviewResponse } from '@web-ftp-client/shared';
import { safePath, safeFileName, realContained } from '../lib/path-guard.js';
import { PREVIEW_MAX_BYTES, isPreviewable } from '../lib/preview-config.js';

function fileId(dirPath: string, name: string): string {
  return crypto.createHash('sha256').update(`${dirPath}/${name}`).digest('hex').slice(0, 16);
}

export const filesRouter: RouterType = Router();

filesRouter.get('/list', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const requestedPath = (req.query.path as string) || '/';
    const lexicalPath = safePath(dataDir, requestedPath);

    if (!lexicalPath) {
      res.status(403).json({ ok: false, error: 'Access denied: path traversal' } satisfies ApiResponse);
      return;
    }

    // Canonicalize so a symlinked directory under DATA_DIR can't be browsed to
    // list files outside the sandbox.
    const fullPath = await realContained(dataDir, lexicalPath);
    if (!fullPath) {
      res.status(403).json({ ok: false, error: 'Access denied: symlink escape' } satisfies ApiResponse);
      return;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files: FileItem[] = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(fullPath, entry.name);
        let stat: { size: number; mtime: Date; mode: number; uid: number; gid: number };
        try {
          const real = await fs.stat(entryPath);
          stat = { size: real.size, mtime: real.mtime, mode: real.mode, uid: real.uid, gid: real.gid };
        } catch {
          stat = { size: 0, mtime: new Date(), mode: 0, uid: 0, gid: 0 };
        }
        return {
          id: fileId(requestedPath, entry.name),
          name: entry.name,
          type: entry.isDirectory() ? 'directory' as const : entry.isSymbolicLink() ? 'symlink' as const : 'file' as const,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          permissions: (stat.mode & 0o777).toString(8),
          // Numeric uid/gid only — resolving to names would require reading
          // /etc/passwd per entry which isn't worth it for the in-app view.
          owner: String(stat.uid),
          group: String(stat.gid),
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

    const lexicalParent = safePath(dataDir, dirPath);
    if (!lexicalParent) {
      res.status(403).json({ ok: false, error: 'Access denied' } satisfies ApiResponse);
      return;
    }
    // Canonicalize the parent so a symlinked directory can't redirect the new
    // folder outside the sandbox. name is separator-free (safeFileName).
    const parentPath = await realContained(dataDir, lexicalParent);
    if (!parentPath) {
      res.status(403).json({ ok: false, error: 'Access denied: symlink escape' } satisfies ApiResponse);
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

    const lexicalParent = safePath(dataDir, dirPath);
    if (!lexicalParent) {
      res.status(403).json({ ok: false, error: 'Access denied' } satisfies ApiResponse);
      return;
    }
    const parentPath = await realContained(dataDir, lexicalParent);
    if (!parentPath) {
      res.status(403).json({ ok: false, error: 'Access denied: symlink escape' } satisfies ApiResponse);
      return;
    }

    await fs.rename(path.join(parentPath, oldName), path.join(parentPath, newName));
    res.json({ ok: true } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

filesRouter.get('/preview', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const requestedPath = (req.query.path as string) || '';
    const fileName = path.posix.basename(requestedPath);

    if (!safeFileName(fileName)) {
      res.status(400).json({ ok: false, error: 'Invalid file name' } satisfies ApiResponse);
      return;
    }
    if (!isPreviewable(fileName)) {
      res.status(400).json({ ok: false, error: 'Preview is only available for text-based files' } satisfies ApiResponse);
      return;
    }

    const lexicalPath = safePath(dataDir, requestedPath);
    if (!lexicalPath) {
      res.status(403).json({ ok: false, error: 'Access denied: path traversal' } satisfies ApiResponse);
      return;
    }

    // safePath is lexical only: a symlink under DATA_DIR (plantable by another
    // app or SMB user on a shared NAS) whose name ends in an allowed extension
    // — e.g. /DATA/x.env -> /app/data/.encryption-key — passes the extension
    // allowlist and the prefix check, then fs.open('r') follows it and returns
    // the target's bytes. Canonicalize and re-assert containment, then open
    // with O_NOFOLLOW so the (now symlink-free) terminal component can't be
    // swapped for a link in the TOCTOU window.
    const realPath = await realContained(dataDir, lexicalPath);
    if (!realPath) {
      res.status(404).json({ ok: false, error: 'File not found' } satisfies ApiResponse);
      return;
    }

    const handle = await fs.open(realPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (stat.isDirectory()) {
        res.status(400).json({ ok: false, error: 'Cannot preview a directory' } satisfies ApiResponse);
        return;
      }
      const cap = Math.min(stat.size, PREVIEW_MAX_BYTES);
      const buf = Buffer.alloc(cap);
      const { bytesRead } = await handle.read(buf, 0, cap, 0);
      const data: PreviewResponse = {
        content: buf.subarray(0, bytesRead).toString('utf8'),
        truncated: stat.size > bytesRead,
        size: stat.size,
        bytesRead,
      };
      res.json({ ok: true, data } satisfies ApiResponse<PreviewResponse>);
    } finally {
      await handle.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[LOCAL PREVIEW] Error: ${message}`);
    res.status(500).json({ ok: false, error: message } satisfies ApiResponse);
  }
});

filesRouter.put('/edit', async (req, res) => {
  try {
    const dataDir: string = req.app.locals.dataDir;
    const { path: filePath, content } = req.body as { path?: string; content?: string };

    if (typeof filePath !== 'string' || typeof content !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing path or content' } satisfies ApiResponse);
      return;
    }
    if (Buffer.byteLength(content, 'utf8') > PREVIEW_MAX_BYTES) {
      res.status(413).json({ ok: false, error: `Content exceeds ${PREVIEW_MAX_BYTES} bytes` } satisfies ApiResponse);
      return;
    }
    const fileName = path.posix.basename(filePath);
    if (!safeFileName(fileName) || !isPreviewable(fileName)) {
      res.status(400).json({ ok: false, error: 'File is not text-editable' } satisfies ApiResponse);
      return;
    }
    const lexicalPath = safePath(dataDir, filePath);
    if (!lexicalPath) {
      res.status(403).json({ ok: false, error: 'Access denied: path traversal' } satisfies ApiResponse);
      return;
    }

    // The per-component lstat below only guards the terminal <file> / <file>.bak.
    // Canonicalize the PARENT directory too, so a symlinked intermediate dir
    // (e.g. /DATA/evil -> /app/data) can't redirect the copy/write outside the
    // sandbox while the leaf still looks like a plain file. fileName is
    // separator-free (safeFileName), so the rebuilt paths stay in realParent.
    const realParent = await realContained(dataDir, path.dirname(lexicalPath));
    if (!realParent) {
      res.status(404).json({ ok: false, error: 'File not found' } satisfies ApiResponse);
      return;
    }
    const fullPath = path.join(realParent, fileName);
    const backupPath = `${fullPath}.bak`;

    // Defense against a symlink at <file> or <file>.bak pointing outside
    // dataDir: lstat each, refuse if it's a symlink. fs.copyFile and
    // writeFile would otherwise follow it and overwrite the linked target.
    // Then unlink the existing .bak so TOCTOU between this check and the
    // copy can't be exploited by swapping in a symlink.
    try {
      const linkInfo = await fs.lstat(fullPath);
      if (linkInfo.isSymbolicLink()) {
        res.status(403).json({ ok: false, error: 'Refusing to edit a symlink' } satisfies ApiResponse);
        return;
      }
    } catch {
      res.status(404).json({ ok: false, error: 'File not found' } satisfies ApiResponse);
      return;
    }
    try {
      const bakInfo = await fs.lstat(backupPath);
      if (bakInfo.isSymbolicLink()) {
        res.status(403).json({ ok: false, error: 'Refusing to overwrite a symlink at .bak' } satisfies ApiResponse);
        return;
      }
      await fs.unlink(backupPath);
    } catch (err) {
      // ENOENT is fine — no prior .bak. Anything else surfaces.
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    await fs.copyFile(fullPath, backupPath);
    await fs.writeFile(fullPath, content, 'utf8');
    console.log(`[LOCAL EDIT] ${filePath} (backup: ${filePath}.bak)`);
    res.json({ ok: true } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[LOCAL EDIT] Error: ${message}`);
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

    const lexicalParent = safePath(dataDir, dirPath);
    if (!lexicalParent) {
      res.status(403).json({ ok: false, error: 'Access denied' } satisfies ApiResponse);
      return;
    }
    // Canonicalize the parent: a symlinked directory here would otherwise let a
    // recursive, force delete escape the sandbox and wipe files outside /DATA.
    const parentPath = await realContained(dataDir, lexicalParent);
    if (!parentPath) {
      res.status(403).json({ ok: false, error: 'Access denied: symlink escape' } satisfies ApiResponse);
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
