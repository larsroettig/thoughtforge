import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Clock,
  User,
  UserPlus,
  AlertTriangle,
  Play,
  Square,
  MoreHorizontal,
  Trash2,
  Archive,
  CalendarDays,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  Ban,
  ArrowRight,
} from "lucide-react";
import type { Task, TaskStatus } from "@/types";
import { PROJECT_COLORS, STATUS_LABELS } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { OwnerSelect } from "./OwnerSelect";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Loader2,
  review: Eye,
  done: CheckCircle2,
  blocked: Ban,
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { activeTimer, startTimer, stopTimer, updateTask } = useAppStore();
  const { saveTask, deleteTask } = useVault();

  const isTimerRunning = activeTimer?.taskId === task.id;

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
    setShowDatePicker(false);
    setShowAssign(false);
  }, []);

  const handleQuickAction = useCallback(
    async (action: string, value?: string) => {
      setShowMenu(false);
      setShowDatePicker(false);
      setShowAssign(false);

      switch (action) {
        case "assign": {
          const updated = { ...task, owner: value || "" };
          updateTask(task.id, { owner: value || "" });
          await saveTask(updated);
          break;
        }
        case "status": {
          const updated = { ...task, status: value as TaskStatus };
          updateTask(task.id, { status: value as TaskStatus });
          await saveTask(updated);
          break;
        }
        case "archive": {
          const updated = { ...task, archived: true, status: "done" as const };
          updateTask(task.id, { archived: true, status: "done" });
          await saveTask(updated);
          break;
        }
        case "delete": {
          await deleteTask(task.id);
          break;
        }
        case "due": {
          const updated = { ...task, due: value || "" };
          updateTask(task.id, { due: value || "" });
          await saveTask(updated);
          break;
        }
        case "timer_start": {
          startTimer(task.id);
          const updated = { ...task, status: "in_progress" as const };
          await saveTask(updated);
          break;
        }
        case "timer_stop": {
          const result = stopTimer();
          if (result) {
            const t = useAppStore.getState().tasks.find((x) => x.id === task.id);
            if (t) await saveTask(t);
          }
          break;
        }
      }
    },
    [task, updateTask, saveTask, deleteTask, startTimer, stopTimer]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", task.id);
      e.dataTransfer.effectAllowed = "move";
      (e.target as HTMLElement).style.opacity = "0.4";
    },
    [task.id]
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
  }, []);

  const projectColor = PROJECT_COLORS[task.project] || PROJECT_COLORS.default;

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={`card-base cursor-grab active:cursor-grabbing group relative ${
          isTimerRunning ? "ring-1 ring-vault-success/50 border-vault-success/30" : ""
        }`}
      >
        {/* Timer indicator */}
        {isTimerRunning && (
          <div className="absolute top-2 right-2 flex items-center gap-1 text-vault-success">
            <span className="w-1.5 h-1.5 rounded-full bg-vault-success animate-pulse" />
            <span className="text-[10px] font-mono">REC</span>
          </div>
        )}

        {/* Quick action button (visible on hover) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPos({ x: rect.right, y: rect.top });
            setShowMenu(true);
            setShowDatePicker(false);
            setShowAssign(false);
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-vault-border/50"
          style={isTimerRunning ? { right: "3rem" } : undefined}
        >
          <MoreHorizontal className="w-3.5 h-3.5 text-vault-text-muted" />
        </button>

        {/* Title */}
        <h4 className="text-sm font-semibold text-vault-text-bright leading-snug mb-2 pr-6 group-hover:text-vault-accent transition-colors">
          {task.title}
        </h4>

        {/* Source Quote */}
        {task.source_quote && (
          <p className="text-xs text-vault-text-muted italic mb-2 line-clamp-2">
            "{task.source_quote}"
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {task.priority === "critical" && (
            <span className="tag bg-vault-critical/15 text-vault-critical border border-vault-critical/30 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              critical
            </span>
          )}
          {task.priority === "high" && (
            <span className="tag bg-vault-warning/15 text-vault-warning border border-vault-warning/30">
              high
            </span>
          )}

          {task.project && (
            <span
              className="tag border"
              style={{
                backgroundColor: `${projectColor}15`,
                color: projectColor,
                borderColor: `${projectColor}30`,
              }}
            >
              {task.project}
            </span>
          )}

          {task.owner && (
            <span className="tag bg-vault-accent/10 text-vault-accent-hover border border-vault-accent/20 flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {task.owner}
            </span>
          )}

          {task.due && (
            <span className="tag bg-vault-bg text-vault-text-muted border border-vault-border flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {task.due}
            </span>
          )}

          {task.actual_hours > 0 && (
            <span className="tag bg-vault-success/10 text-vault-success border border-vault-success/20 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {task.actual_hours.toFixed(1)}h
            </span>
          )}

          {task.status === "blocked" && (
            <span className="tag bg-vault-critical/15 text-vault-critical border border-vault-critical/30">
              blocked
            </span>
          )}
        </div>

        {task.subtasks.length > 0 && (
          <div className="mt-2 text-xs text-vault-text-muted">
            {task.subtasks.length} subtask{task.subtasks.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-vault-surface border border-vault-border rounded-xl shadow-2xl py-1.5 w-52"
          style={{
            left: Math.min(menuPos.x, window.innerWidth - 220),
            top: Math.min(menuPos.y, window.innerHeight - 400),
          }}
        >
          {/* Status */}
          <div className="px-2 py-1">
            <p className="text-[10px] text-vault-text-muted uppercase tracking-wider font-semibold px-2 mb-1">
              Status
            </p>
            {(["todo", "in_progress", "review", "done", "blocked"] as TaskStatus[]).map(
              (s) => {
                const Icon = STATUS_ICONS[s];
                const isActive = task.status === s;
                return (
                  <button
                    key={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickAction("status", s);
                    }}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs ${
                      isActive
                        ? "bg-vault-accent/10 text-vault-accent"
                        : "text-vault-text hover:bg-vault-card"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {STATUS_LABELS[s]}
                    {isActive && (
                      <span className="ml-auto text-vault-accent text-[10px]">current</span>
                    )}
                  </button>
                );
              }
            )}
          </div>

          <div className="border-t border-vault-border my-1" />

          {/* Due Date */}
          <div className="px-2 py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDatePicker(!showDatePicker);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-text hover:bg-vault-card"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {task.due ? `Due: ${task.due}` : "Set due date"}
              <ArrowRight className="w-3 h-3 ml-auto text-vault-text-muted" />
            </button>
            {showDatePicker && (
              <div className="px-1 py-1 space-y-0.5">
                {/* Quick date shortcuts */}
                {(() => {
                  const today = new Date();
                  const fmt = (d: Date) => d.toISOString().split("T")[0];
                  const tomorrow = new Date(today);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  // Next Monday
                  const monday = new Date(today);
                  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
                  // Next Friday
                  const friday = new Date(today);
                  friday.setDate(friday.getDate() + ((12 - friday.getDay()) % 7 || 7));
                  // Next week same day
                  const nextWeek = new Date(today);
                  nextWeek.setDate(nextWeek.getDate() + 7);

                  const shortcuts = [
                    { label: "Today", date: fmt(today), color: "#e67e22" },
                    { label: "Tomorrow", date: fmt(tomorrow), color: "#f39c12" },
                    { label: "Monday", date: fmt(monday), color: "#3498db" },
                    { label: "Friday", date: fmt(friday), color: "#27ae60" },
                    { label: "Next week", date: fmt(nextWeek), color: "#8b949e" },
                  ];

                  return shortcuts.map((s) => (
                    <button
                      key={s.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickAction("due", s.date);
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-text hover:bg-vault-card"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                      <span className="ml-auto text-[10px] text-vault-text-muted">{s.date}</span>
                    </button>
                  ));
                })()}
                {/* Custom date picker */}
                <div className="pt-1 border-t border-vault-border mt-1">
                  <input
                    type="date"
                    defaultValue={task.due}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleQuickAction("due", e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="input-base w-full text-xs"
                  />
                </div>
                {task.due && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickAction("due", "");
                    }}
                    className="text-[10px] text-vault-critical hover:underline px-2 mt-1"
                  >
                    Clear date
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-vault-border my-1" />

          {/* Assign */}
          <div className="px-2 py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAssign(!showAssign);
                setShowDatePicker(false);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-text hover:bg-vault-card"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {task.owner ? `Assigned: ${task.owner}` : "Assign to..."}
              <ArrowRight className="w-3 h-3 ml-auto text-vault-text-muted" />
            </button>
            {showAssign && (
              <div className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                <OwnerSelect
                  value={task.owner}
                  onChange={(val) => handleQuickAction("assign", val)}
                  compact
                />
              </div>
            )}
          </div>

          <div className="border-t border-vault-border my-1" />

          {/* Timer */}
          <div className="px-2 py-1">
            {isTimerRunning ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickAction("timer_stop");
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-critical hover:bg-vault-card"
              >
                <Square className="w-3.5 h-3.5" />
                Stop Timer
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickAction("timer_start");
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-success hover:bg-vault-card"
              >
                <Play className="w-3.5 h-3.5" />
                Start Timer
              </button>
            )}
          </div>

          <div className="border-t border-vault-border my-1" />

          {/* Archive & Delete */}
          <div className="px-2 py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleQuickAction("archive");
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-text hover:bg-vault-card"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleQuickAction("delete");
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-vault-critical hover:bg-vault-critical/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Task
            </button>
          </div>
        </div>
      )}
    </>
  );
}
