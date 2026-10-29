import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  createSavedChecklist,
  createSavedChecklistTask,
  deleteSavedChecklistTask,
  getSavedChecklist,
  listSavedChecklists,
  setSavedChecklistTaskCompleted,
  updateSavedChecklistTaskText,
  updateSavedChecklistTitle,
} from './checklistLibrary';
import type { InitialChecklistTask, SavedChecklist, SavedChecklistSummary, SavedChecklistTask } from './checklistTypes';
import { moveSavedItemToRecentlyDeleted } from '@/features/home-trash/trashLibrary';

type ChecklistLibraryContextValue = {
  checklists: SavedChecklistSummary[];
  isReady: boolean;
  hasCatalogLoadSucceeded: boolean;
  refresh: () => Promise<void>;
  getChecklist: (id: number) => Promise<SavedChecklist | null>;
  createChecklist: (title: string, tasks?: readonly (string | InitialChecklistTask)[]) => Promise<number>;
  updateTitle: (id: number, title: string) => Promise<boolean>;
  addTask: (checklistId: number, text: string) => Promise<SavedChecklistTask>;
  updateTaskText: (checklistId: number, taskId: number, text: string) => Promise<boolean>;
  setTaskCompleted: (checklistId: number, taskId: number, completed: boolean) => Promise<boolean>;
  deleteTask: (checklistId: number, taskId: number) => Promise<boolean>;
  deleteChecklist: (id: number, expectedFolderId?: string | null) => Promise<boolean>;
};

const ChecklistLibraryContext = createContext<ChecklistLibraryContextValue | null>(null);

export function LocalChecklistLibraryProvider({ children }: PropsWithChildren) {
  const [checklists, setChecklists] = useState<SavedChecklistSummary[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasCatalogLoadSucceeded, setHasCatalogLoadSucceeded] = useState(false);
  const mountedRef = useRef(true);
  const refreshGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    try {
      const nextChecklists = await listSavedChecklists();
      if (mountedRef.current && generation === refreshGenerationRef.current) {
        setChecklists(nextChecklists);
        setIsReady(true);
        setHasCatalogLoadSucceeded(true);
      }
    } catch (error) {
      if (mountedRef.current && generation === refreshGenerationRef.current) {
        setHasCatalogLoadSucceeded(false);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh().catch(() => {
      // Keep the feed unready rather than render an incomplete or privacy-unsafe catalog.
    });
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const refreshAfterWrite = useCallback(async () => {
    try {
      await refresh();
    } catch {
      // The committed operation remains successful; a later focus refresh can reconcile the catalog.
    }
  }, [refresh]);

  const createChecklist = useCallback(async (title: string, tasks: readonly (string | InitialChecklistTask)[] = []) => {
    const id = await createSavedChecklist(title, tasks);
    await refreshAfterWrite();
    return id;
  }, [refreshAfterWrite]);

  const updateTitle = useCallback(async (id: number, title: string) => {
    const changed = await updateSavedChecklistTitle(id, title);
    if (changed) await refreshAfterWrite();
    return changed;
  }, [refreshAfterWrite]);

  const addTask = useCallback(async (checklistId: number, text: string) => {
    const task = await createSavedChecklistTask(checklistId, text);
    await refreshAfterWrite();
    return task;
  }, [refreshAfterWrite]);

  const updateTaskText = useCallback(async (checklistId: number, taskId: number, text: string) => {
    const changed = await updateSavedChecklistTaskText(checklistId, taskId, text);
    if (changed) await refreshAfterWrite();
    return changed;
  }, [refreshAfterWrite]);

  const setTaskCompleted = useCallback(async (checklistId: number, taskId: number, completed: boolean) => {
    const changed = await setSavedChecklistTaskCompleted(checklistId, taskId, completed);
    if (changed) await refreshAfterWrite();
    return changed;
  }, [refreshAfterWrite]);

  const deleteTask = useCallback(async (checklistId: number, taskId: number) => {
    const deleted = await deleteSavedChecklistTask(checklistId, taskId);
    if (deleted) await refreshAfterWrite();
    return deleted;
  }, [refreshAfterWrite]);

  const removeChecklist = useCallback(async (id: number, expectedFolderId?: string | null) => {
    const deleted = await moveSavedItemToRecentlyDeleted('checklist', id, expectedFolderId);
    if (deleted) await refreshAfterWrite();
    return deleted;
  }, [refreshAfterWrite]);

  const value = useMemo<ChecklistLibraryContextValue>(() => ({
    checklists,
    isReady,
    hasCatalogLoadSucceeded,
    refresh,
    getChecklist: getSavedChecklist,
    createChecklist,
    updateTitle,
    addTask,
    updateTaskText,
    setTaskCompleted,
    deleteTask,
    deleteChecklist: removeChecklist,
  }), [
    addTask,
    checklists,
    createChecklist,
    deleteTask,
    isReady,
    hasCatalogLoadSucceeded,
    refresh,
    removeChecklist,
    setTaskCompleted,
    updateTaskText,
    updateTitle,
  ]);

  return <ChecklistLibraryContext.Provider value={value}>{children}</ChecklistLibraryContext.Provider>;
}

export function useLocalChecklists() {
  const context = useContext(ChecklistLibraryContext);
  if (!context) throw new Error('useLocalChecklists must be used inside LocalChecklistLibraryProvider.');
  return context;
}
