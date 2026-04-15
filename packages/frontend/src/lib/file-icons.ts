import {
  Folder, File, FileText, FileCode, FileArchive, Image, Film, Music, Sheet,
  type LucideIcon,
} from 'lucide-react';

const EXTENSION_MAP: Record<string, { icon: LucideIcon; colorVar: string }> = {
  // Images
  jpg: { icon: Image, colorVar: '--image-color' },
  jpeg: { icon: Image, colorVar: '--image-color' },
  png: { icon: Image, colorVar: '--image-color' },
  gif: { icon: Image, colorVar: '--image-color' },
  svg: { icon: Image, colorVar: '--image-color' },
  webp: { icon: Image, colorVar: '--image-color' },
  // Documents
  pdf: { icon: FileText, colorVar: '--document-color' },
  doc: { icon: FileText, colorVar: '--document-color' },
  docx: { icon: FileText, colorVar: '--document-color' },
  odt: { icon: FileText, colorVar: '--document-color' },
  // Spreadsheets
  xls: { icon: Sheet, colorVar: '--success' },
  xlsx: { icon: Sheet, colorVar: '--success' },
  csv: { icon: Sheet, colorVar: '--success' },
  // Archives
  zip: { icon: FileArchive, colorVar: '--archive-color' },
  tar: { icon: FileArchive, colorVar: '--archive-color' },
  gz: { icon: FileArchive, colorVar: '--archive-color' },
  '7z': { icon: FileArchive, colorVar: '--archive-color' },
  rar: { icon: FileArchive, colorVar: '--archive-color' },
  // Video
  mp4: { icon: Film, colorVar: '--warning' },
  avi: { icon: Film, colorVar: '--warning' },
  mkv: { icon: Film, colorVar: '--warning' },
  mov: { icon: Film, colorVar: '--warning' },
  // Audio
  mp3: { icon: Music, colorVar: '--info' },
  flac: { icon: Music, colorVar: '--info' },
  wav: { icon: Music, colorVar: '--info' },
  ogg: { icon: Music, colorVar: '--info' },
  // Code
  js: { icon: FileCode, colorVar: '--muted-foreground' },
  ts: { icon: FileCode, colorVar: '--muted-foreground' },
  py: { icon: FileCode, colorVar: '--muted-foreground' },
  go: { icon: FileCode, colorVar: '--muted-foreground' },
  rs: { icon: FileCode, colorVar: '--muted-foreground' },
  json: { icon: FileCode, colorVar: '--muted-foreground' },
  yaml: { icon: FileCode, colorVar: '--muted-foreground' },
  yml: { icon: FileCode, colorVar: '--muted-foreground' },
  xml: { icon: FileCode, colorVar: '--muted-foreground' },
  // Text
  txt: { icon: FileText, colorVar: '--file-color' },
  md: { icon: FileText, colorVar: '--file-color' },
  log: { icon: FileText, colorVar: '--file-color' },
};

export function getFileIcon(name: string, isDirectory: boolean): { icon: LucideIcon; colorVar: string } {
  if (isDirectory) return { icon: Folder, colorVar: '--folder-color' };
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? { icon: File, colorVar: '--file-color' };
}
