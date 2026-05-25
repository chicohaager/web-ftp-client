// Mirror of backend allowlist — kept in sync so the UI can show/hide the
// Preview menu entry without an extra round-trip. Backend still validates
// the request, so client-side enforcement is purely UX.

const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.log', '.md', '.csv', '.tsv',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.env', '.conf', '.config', '.cfg', '.ini', '.properties',
  '.sh', '.service',
]);

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
