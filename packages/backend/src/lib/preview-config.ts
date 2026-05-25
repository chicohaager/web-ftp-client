// Hard cap on how much of a file the preview endpoint reads.
// 1 MiB — enough for the longest sane config / log tail without blowing memory
// or holding the connection open for huge files.
export const PREVIEW_MAX_BYTES = 1 * 1024 * 1024;

// Extensions we'll preview as text. Conservative — binary types are silently
// rejected with 400 to avoid serving garbled UTF-8 or oversized buffers.
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.log', '.md', '.csv', '.tsv',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.env', '.conf', '.config', '.cfg', '.ini', '.properties',
  '.sh', '.service',
]);

// Some files have a meaningful name but no extension (e.g. Dockerfile,
// Makefile, .env, .gitignore). Accept them by exact basename too.
const ALLOWED_BASENAMES = new Set([
  'Dockerfile', 'Makefile', 'LICENSE', 'README',
  '.env', '.gitignore', '.dockerignore',
]);

export function isPreviewable(name: string): boolean {
  if (ALLOWED_BASENAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return ALLOWED_EXTENSIONS.has(name.slice(dot).toLowerCase());
}
