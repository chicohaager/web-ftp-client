import { useTransferStore } from '@/stores/transferStore';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatSpeed, formatEta } from '@/lib/format';
import { ChevronDown, ChevronUp, X, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TransferQueue() {
  const {
    items, collapsed, toggleCollapsed,
    clearCompleted, cancelTransfer, retryTransfer, retryAllFailed,
  } = useTransferStore();

  const active = items.filter(t => t.status === 'active');
  const queued = items.filter(t => t.status === 'queued');
  const completed = items.filter(t => t.status === 'completed');
  const failed = items.filter(t => t.status === 'failed');

  return (
    <div className={cn('border-t border-border bg-card flex flex-col', collapsed ? 'h-8' : 'h-[220px]')}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-1.5 cursor-pointer hover:bg-secondary shrink-0"
        onClick={toggleCollapsed}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>Transfers</span>
          {active.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">{active.length} active</Badge>}
          {queued.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">{queued.length} queued</Badge>}
          {failed.length > 0 && <Badge variant="destructive" className="text-[10px] px-1 py-0">{failed.length} failed</Badge>}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1.5">
            {failed.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={(e) => { e.stopPropagation(); retryAllFailed(); }}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry failed
              </Button>
            )}
            {completed.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={(e) => { e.stopPropagation(); clearCompleted(); }}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear done
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <Tabs defaultValue="all" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-4 shrink-0">
            <TabsTrigger value="all" className="text-[11px] py-1.5 px-3">All ({items.length})</TabsTrigger>
            <TabsTrigger value="active" className="text-[11px] py-1.5 px-3">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="completed" className="text-[11px] py-1.5 px-3">Done ({completed.length})</TabsTrigger>
            <TabsTrigger value="failed" className="text-[11px] py-1.5 px-3">Failed ({failed.length})</TabsTrigger>
          </TabsList>

          {(['all', 'active', 'completed', 'failed'] as const).map((tab) => {
            const tabItems = tab === 'all' ? items : tab === 'active' ? [...active, ...queued] : tab === 'completed' ? completed : failed;
            return (
              <TabsContent key={tab} value={tab} className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-full">
                  {tabItems.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                      No transfers
                    </div>
                  ) : (
                    tabItems.map((item) => {
                      const progress = item.totalBytes > 0 ? (item.transferredBytes / item.totalBytes) * 100 : 0;
                      const isFailed = item.status === 'failed';
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'grid grid-cols-[1fr_60px_100px_60px_50px_50px] gap-2 px-3 py-1 items-center text-xs',
                            isFailed && 'bg-destructive-tint/40',
                          )}
                          title={item.error ?? undefined}
                        >
                          <span className="truncate">{item.fileName}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1 py-0 justify-center',
                              item.direction === 'upload' ? 'text-[hsl(var(--upload-color))]' : 'text-[hsl(var(--download-color))]',
                            )}
                          >
                            {item.direction === 'upload' ? 'UP' : 'DN'}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground w-8 text-right">
                              {item.status === 'completed' ? '100%' : `${Math.round(progress)}%`}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'text-[10px] text-right',
                              isFailed ? 'text-destructive' : 'text-muted-foreground',
                            )}
                          >
                            {item.status === 'active' ? formatSpeed(item.speed) : item.status}
                          </span>
                          <span className="text-[10px] text-muted-foreground text-right">
                            {item.status === 'active' ? formatEta(item.totalBytes, item.transferredBytes, item.speed) : ''}
                          </span>
                          <div className="flex items-center justify-end gap-0.5">
                            {isFailed && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-primary"
                                onClick={() => retryTransfer(item.id)}
                                title={`Retry — ${item.error ?? 'failed'}`}
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => cancelTransfer(item.id)}
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </ScrollArea>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
