const TYPE_MAP: Record<string, string> = {
  // Images
  jpg: 'JPEG Image', jpeg: 'JPEG Image', png: 'PNG Image', gif: 'GIF Image',
  svg: 'SVG Image', webp: 'WebP Image', bmp: 'Bitmap Image', ico: 'Icon',
  // Documents
  pdf: 'PDF Document', doc: 'Word Document', docx: 'Word Document',
  odt: 'OpenDocument', rtf: 'Rich Text',
  // Spreadsheets
  xls: 'Excel Spreadsheet', xlsx: 'Excel Spreadsheet', csv: 'CSV File',
  ods: 'OpenDocument Spreadsheet',
  // Archives
  zip: 'ZIP Archive', tar: 'TAR Archive', gz: 'GZip Archive',
  '7z': '7-Zip Archive', rar: 'RAR Archive', bz2: 'BZ2 Archive',
  // Video
  mp4: 'MP4 Video', avi: 'AVI Video', mkv: 'MKV Video', mov: 'QuickTime Video',
  webm: 'WebM Video', flv: 'Flash Video',
  // Audio
  mp3: 'MP3 Audio', flac: 'FLAC Audio', wav: 'WAV Audio', ogg: 'OGG Audio',
  aac: 'AAC Audio', m4a: 'M4A Audio',
  // Code
  js: 'JavaScript', ts: 'TypeScript', py: 'Python Script', go: 'Go Source',
  rs: 'Rust Source', java: 'Java Source', c: 'C Source', cpp: 'C++ Source',
  h: 'C Header', cs: 'C# Source', rb: 'Ruby Script', php: 'PHP Script',
  sh: 'Shell Script', bash: 'Bash Script',
  // Data
  json: 'JSON File', xml: 'XML File', yaml: 'YAML File', yml: 'YAML File',
  toml: 'TOML File', ini: 'INI Config', cfg: 'Config File',
  sql: 'SQL File', db: 'Database', sqlite: 'SQLite Database',
  // Text
  txt: 'Text File', md: 'Markdown', log: 'Log File', conf: 'Config File',
  // Web
  html: 'HTML Document', htm: 'HTML Document', css: 'CSS Stylesheet',
  scss: 'SCSS Stylesheet', less: 'LESS Stylesheet',
  // Executables
  exe: 'Executable', msi: 'Installer', deb: 'Debian Package',
  rpm: 'RPM Package', dmg: 'Disk Image', iso: 'ISO Image', img: 'Disk Image',
  // Fonts
  ttf: 'TrueType Font', otf: 'OpenType Font', woff: 'Web Font', woff2: 'Web Font',
  // Other
  key: 'Key File', pem: 'PEM Certificate', crt: 'Certificate',
};

export function getFileType(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'Folder';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_MAP[ext] ?? (ext ? `${ext.toUpperCase()} File` : 'File');
}
