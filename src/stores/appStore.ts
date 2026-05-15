import { create } from "zustand";
import type {
  Task,
  VaultConfig,
  LlmModel,
  ChatSession,
  ChatMessage,
  AppView,
  BoardView,
  ExtractionPreview,
  ActiveTimer,
  ProjectSpace,
  SpaceNote,
} from "@/types";
import { DEFAULT_STATUS_COLORS } from "@/types";

interface AppState {
  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // Board
  boardView: BoardView;
  setBoardView: (view: BoardView) => void;
  projectFilter: string | null;
  setProjectFilter: (project: string | null) => void;
  ownerFilter: string | null;
  setOwnerFilter: (owner: string | null) => void;

  // Tasks
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;

  // Timer
  activeTimer: ActiveTimer | null;
  startTimer: (taskId: string) => void;
  stopTimer: () => { taskId: string; elapsed: number } | null;

  // Config
  config: VaultConfig;
  setConfig: (config: VaultConfig) => void;

  // LLM
  models: LlmModel[];
  setModels: (models: LlmModel[]) => void;
  llmConnected: boolean;
  setLlmConnected: (connected: boolean) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;

  // Chat
  chatSessions: ChatSession[];
  setChatSessions: (sessions: ChatSession[]) => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  addChatMessage: (sessionId: string, message: ChatMessage) => void;
  createChatSession: (title: string) => string;

  // Documents
  extractionPreview: ExtractionPreview | null;
  setExtractionPreview: (preview: ExtractionPreview | null) => void;

  // Project Spaces
  projectSpaces: ProjectSpace[];
  setProjectSpaces: (spaces: ProjectSpace[]) => void;
  activeSpaceId: string | null;
  setActiveSpaceId: (id: string | null) => void;
  addProjectSpace: (space: ProjectSpace) => void;

  // Space Notes (keyed by space id)
  spaceNotes: Record<string, SpaceNote[]>;
  setSpaceNotes: (spaceId: string, notes: SpaceNote[]) => void;
  upsertSpaceNote: (spaceId: string, note: SpaceNote) => void;
  removeSpaceNote: (spaceId: string, noteId: string) => void;

  // Vault
  vaultInitialized: boolean;
  setVaultInitialized: (initialized: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentView: "dashboard",
  setView: (view) => set({ currentView: view }),

  // Board
  boardView: "time",
  setBoardView: (view) => set({ boardView: view }),
  projectFilter: null,
  setProjectFilter: (project) => set({ projectFilter: project }),
  ownerFilter: null,
  setOwnerFilter: (owner) => set({ ownerFilter: owner }),

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),

  // Timer
  activeTimer: null,
  startTimer: (taskId) => {
    const existing = get().activeTimer;
    if (existing) {
      get().stopTimer();
    }
    set({
      activeTimer: { taskId, startedAt: Date.now() },
    });
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "in_progress" as const } : t
      ),
    }));
  },
  stopTimer: () => {
    const timer = get().activeTimer;
    if (!timer) return null;

    const elapsed = (Date.now() - timer.startedAt) / (1000 * 60 * 60);
    const rounded = Math.round(elapsed * 100) / 100;

    set((state) => ({
      activeTimer: null,
      tasks: state.tasks.map((t) =>
        t.id === timer.taskId
          ? { ...t, actual_hours: t.actual_hours + rounded }
          : t
      ),
    }));

    return { taskId: timer.taskId, elapsed: rounded };
  },

  // Config
  config: {
    vault_path: "",
    lm_studio_url: "http://localhost:1234",
    active_model: "",
    watched_folders: [],
    auto_process: true,
    theme: "dark",
    user_name: "",
    country: "DE",
    status_colors: { ...DEFAULT_STATUS_COLORS },
  },
  setConfig: (config) => set({ config }),

  // LLM
  models: [],
  setModels: (models) => set({ models }),
  llmConnected: false,
  setLlmConnected: (connected) => set({ llmConnected: connected }),
  isProcessing: false,
  setIsProcessing: (processing) => set({ isProcessing: processing }),

  // Chat
  chatSessions: [],
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
  addChatMessage: (sessionId, message) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
      ),
    })),
  createChatSession: (title) => {
    const id = `chat_${Date.now()}`;
    const session: ChatSession = {
      id,
      title,
      created: new Date().toISOString(),
      messages: [],
    };
    set((state) => ({
      chatSessions: [...state.chatSessions, session],
      activeChatId: id,
    }));
    return id;
  },

  // Documents
  extractionPreview: null,
  setExtractionPreview: (preview) => set({ extractionPreview: preview }),

  // Project Spaces
  projectSpaces: [],
  setProjectSpaces: (spaces) => set({ projectSpaces: spaces }),
  activeSpaceId: null,
  setActiveSpaceId: (id) => set({ activeSpaceId: id }),
  addProjectSpace: (space) =>
    set((state) => ({ projectSpaces: [...state.projectSpaces, space] })),

  // Space Notes
  spaceNotes: {},
  setSpaceNotes: (spaceId, notes) =>
    set((state) => ({ spaceNotes: { ...state.spaceNotes, [spaceId]: notes } })),
  upsertSpaceNote: (spaceId, note) =>
    set((state) => {
      const existing = state.spaceNotes[spaceId] || [];
      const idx = existing.findIndex((n) => n.id === note.id);
      const updated = [...existing];
      if (idx >= 0) {
        updated[idx] = note;
      } else {
        updated.push(note);
      }
      return { spaceNotes: { ...state.spaceNotes, [spaceId]: updated } };
    }),
  removeSpaceNote: (spaceId, noteId) =>
    set((state) => ({
      spaceNotes: {
        ...state.spaceNotes,
        [spaceId]: (state.spaceNotes[spaceId] || []).filter((n) => n.id !== noteId),
      },
    })),

  // Vault
  vaultInitialized: false,
  setVaultInitialized: (initialized) => set({ vaultInitialized: initialized }),
}));
