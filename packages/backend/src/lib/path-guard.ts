import path from 'path';

/**
 * Resolve a user-provided path safely within a base directory.
 * Prevents path traversal attacks.
 * Returns null if the resolved path escapes the base directory.
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
 * Validate that a filename does not contain path separators or traversal.
 */
export function safeFileName(name: string): boolean {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  if (name === '.' || name === '..') return false;
  if (name.length > 255) return false;
  return true;
}
