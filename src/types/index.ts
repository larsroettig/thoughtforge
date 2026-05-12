export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  urgency: TaskUrgency;
  project: string;
  owner: string;
  collaborators: string[];
  source: string;
  source_quote: string;
  created: string;
  due: string;
  estimated_hours: number;
  actual_hours: number;
  blocked_by: string[];
  subtasks: string[];
  notes: string;
  archived: boolean;
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskUrgency =
  | "overdue"
  | "today"
  | "this_week"
  | "next_2weeks"
  | "ongoing";

export type BoardView = "time" | "status" | "day";

export interface BoardColumn {
  id: string;
  title: string;
  color: string;
  taskIds: string[];
}

export interface Project {
  name: string;
  filename: string;
  content: string;
}

export interface VaultConfig {
  vault_path: string;
  lm_studio_url: string;
  active_model: string;
  watched_folders: string[];
  auto_process: boolean;
  theme: string;
  user_name: string;
}

export interface LlmModel {
  id: string;
  object: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created: string;
  messages: ChatMessage[];
}

export interface UploadedDocument {
  path: string;
  name: string;
  type: "txt" | "md" | "pdf";
  processed: boolean;
  extractedTasks: number;
}

export interface ExtractionPreview {
  source: string;
  tasks: Partial<Task>[];
  duplicates: { existing: Task; new: Partial<Task> }[];
}

export interface ActiveTimer {
  taskId: string;
  startedAt: number; // timestamp ms
}

// Project Space types
export interface ProjectSpace {
  id: string;
  name: string;
  description: string;
  color: string;
  created: string;
  documents: SpaceDocument[];
  notes: SpaceNote[];
}

export interface SpaceDocument {
  name: string;
  path: string;
  type: string;
  added: string;
  size: number;
}

export interface SpaceNote {
  id: string;
  title: string;
  type: "daily" | "meeting" | "note";
  date: string;
  content: string;
  tags: string[];
}

export type AppView = "dashboard" | "board" | "chat" | "documents" | "settings" | "archive" | "project-space";

export type ProjectSpaceTab = "overview" | "documents" | "notes" | "meetings" | "tasks" | "knowledge";

export const URGENCY_COLUMNS: BoardColumn[] = [
  { id: "critical", title: "Critical / Blockers", color: "#f85149", taskIds: [] },
  { id: "this_week", title: "This Week", color: "#d29922", taskIds: [] },
  { id: "next_2weeks", title: "Next 2 Weeks", color: "#58a6ff", taskIds: [] },
  { id: "ongoing", title: "Ongoing / Strategic", color: "#3fb950", taskIds: [] },
];

export const STATUS_COLUMNS: BoardColumn[] = [
  { id: "todo", title: "To Do", color: "#8b949e", taskIds: [] },
  { id: "in_progress", title: "In Progress", color: "#d29922", taskIds: [] },
  { id: "review", title: "Review", color: "#58a6ff", taskIds: [] },
  { id: "done", title: "Done", color: "#3fb950", taskIds: [] },
];

// Auto-assigned colors for projects. Add custom overrides here.
const PALETTE = [
  "#f0883e", "#56d364", "#bc8cff", "#e3b341", "#58a6ff",
  "#f85149", "#79c0ff", "#d29922", "#3fb950", "#db61a2",
];

const _projectColorCache: Record<string, string> = {};

export function getProjectColor(name: string): string {
  if (!name) return "#8b949e";
  if (_projectColorCache[name]) return _projectColorCache[name];
  // Simple hash to pick a consistent color
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const color = PALETTE[Math.abs(hash) % PALETTE.length];
  _projectColorCache[name] = color;
  return color;
}

// Backwards compat -- components use PROJECT_COLORS[name] || PROJECT_COLORS.default
export const PROJECT_COLORS: Record<string, string> = new Proxy(
  { default: "#8b949e" } as Record<string, string>,
  {
    get(target, prop: string) {
      if (prop === "default") return target.default;
      return getProjectColor(prop);
    },
  }
);

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
