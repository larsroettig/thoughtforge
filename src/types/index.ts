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
  time_only: boolean; // true = time-booking task, hidden from board
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskUrgency =
  | "overdue"
  | "today"
  | "this_week"
  | "next_2weeks"
  | "ongoing";

export type BoardView = "time" | "status" | "day" | "calendar";

export interface BoardColumn {
  id: string;
  title: string;
  color: string;
  taskIds: string[];
}


export interface StatusColors {
  todo: string;
  in_progress: string;
  review: string;
  done: string;
  blocked: string;
}

export const DEFAULT_STATUS_COLORS: StatusColors = {
  todo: "#8b949e",
  in_progress: "#d29922",
  review: "#58a6ff",
  done: "#3fb950",
  blocked: "#f85149",
};

export interface VaultConfig {
  vault_path: string;
  lm_studio_url: string;
  active_model: string;
  embedding_model: string;
  watched_folders: string[];
  auto_process: boolean;
  theme: string;
  user_name: string;
  country: string;
  status_colors: StatusColors;
  notifications_enabled?: boolean;
  mcp_enabled?: boolean;
  mcp_token?: string;
  mcp_http_enabled?: boolean;
  weekly_hours_target?: number;
  nav_order?: string[];
  nav_disabled?: string[];
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
export interface TimeEntry {
  id: string;
  date: string;
  hours: number;
  description: string;
}

export interface SmartGoal {
  id: string;
  title: string;
  metric: string;
  target: string;
  current: string;
  difficulty: "easy" | "moderate" | "stretch";
  space: string;
  due: string;
  status: "active" | "completed" | "abandoned";
  linked_tasks: string[];
  notes: string;
  created: string;
}

export interface ProjectSpace {
  id: string;
  name: string;
  description: string;
  color: string;
  created: string;
  archived: boolean;
  documents: SpaceDocument[];
  timeEntries: TimeEntry[];
  goals?: SmartGoal[];
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

export interface NoteSearchResult {
  note_id: string;
  title: string;
  date: string;
  note_type: string;
  preview: string;
  score: number;
}

export type AppView = "dashboard" | "board" | "matrix" | "goals" | "chat" | "documents" | "settings" | "archive" | "project-space" | "stats";

export type ProjectSpaceTab = "overview" | "documents" | "notes" | "meetings" | "tasks" | "knowledge" | "chat";

export const URGENCY_COLUMNS: BoardColumn[] = [
  { id: "critical", title: "Critical / Blockers", color: "#f85149", taskIds: [] },
  { id: "this_week", title: "This Week", color: "#d29922", taskIds: [] },
  { id: "next_2weeks", title: "Next 2 Weeks", color: "#58a6ff", taskIds: [] },
  { id: "ongoing", title: "Ongoing / Strategic", color: "#3fb950", taskIds: [] },
];

export function getStatusColumns(colors?: StatusColors): BoardColumn[] {
  const c = colors || DEFAULT_STATUS_COLORS;
  return [
    { id: "todo", title: "To Do", color: c.todo, taskIds: [] },
    { id: "in_progress", title: "In Progress", color: c.in_progress, taskIds: [] },
    { id: "review", title: "Review", color: c.review, taskIds: [] },
    { id: "done", title: "Done", color: c.done, taskIds: [] },
  ];
}

// Backwards compat default
export const STATUS_COLUMNS: BoardColumn[] = getStatusColumns();

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

export function getStatusColor(status: TaskStatus, colors?: StatusColors): string {
  const c = colors || DEFAULT_STATUS_COLORS;
  return c[status] || DEFAULT_STATUS_COLORS[status] || "#8b949e";
}

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
