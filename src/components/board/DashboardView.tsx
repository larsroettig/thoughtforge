import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  CalendarDays,
  CalendarCheck,
  User,
  ListChecks,
  Inbox,
  CheckCircle2,
  Ban,
  Timer,
  TrendingUp,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import type { Task, StatusColors } from "@/types";
import { PROJECT_COLORS, DEFAULT_STATUS_COLORS } from "@/types";

type FilterId =
  | "my_todo"
  | "overdue"
  | "due_today"
  | "due_this_week"
  | "in_progress"
  | "blocked"
  | "unassigned"
  | "no_date"
  | "recently_done"
  | "all_open";

interface SmartFilter {
  id: FilterId;
  label: string;
  icon: typeof AlertTriangle;
  color: string;
  description: string;
}

function buildSmartFilters(sc: StatusColors): SmartFilter[] {
  return [
    { id: "my_todo", label: "My To Do", icon: Inbox, color: sc.todo, description: "Tasks assigned to you that need action" },
    { id: "overdue", label: "Overdue", icon: AlertTriangle, color: sc.blocked, description: "Past their due date" },
    { id: "due_today", label: "Due Today", icon: CalendarCheck, color: sc.in_progress, description: "Due today" },
    { id: "due_this_week", label: "Due This Week", icon: CalendarDays, color: sc.review, description: "Due within 7 days" },
    { id: "in_progress", label: "In Progress", icon: Timer, color: sc.in_progress, description: "Currently being worked on" },
    { id: "blocked", label: "Blocked", icon: Ban, color: sc.blocked, description: "Blocked tasks needing attention" },
    { id: "unassigned", label: "Unassigned", icon: User, color: "#8b949e", description: "No owner assigned" },
    { id: "no_date", label: "No Due Date", icon: Clock, color: "#8b949e", description: "Missing a deadline" },
    { id: "recently_done", label: "Recently Done", icon: CheckCircle2, color: sc.done, description: "Completed in the last 7 days" },
    { id: "all_open", label: "All Open", icon: ListChecks, color: sc.todo, description: "Every non-done, non-archived task" },
  ];
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getWeekFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

function getWeekAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

export function DashboardView() {
  const { tasks, config } = useAppStore();
  const userName = config.user_name?.toLowerCase() || "";
  const statusColors: StatusColors = { ...DEFAULT_STATUS_COLORS, ...(config.status_colors || {}) };
  const smartFilters = useMemo(() => buildSmartFilters(statusColors), [statusColors]);
  const [activeFilter, setActiveFilter] = useState<FilterId>("my_todo");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.archived),
    [tasks]
  );

  const today = getToday();
  const weekFromNow = getWeekFromNow();
  const weekAgo = getWeekAgo();

  // Compute counts for each filter
  const filterCounts = useMemo(() => {
    const counts: Record<FilterId, number> = {
      my_todo: 0,
      overdue: 0,
      due_today: 0,
      due_this_week: 0,
      in_progress: 0,
      blocked: 0,
      unassigned: 0,
      no_date: 0,
      recently_done: 0,
      all_open: 0,
    };

    for (const t of activeTasks) {
      const isOpen = t.status !== "done";

      if (isOpen && t.status === "todo" && userName && t.owner && t.owner.toLowerCase().includes(userName)) {
        counts.my_todo++;
      }
      if (isOpen && t.due && t.due < today) {
        counts.overdue++;
      }
      if (isOpen && t.due === today) {
        counts.due_today++;
      }
      if (isOpen && t.due && t.due >= today && t.due <= weekFromNow) {
        counts.due_this_week++;
      }
      if (t.status === "in_progress") {
        counts.in_progress++;
      }
      if (t.status === "blocked") {
        counts.blocked++;
      }
      if (isOpen && !t.owner) {
        counts.unassigned++;
      }
      if (isOpen && !t.due) {
        counts.no_date++;
      }
      if (t.status === "done" && t.created >= weekAgo) {
        counts.recently_done++;
      }
      if (isOpen) {
        counts.all_open++;
      }
    }

    return counts;
  }, [activeTasks, today, weekFromNow, weekAgo]);

  // Get filtered task list
  const filteredTasks = useMemo(() => {
    switch (activeFilter) {
      case "my_todo":
        return activeTasks.filter(
          (t) =>
            t.status !== "done" &&
            t.status === "todo" &&
            userName &&
            t.owner &&
            t.owner.toLowerCase().includes(userName)
        );
      case "overdue":
        return activeTasks.filter(
          (t) => t.status !== "done" && t.due && t.due < today
        );
      case "due_today":
        return activeTasks.filter(
          (t) => t.status !== "done" && t.due === today
        );
      case "due_this_week":
        return activeTasks.filter(
          (t) =>
            t.status !== "done" &&
            t.due &&
            t.due >= today &&
            t.due <= weekFromNow
        );
      case "in_progress":
        return activeTasks.filter((t) => t.status === "in_progress");
      case "blocked":
        return activeTasks.filter((t) => t.status === "blocked");
      case "unassigned":
        return activeTasks.filter(
          (t) => t.status !== "done" && !t.owner
        );
      case "no_date":
        return activeTasks.filter(
          (t) => t.status !== "done" && !t.due
        );
      case "recently_done":
        return activeTasks.filter(
          (t) => t.status === "done" && t.created >= weekAgo
        );
      case "all_open":
        return activeTasks.filter((t) => t.status !== "done");
      default:
        return [];
    }
  }, [activeTasks, activeFilter, today, weekFromNow, weekAgo]);

  // Sort: critical first, then by due date, then by priority
  const sortedTasks = useMemo(() => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...filteredTasks].sort((a, b) => {
      // Priority first
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      // Then due date (earlier first, no-date last)
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
  }, [filteredTasks]);

  // Project summary for sidebar stats
  const projectSummary = useMemo(() => {
    const map: Record<string, { open: number; done: number }> = {};
    for (const t of activeTasks) {
      const p = t.project || "(none)";
      if (!map[p]) map[p] = { open: 0, done: 0 };
      if (t.status === "done") map[p].done++;
      else map[p].open++;
    }
    return Object.entries(map).sort((a, b) => b[1].open - a[1].open);
  }, [activeTasks]);

  // Total hours tracked
  const totalHours = useMemo(
    () => activeTasks.reduce((sum, t) => sum + t.actual_hours, 0),
    [activeTasks]
  );

  const activeFilterMeta = smartFilters.find((f) => f.id === activeFilter)!;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-vault-text-bright">Dashboard</h2>
          <p className="text-xs text-vault-text-muted mt-0.5">
            {filterCounts.all_open} open tasks / {filterCounts.overdue > 0 ? `${filterCounts.overdue} overdue / ` : ""}{totalHours.toFixed(1)}h tracked
          </p>
        </div>
        <button
          onClick={() => setShowNewTask(true)}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Filter Sidebar */}
        <div className="w-56 border-r border-vault-border overflow-y-auto py-3 px-2 flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-vault-text-muted px-3 mb-2">
            Smart Filters
          </p>
          <div className="space-y-0.5">
            {smartFilters.map((filter) => {
              const Icon = filter.icon;
              const count = filterCounts[filter.id];
              const isActive = activeFilter === filter.id;

              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-vault-card text-vault-text-bright"
                      : "text-vault-text-muted hover:bg-vault-card hover:text-vault-text"
                  }`}
                >
                  <Icon
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: isActive ? filter.color : undefined }}
                  />
                  <span className="flex-1 text-left">{filter.label}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        isActive
                          ? "text-white"
                          : "text-vault-text-muted bg-vault-bg"
                      }`}
                      style={isActive ? { backgroundColor: filter.color } : undefined}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Project Quick Stats */}
          <div className="mt-6 px-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-vault-text-muted mb-2 flex items-center gap-1">
              <FolderOpen className="w-3 h-3" />
              Projects
            </p>
            <div className="space-y-1.5">
              {projectSummary.slice(0, 6).map(([name, info]) => {
                const color = PROJECT_COLORS[name] || PROJECT_COLORS.default;
                const total = info.open + info.done;
                const pct = total > 0 ? Math.round((info.done / total) * 100) : 0;
                return (
                  <div key={name} className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-vault-text-muted flex-1 truncate">
                      {name}
                    </span>
                    <span className="text-[10px] text-vault-text-muted">{info.open}</span>
                    <div className="w-10 h-1 rounded-full bg-vault-border overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tracked Time */}
          {totalHours > 0 && (
            <div className="mt-6 px-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-vault-text-muted mb-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Time Tracked
              </p>
              <p className="text-lg font-bold text-vault-text-bright">
                {totalHours.toFixed(1)}
                <span className="text-xs text-vault-text-muted font-normal ml-1">hours</span>
              </p>
            </div>
          )}
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Active filter header */}
          <div className="flex items-center gap-3 mb-4">
            <activeFilterMeta.icon
              className="w-5 h-5"
              style={{ color: activeFilterMeta.color }}
            />
            <div>
              <h3 className="text-base font-semibold text-vault-text-bright">
                {activeFilterMeta.label}
              </h3>
              <p className="text-xs text-vault-text-muted">
                {activeFilterMeta.description} -- {sortedTasks.length} task{sortedTasks.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {sortedTasks.length === 0 ? (
            <div className="text-center py-16">
              <activeFilterMeta.icon
                className="w-10 h-10 mx-auto mb-3 opacity-20"
                style={{ color: activeFilterMeta.color }}
              />
              <p className="text-sm text-vault-text-muted">
                No tasks match this filter
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-w-4xl">
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => setEditingTask(task)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Modal (edit or new) */}
      {(editingTask || showNewTask) && (
        <TaskModal
          task={editingTask}
          onClose={() => {
            setEditingTask(null);
            setShowNewTask(false);
          }}
        />
      )}
    </div>
  );
}
