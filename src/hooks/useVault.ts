import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import type { Task, VaultConfig, ProjectSpace, SpaceNote, NoteSearchResult, SmartGoal } from "@/types";

export function useVault() {
  const {
    setTasks,
    setConfig,
    setVaultInitialized,
    addTask,
    updateTask,
    removeTask,
    setProjectSpaces,
    setSpaceNotes,
    upsertSpaceNote,
    removeSpaceNote,
  } = useAppStore();

  const initVault = useCallback(async () => {
    try {
      const path = await invoke<string>("init_vault");
      console.log("Vault initialized at:", path);
      setVaultInitialized(true);
      return path;
    } catch (err) {
      console.error("Failed to init vault:", err);
      throw err;
    }
  }, [setVaultInitialized]);

  const loadTasks = useCallback(async () => {
    try {
      const tasks = await invoke<Task[]>("read_tasks");
      setTasks(tasks);
      return tasks;
    } catch (err) {
      console.error("Failed to load tasks:", err);
      return [];
    }
  }, [setTasks]);

  const saveTask = useCallback(
    async (task: Task) => {
      try {
        await invoke("write_task", { task });
        const existing = useAppStore.getState().tasks.find((t) => t.id === task.id);
        if (existing) {
          updateTask(task.id, task);
        } else {
          addTask(task);
        }
      } catch (err) {
        console.error("Failed to save task:", err);
        throw err;
      }
    },
    [addTask, updateTask]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_task", { id });
        removeTask(id);
      } catch (err) {
        console.error("Failed to delete task:", err);
        throw err;
      }
    },
    [removeTask]
  );

  const loadConfig = useCallback(async () => {
    try {
      const config = await invoke<VaultConfig>("read_config");
      setConfig(config);
      return config;
    } catch (err) {
      console.error("Failed to load config:", err);
      return null;
    }
  }, [setConfig]);

  const saveConfig = useCallback(
    async (config: VaultConfig) => {
      try {
        await invoke("write_config", { config });
        setConfig(config);
      } catch (err) {
        console.error("Failed to save config:", err);
        throw err;
      }
    },
    [setConfig]
  );

  const readFileContent = useCallback(async (path: string): Promise<string> => {
    return invoke<string>("read_file_content", { path });
  }, []);

  const startWatching = useCallback(async (paths: string[]) => {
    try {
      await invoke("start_watching", { paths });
    } catch (err) {
      console.error("Failed to start watching:", err);
    }
  }, []);

  // ── Project Spaces ──────────────────────────────────────────────────

  const loadSpaces = useCallback(async () => {
    try {
      const raw = await invoke<ProjectSpace[]>("read_spaces");
      const spaces = raw.map((s) => ({
        ...s,
        archived: s.archived || false,
        documents: s.documents || [],
        timeEntries: s.timeEntries || [],
      }));
      setProjectSpaces(spaces);
      return spaces;
    } catch (err) {
      console.error("Failed to load spaces:", err);
      return [];
    }
  }, [setProjectSpaces]);

  const saveSpace = useCallback(async (space: ProjectSpace) => {
    try {
      await invoke("write_space", { space });
    } catch (err) {
      console.error("Failed to save space:", err);
      throw err;
    }
  }, []);

  const deleteSpace = useCallback(async (id: string) => {
    try {
      await invoke("delete_space", { id });
      const current = useAppStore.getState().projectSpaces;
      setProjectSpaces(current.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete space:", err);
    }
  }, [setProjectSpaces]);

  // ── Knowledge Search ────────────────────────────────────────────────

  const indexSpaceNotes = useCallback(async (spaceId: string): Promise<number> => {
    return invoke<number>("index_space_notes", { spaceId });
  }, []);

  const searchSpaceNotes = useCallback(async (
    spaceId: string,
    query: string,
    limit?: number
  ): Promise<NoteSearchResult[]> => {
    return invoke<NoteSearchResult[]>("search_space_notes", { spaceId, query, limit });
  }, []);

  const spaceIndexStatus = useCallback(async (spaceId: string): Promise<{ indexed_count: number; last_modified_unix: number | null }> => {
    return invoke("space_index_status", { spaceId });
  }, []);

  // ── Space Notes ─────────────────────────────────────────────────────

  const loadSpaceNotes = useCallback(async (spaceId: string) => {
    try {
      const notes = await invoke<SpaceNote[]>("read_space_notes", { spaceId });
      setSpaceNotes(spaceId, notes);
      return notes;
    } catch (err) {
      console.error("Failed to load notes for space:", spaceId, err);
      return [];
    }
  }, [setSpaceNotes]);

  const saveSpaceNote = useCallback(async (spaceId: string, note: SpaceNote) => {
    try {
      await invoke("write_space_note", { spaceId, note });
      upsertSpaceNote(spaceId, note);
    } catch (err) {
      console.error("Failed to save note:", err);
      throw err;
    }
  }, [upsertSpaceNote]);

  const deleteSpaceNote = useCallback(async (spaceId: string, noteId: string) => {
    try {
      await invoke("delete_space_note", { spaceId, noteId });
      removeSpaceNote(spaceId, noteId);
    } catch (err) {
      console.error("Failed to delete note:", err);
      throw err;
    }
  }, [removeSpaceNote]);

  // ── SMART Goals ─────────────────────────────────────────────────────

  const saveGoal = useCallback(async (goal: SmartGoal) => {
    const spaces = useAppStore.getState().projectSpaces;
    const space = spaces.find((s) => s.id === goal.space) ?? spaces.find((s) => s.id === "general");
    if (!space) return;
    const goals = [...(space.goals ?? [])];
    const idx = goals.findIndex((g) => g.id === goal.id);
    if (idx >= 0) goals[idx] = goal; else goals.push(goal);
    const updated = { ...space, goals };
    setProjectSpaces(spaces.map((s) => (s.id === updated.id ? updated : s)));
    await invoke("write_space", { space: updated });
  }, [setProjectSpaces]);

  const deleteGoal = useCallback(async (goalId: string, spaceId: string) => {
    const spaces = useAppStore.getState().projectSpaces;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const updated = { ...space, goals: (space.goals ?? []).filter((g) => g.id !== goalId) };
    setProjectSpaces(spaces.map((s) => (s.id === updated.id ? updated : s)));
    await invoke("write_space", { space: updated });
  }, [setProjectSpaces]);

  const changeVaultPath = useCallback(async (newPath: string) => {
    const resolved = await invoke<string>("change_vault_path", { newPath });
    await invoke("init_vault");
    const config = await invoke<VaultConfig>("read_config");
    setConfig(config);
    const raw = await invoke<import("@/types").ProjectSpace[]>("read_spaces");
    setProjectSpaces(raw.map((s) => ({ ...s, archived: s.archived || false, documents: s.documents || [], timeEntries: s.timeEntries || [] })));
    const tasks = await invoke<import("@/types").Task[]>("read_tasks");
    setTasks(tasks);
    return resolved;
  }, [setConfig, setProjectSpaces, setTasks]);

  return {
    initVault,
    changeVaultPath,
    loadTasks,
    saveTask,
    deleteTask,
    loadConfig,
    saveConfig,
    readFileContent,
    startWatching,
    loadSpaces,
    saveSpace,
    deleteSpace,
    loadSpaceNotes,
    saveSpaceNote,
    deleteSpaceNote,
    indexSpaceNotes,
    searchSpaceNotes,
    spaceIndexStatus,
    saveGoal,
    deleteGoal,
  };
}
