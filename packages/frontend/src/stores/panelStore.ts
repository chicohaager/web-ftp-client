import { create } from 'zustand';
import type { FileItem } from '@web-ftp-client/shared';

interface PanelState {
  currentPath: string;
  files: FileItem[];
  loading: boolean;
  selectedIds: Set<string>;
  lastClickedId: string | null;
  sortColumn: 'name' | 'size' | 'modified';
  sortDirection: 'asc' | 'desc';
  history: string[];
  historyIndex: number;
  searchFilter: string;
}

interface PanelActions {
  setPath: (path: string) => void;
  setFiles: (files: FileItem[]) => void;
  setLoading: (loading: boolean) => void;
  select: (id: string, ctrl: boolean, shift: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSort: (column: 'name' | 'size' | 'modified') => void;
  setSearchFilter: (filter: string) => void;
  getFilteredFiles: () => FileItem[];
  getSelectedFiles: () => FileItem[];
  navigateTo: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  refresh: () => void;
  fetchFiles: (apiBase: string, path?: string) => Promise<void>;
}

type PanelStore = PanelState & PanelActions;

function createPanelStore(apiBase: string) {
  return create<PanelStore>((set, get) => ({
    currentPath: '/',
    files: [],
    loading: false,
    selectedIds: new Set(),
    lastClickedId: null,
    sortColumn: 'name',
    sortDirection: 'asc',
    history: ['/'],
    historyIndex: 0,
    searchFilter: '',

    setPath: (path) => set({ currentPath: path }),
    setFiles: (files) => set({ files }),
    setLoading: (loading) => set({ loading }),

    select: (id, ctrl, shift) => {
      const state = get();
      const filteredFiles = state.getFilteredFiles();
      const newSelected = new Set(ctrl ? state.selectedIds : []);

      if (shift && state.lastClickedId) {
        const ids = filteredFiles.map(f => f.id);
        const lastIdx = ids.indexOf(state.lastClickedId);
        const curIdx = ids.indexOf(id);
        if (lastIdx !== -1 && curIdx !== -1) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) {
            newSelected.add(ids[i]);
          }
        }
      } else if (ctrl && newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }

      set({ selectedIds: newSelected, lastClickedId: id });
    },

    selectAll: () => {
      set({ selectedIds: new Set(get().getFilteredFiles().map(f => f.id)) });
    },

    clearSelection: () => set({ selectedIds: new Set(), lastClickedId: null }),

    setSearchFilter: (filter) => set({ searchFilter: filter }),

    getFilteredFiles: () => {
      const state = get();
      if (!state.searchFilter) return state.files;
      const lower = state.searchFilter.toLowerCase();
      return state.files.filter(f => f.name.toLowerCase().includes(lower));
    },

    getSelectedFiles: () => {
      const state = get();
      return state.files.filter(f => state.selectedIds.has(f.id));
    },

    setSort: (column) => {
      const state = get();
      const direction = state.sortColumn === column && state.sortDirection === 'asc' ? 'desc' : 'asc';
      const sorted = [...state.files].sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        let cmp = 0;
        if (column === 'name') cmp = a.name.localeCompare(b.name);
        else if (column === 'size') cmp = a.size - b.size;
        else if (column === 'modified') cmp = a.modified.localeCompare(b.modified);
        return direction === 'desc' ? -cmp : cmp;
      });
      set({ sortColumn: column, sortDirection: direction, files: sorted });
    },

    navigateTo: (path) => {
      const state = get();
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(path);
      set({
        currentPath: path,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedIds: new Set(),
        lastClickedId: null,
        searchFilter: '',
      });
      get().fetchFiles(apiBase, path);
    },

    goBack: () => {
      const state = get();
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        const path = state.history[newIndex];
        set({ historyIndex: newIndex, currentPath: path, selectedIds: new Set(), searchFilter: '' });
        get().fetchFiles(apiBase, path);
      }
    },

    goForward: () => {
      const state = get();
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        const path = state.history[newIndex];
        set({ historyIndex: newIndex, currentPath: path, selectedIds: new Set(), searchFilter: '' });
        get().fetchFiles(apiBase, path);
      }
    },

    goUp: () => {
      const state = get();
      const parts = state.currentPath.split('/').filter(Boolean);
      parts.pop();
      const parent = '/' + parts.join('/');
      get().navigateTo(parent);
    },

    refresh: () => {
      get().fetchFiles(apiBase, get().currentPath);
    },

    fetchFiles: async (base, path) => {
      const targetPath = path ?? get().currentPath;
      set({ loading: true });
      try {
        const res = await fetch(`${base}/list?path=${encodeURIComponent(targetPath)}`);
        const data = await res.json();
        if (data.ok) {
          set({ files: data.data.files, currentPath: data.data.path, loading: false });
        } else {
          set({ loading: false });
        }
      } catch {
        set({ loading: false });
      }
    },
  }));
}

export const useLocalPanel = createPanelStore('/api/local');
export const useRemotePanel = createPanelStore('/api/remote');
