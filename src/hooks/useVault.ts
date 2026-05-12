import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import type { Task, VaultConfig, ProjectSpace } from "@/types";

export function useVault() {
  const {
    setTasks,
    setConfig,
    setVaultInitialized,
    addTask,
    updateTask,
    removeTask,
    setProjectSpaces,
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
      // Ensure defaults for missing fields
      const spaces = raw.map((s) => ({
        ...s,
        documents: s.documents || [],
        notes: s.notes || [],
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

  return {
    initVault,
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
  };
}
