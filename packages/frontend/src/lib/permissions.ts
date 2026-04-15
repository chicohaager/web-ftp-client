const PERMISSION_CHARS = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];

export function octalToSymbolic(octal: string): string {
  if (!octal || octal.includes('r') || octal.includes('w') || octal.includes('x')) {
    return octal; // Already symbolic
  }
  const digits = octal.padStart(3, '0');
  return digits.split('').map(d => PERMISSION_CHARS[parseInt(d)] ?? '---').join('');
}

export function formatPermissions(perms: string): string {
  if (!perms) return '';
  return octalToSymbolic(perms);
}
