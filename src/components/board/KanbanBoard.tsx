import { useState, useMemo } from "react";
import {
  Clock,
  ListChecks,
  CalendarDays,
  CalendarRange,
  Filter,
  Plus,
  Import,
  User,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { BoardColumn } from "./BoardColumn";
import { DayView } from "./DayView";
import { CalendarView } from "./CalendarView";
import { TaskModal } from "./TaskModal";
import { ImportModal } from "./ImportModal";
import { URGENCY_COLUMNS, getStatusColumns, PROJECT_COLORS } from "@/types";
import type { Task, BoardView } from "@/types";

const VIEW_OPTIONS: { id: BoardView; label: string; icon: typeof Clock }[] = [
  { id: "time", label: "Time", icon: Clock },
  { id: "status", label: "Status", icon: ListChecks },
  { id: "day", label: "Day", icon: CalendarDays },
  { id: "calendar", label: "Calendar", icon: CalendarRange },
];

export function KanbanBoard() {
  const {
    tasks,
    boardView,
    setBoardView,
    projectFilter,
    setProjectFilter,
    ownerFilter,
    setOwnerFilter,
    config,
  } = useAppStore();

  const { saveTask } = useVault();

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Get unique projects from non-archived, non-time-only tasks
  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived && !t.time_only), [tasks]);

  const projects = useMemo(() => {
    return [...new Set(activeTasks.map((t) => t.project).filter(Boolean))].sort();
  }, [activeTasks]);

  // Get unique owners (split compound owners like "Alice / Bob" into individual names too)
  const owners = useMemo(() => {
    const ownerSet = new Set<string>();
    for (const t of activeTasks) {
      if (t.owner) {
        ownerSet.add(t.owner);
        // Also add individual names from compound owners
        if (t.owner.includes("/")) {
          t.owner
            .split("/")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((name) => ownerSet.add(name));
        }
        if (t.owner.includes("+")) {
          t.owner
            .split("+")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((name) => ownerSet.add(name));
        }
      }
    }
    return [...ownerSet].sort();
  }, [activeTasks]);

  // Filter tasks (exclude archived, apply project + owner filters)
  const filteredTasks = useMemo(() => {
    let filtered = activeTasks;
    if (projectFilter) {
      filtered = filtered.filter((t) => t.project === projectFilter);
    }
    if (ownerFilter) {
      filtered = filtered.filter((t) => {
        if (!t.owner) return false;
        const ownerLower = t.owner.toLowerCase();
        const filterLower = ownerFilter.toLowerCase();
        return (
          ownerLower === filterLower ||
          ownerLower.includes(filterLower)
        );
      });
    }
    return filtered;
  }, [activeTasks, projectFilter, ownerFilter]);

  // Organize tasks into columns (for time/status views)
  const columns = useMemo(() => {
    if (boardView === "day" || boardView === "calendar") return [];
    const template = boardView === "time" ? URGENCY_COLUMNS : getStatusColumns(config.status_colors);
    return template.map((col) => ({
      ...col,
      tasks: filteredTasks.filter((t) => {
        if (boardView === "time") {
          // Hide done tasks from the time view
          if (t.status === "done") return false;
          if (col.id === "critical")
            return (
              t.urgency === "overdue" ||
              t.urgency === "today" ||
              t.priority === "critical"
            );
          return t.urgency === col.id;
        }
        return t.status === col.id;
      }),
    }));
  }, [filteredTasks, boardView]);

  const handleDrop = (taskId: string, columnId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    let updates: Partial<Task> = {};

    if (boardView === "time") {
      updates = { urgency: columnId as Task["urgency"] };
    } else if (boardView === "status") {
      updates = { status: columnId as Task["status"] };
    } else if (boardView === "day") {
      if (columnId === "overdue") return;
      updates = { due: columnId };
    }

    useAppStore.getState().updateTask(taskId, updates);
    const updated = { ...task, ...updates };
    saveTask(updated).catch(console.error);
  };

  const hasActiveFilters = projectFilter || ownerFilter;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-vault-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-vault-text-bright">Board</h2>

            {/* 3-Way View Toggle */}
            <div className="flex bg-vault-bg rounded-lg border border-vault-border p-0.5">
              {VIEW_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = boardView === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setBoardView(opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-vault-card text-vault-accent shadow-sm"
                        : "text-vault-text-muted hover:text-vault-text"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="btn-ghost flex items-center gap-1.5 text-xs"
            >
              <Import className="w-3.5 h-3.5" />
              Import
            </button>

            <button
              onClick={() => setShowNewTask(true)}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </button>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex items-center gap-4 mt-3">
          <Filter className="w-3.5 h-3.5 text-vault-text-muted flex-shrink-0" />

          {/* Project Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-vault-text-muted uppercase tracking-wider font-semibold">
              Project:
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setProjectFilter(null)}
                className={`tag ${
                  !projectFilter
                    ? "bg-vault-accent/20 text-vault-accent border border-vault-accent/30"
                    : "bg-vault-bg text-vault-text-muted border border-vault-border hover:border-vault-text-muted"
                }`}
              >
                All
              </button>
              {projects.map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    setProjectFilter(projectFilter === p ? null : p)
                  }
                  className={`tag ${
                    projectFilter === p
                      ? "border"
                      : "bg-vault-bg text-vault-text-muted border border-vault-border hover:border-vault-text-muted"
                  }`}
                  style={
                    projectFilter === p
                      ? {
                          backgroundColor: `${PROJECT_COLORS[p] || PROJECT_COLORS.default}20`,
                          color: PROJECT_COLORS[p] || PROJECT_COLORS.default,
                          borderColor: `${PROJECT_COLORS[p] || PROJECT_COLORS.default}50`,
                        }
                      : undefined
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-vault-border" />

          {/* Owner Filter */}
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-vault-text-muted" />
            <span className="text-[10px] text-vault-text-muted uppercase tracking-wider font-semibold">
              Assigned:
            </span>
            <select
              value={ownerFilter || ""}
              onChange={(e) =>
                setOwnerFilter(e.target.value || null)
              }
              className="bg-vault-bg border border-vault-border rounded-md px-2 py-1 text-xs text-vault-text focus:outline-none focus:border-vault-accent appearance-none cursor-pointer pr-6"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
              }}
            >
              <option value="">Everyone</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Clear all filters */}
          {hasActiveFilters && (
            <>
              <div className="w-px h-4 bg-vault-border" />
              <button
                onClick={() => {
                  setProjectFilter(null);
                  setOwnerFilter(null);
                }}
                className="text-[10px] text-vault-critical hover:underline"
              >
                Clear filters
              </button>
              <span className="text-[10px] text-vault-text-muted">
                {filteredTasks.length} / {activeTasks.length} tasks
              </span>
            </>
          )}
        </div>
      </div>

      {/* Board Content */}
      <div className="flex-1 overflow-auto p-6">
        {boardView === "calendar" ? (
          <CalendarView
            tasks={filteredTasks}
            onTaskClick={setEditingTask}
            onDrop={handleDrop}
          />
        ) : boardView === "day" ? (
          <DayView
            tasks={filteredTasks}
            onTaskClick={setEditingTask}
            onDrop={handleDrop}
          />
        ) : (
          <div className="grid grid-cols-4 gap-4 h-full">
            {columns.map((col) => (
              <BoardColumn
                key={col.id}
                id={col.id}
                title={col.title}
                color={col.color}
                tasks={col.tasks}
                onTaskClick={setEditingTask}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>

      {/* Task Edit Modal */}
      {(editingTask || showNewTask) && (
        <TaskModal
          task={editingTask}
          onClose={() => {
            setEditingTask(null);
            setShowNewTask(false);
          }}
        />
      )}

      {/* Import Modal */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
