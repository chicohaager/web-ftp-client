import { useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';

interface ShortcutHandlers {
  onDelete: () => void;
  onRename: () => void;
  onRefresh: () => void;
  onSelectAll: () => void;
  onGoUp: () => void;
}

export function useKeyboardShortcuts(
  localHandlers: ShortcutHandlers,
  remoteHandlers: ShortcutHandlers,
) {
  const focusedPanel = useUiStore((s) => s.focusedPanel);
  const setFocusedPanel = useUiStore((s) => s.setFocusedPanel);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs/dialogs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const handlers = focusedPanel === 'local' ? localHandlers : remoteHandlers;

      switch (e.key) {
        case 'Delete':
          e.preventDefault();
          handlers.onDelete();
          break;
        case 'F2':
          e.preventDefault();
          handlers.onRename();
          break;
        case 'F5':
          e.preventDefault();
          handlers.onRefresh();
          break;
        case 'Backspace':
          e.preventDefault();
          handlers.onGoUp();
          break;
        case 'Tab':
          e.preventDefault();
          setFocusedPanel(focusedPanel === 'local' ? 'remote' : 'local');
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handlers.onSelectAll();
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedPanel, localHandlers, remoteHandlers, setFocusedPanel]);
}
