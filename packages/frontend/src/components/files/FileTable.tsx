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
  onSelect: (id: string, ctrl: boolean, shift: boolean) => void;
  onSort: (column: 'name' | 'size' | 'modified') => void;
  onOpen: (file: FileItem) => void;
}

export function FileTable({
  files, selectedIds, sortColumn, sortDirection, loading, onSelect, onSort, onOpen,
}: FileTableProps) {
  const SortIcon = sortDirection === 'asc' ? ChevronUp : ChevronDown;

  return (
    <ScrollArea className="h-full">
      {/* Header */}
      <div className="grid grid-cols-[20px_1fr_100px_70px_130px] gap-1 px-3 py-1 text-[11px] font-medium text-muted-foreground border-b bg-muted/40 sticky top-0 z-10 select-none">
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
                  'grid grid-cols-[20px_1fr_100px_70px_130px] gap-1 px-3 items-center cursor-default select-none',
                  'h-[26px] text-[12px] leading-tight',
                  'hover:bg-accent/50 transition-colors duration-75',
                  isSelected && 'bg-primary/15 text-foreground hover:bg-primary/20',
                )}
                onClick={(e) => onSelect(file.id, e.ctrlKey || e.metaKey, e.shiftKey)}
                onDoubleClick={() => onOpen(file)}
              >
                <Icon
                  className="w-[15px] h-[15px]"
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
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}
