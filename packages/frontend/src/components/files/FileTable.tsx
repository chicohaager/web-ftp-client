import type { FileItem } from '@web-ftp-client/shared';
import { getFileIcon } from '@/lib/file-icons';
import { getFileType } from '@/lib/file-types';
import { formatBytes, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface FileTableProps {
  files: FileItem[];
  selectedIds: Set<string>;
  sortColumn: 'name' | 'size' | 'modified';
  sortDirection: 'asc' | 'desc';
  loading: boolean;
  showDetails: boolean;
  onSelect: (id: string, ctrl: boolean, shift: boolean) => void;
  onSort: (column: 'name' | 'size' | 'modified') => void;
  onOpen: (file: FileItem) => void;
}

const COLS_BASE = 'grid-cols-[20px_1fr_110px_80px_140px]';
const COLS_DETAILS = 'grid-cols-[20px_1fr_110px_80px_140px_75px_140px]';

function ownerGroup(file: FileItem): string {
  if (!file.owner && !file.group) return '';
  return `${file.owner ?? '-'}:${file.group ?? '-'}`;
}

export function FileTable({
  files, selectedIds, sortColumn, sortDirection, loading, showDetails,
  onSelect, onSort, onOpen,
}: FileTableProps) {
  const SortIcon = sortDirection === 'asc' ? ChevronUp : ChevronDown;
  const cols = showDetails ? COLS_DETAILS : COLS_BASE;

  return (
    <ScrollArea className="h-full">
      {/* Header */}
      <div className={cn('grid gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary sticky top-0 z-10 select-none', cols)}>
        <div />
        <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => onSort('name')}>
          Name {sortColumn === 'name' && <SortIcon className="w-3 h-3" />}
        </button>
        <div className="text-left">Type</div>
        <button className="flex items-center gap-1 justify-end hover:text-foreground transition-colors" onClick={() => onSort('size')}>
          Size {sortColumn === 'size' && <SortIcon className="w-3 h-3" />}
        </button>
        <button className="flex items-center gap-1 justify-end hover:text-foreground transition-colors" onClick={() => onSort('modified')}>
          Modified {sortColumn === 'modified' && <SortIcon className="w-3 h-3" />}
        </button>
        {showDetails && (
          <>
            <div className="text-right">Mode</div>
            <div className="text-right">Owner</div>
          </>
        )}
      </div>

      {/* Rows */}
      {loading ? (
        <div className="space-y-0.5 p-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-[26px] rounded-sm bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          This folder is empty
        </div>
      ) : (
        <div>
          {files.map((file) => {
            const { icon: Icon, colorVar } = getFileIcon(file.name, file.type === 'directory');
            const isSelected = selectedIds.has(file.id);
            const fileType = getFileType(file.name, file.type === 'directory');

            return (
              <div
                key={file.id}
                className={cn(
                  'grid gap-1 px-3 items-center cursor-default select-none',
                  'h-[30px] text-[14px] leading-tight border-b border-border/40',
                  'hover:bg-secondary transition-colors duration-75',
                  isSelected && 'bg-accent text-accent-foreground hover:bg-accent',
                  cols,
                )}
                onClick={(e) => onSelect(file.id, e.ctrlKey || e.metaKey, e.shiftKey)}
                onDoubleClick={() => onOpen(file)}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: `hsl(var(${colorVar}))` }}
                />
                <span className="truncate font-normal">{file.name}</span>
                <span className="truncate text-muted-foreground">{fileType}</span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {file.type === 'directory' ? '' : formatBytes(file.size)}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {formatDate(file.modified)}
                </span>
                {showDetails && (
                  <>
                    <span className="text-right text-muted-foreground font-mono text-[12px] tabular-nums">
                      {file.permissions || '-'}
                    </span>
                    <span className="text-right text-muted-foreground font-mono text-[12px] truncate">
                      {ownerGroup(file) || '-'}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}
