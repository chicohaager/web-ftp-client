import path from 'path';
import { realpath } from 'fs/promises';

/**
 * Resolve a user-provided path safely within a base directory.
 * Prevents path traversal attacks.
 * Returns null if the resolved path escapes the base directory.
 *
 * NOTE: this is a purely LEXICAL guard (path.resolve + prefix check). It does
 * not touch the filesystem and therefore does NOT catch symlinks. On a shared
 * NAS, DATA_DIR is the whole /DATA pool, writable by other apps and SMB/NFS
 * users, so a planted symlink under DATA_DIR can redirect a resolved-but-still-
 * lexically-contained path to a target outside the sandbox. Any handler that
 * then reads, writes, or deletes must additionally canonicalize with
 * realContained() before touching the filesystem.
 */
export function safePath(baseDir: string, userPath: string): string | null {
  // Normalize the base to absolute
  const base = path.resolve(baseDir);
  // Resolve user path relative to base
  const resolved = path.resolve(base, userPath.replace(/^\/+/, ''));
  // Check it's within base (with trailing sep to prevent /DATA matching /DATAexfil)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * Canonicalize an already lexically-contained absolute path with realpath and
 * re-assert containment, so a symlink ANYWHERE in the chain (terminal or an
 * intermediate directory) that escapes `baseDir` is rejected. Complements the
 * lexical safePath(): call safePath() first for the cheap traversal check, then
 * this before the actual fs read/write/delete.
 *
 * Pass the deepest path that is expected to already exist:
 *   - reads/edits of an existing file  → pass the file path
 *   - creates (mkdir/rename target/new .bak) → pass the PARENT directory, since
 *     the leaf does not exist yet and realpath would ENOENT.
 *
 * Returns the canonical (symlink-free) path, or null if it escapes the base or
 * does not exist. A null result should map to 403 (or 404 for a missing file).
 */
export async function realContained(baseDir: string, absPath: string): Promise<string | null> {
  const base = path.resolve(baseDir);
  let real: string;
  try {
    real = await realpath(absPath);
  } catch {
    return null;
  }
  if (real !== base && !real.startsWith(base + path.sep)) return null;
  return real;
}

/**
 * Validate that a filename does not contain path separators or traversal.
 */
export function safeFileName(name: string): boolean {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  if (name === '.' || name === '..') return false;
  if (name.length > 255) return false;
  return true;
}
