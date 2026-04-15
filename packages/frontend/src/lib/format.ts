export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + date.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(totalBytes: number, transferredBytes: number, speed: number): string {
  if (speed === 0) return '--';
  const remaining = totalBytes - transferredBytes;
  const seconds = remaining / speed;
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  return `~${Math.ceil(seconds / 3600)}h`;
}
