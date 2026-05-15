import { useState, useMemo, useEffect, useRef } from "react";
import { Bell, BellRing, X, CheckCheck } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { TaskModal } from "@/components/board/TaskModal";
import type { Task } from "@/types";

function getDismissalKey() {
  return `tf_dismissed_${new Date().toISOString().split("T")[0]}`;
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(getDismissalKey());
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(getDismissalKey(), JSON.stringify([...ids]));
}

export function NotificationCenter() {
  const { tasks, config } = useAppStore();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];

  const { overdueTasks, dueTodayTasks } = useMemo(() => {
    const active = tasks.filter((t) => !t.archived && !t.time_only && t.status !== "done");
    return {
      overdueTasks: active.filter((t) => t.due && t.due < today),
      dueTodayTasks: active.filter((t) => t.due === today),
    };
  }, [tasks, today]);

  const totalCount = overdueTasks.length + dueTodayTasks.length;
  const visibleCount = [overdueTasks, dueTodayTasks]
    .flat()
    .filter((t) => !dismissed.has(t.id)).length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dismissAll = () => {
    const all = new Set([...dismissed, ...overdueTasks.map((t) => t.id), ...dueTodayTasks.map((t) => t.id)]);
    setDismissed(all);
    saveDismissed(all);
  };

  if (config.notifications_enabled === false) return null;

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative p-1.5 rounded-md text-vault-text-muted hover:text-vault-text hover:bg-vault-card transition-colors"
          title="Notifications"
        >
          {visibleCount > 0 ? (
            <BellRing className="w-4 h-4 text-vault-warning" />
          ) : (
            <Bell className="w-4 h-4" />
          )}
          {visibleCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-vault-critical text-[9px] font-bold text-white rounded-full flex items-center justify-center px-0.5">
              {visibleCount > 9 ? "9+" : visibleCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-vault-surface border border-vault-border rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-vault-border">
              <span className="text-xs font-semibold text-vault-text-bright">Notifications</span>
              <button onClick={() => setOpen(false)} className="btn-ghost p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-80 overflow-y-auto">
              {totalCount === 0 || visibleCount === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-vault-text-muted">
                  <CheckCheck className="w-5 h-5 mx-auto mb-2 text-vault-success" />
                  All caught up ✓
                </div>
              ) : (
                <>
                  {overdueTasks.filter((t) => !dismissed.has(t.id)).length > 0 && (
                    <div>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-vault-critical bg-vault-critical/5">
                        Overdue ({overdueTasks.filter((t) => !dismissed.has(t.id)).length})
                      </p>
                      {overdueTasks
                        .filter((t) => !dismissed.has(t.id))
                        .map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            dateLabel={task.due}
                            onClick={() => { setSelectedTask(task); setOpen(false); }}
                          />
                        ))}
                    </div>
                  )}

                  {dueTodayTasks.filter((t) => !dismissed.has(t.id)).length > 0 && (
                    <div>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-vault-warning bg-vault-warning/5">
                        Due Today ({dueTodayTasks.filter((t) => !dismissed.has(t.id)).length})
                      </p>
                      {dueTodayTasks
                        .filter((t) => !dismissed.has(t.id))
                        .map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            dateLabel="Today"
                            onClick={() => { setSelectedTask(task); setOpen(false); }}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {visibleCount > 0 && (
              <div className="px-3 py-2 border-t border-vault-border">
                <button
                  onClick={dismissAll}
                  className="text-[10px] text-vault-text-muted hover:text-vault-accent w-full text-center"
                >
                  Dismiss all for today
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </>
  );
}

function TaskRow({
  task,
  dateLabel,
  onClick,
}: {
  task: Task;
  dateLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-vault-card border-b border-vault-border/50 last:border-0"
    >
      <p className="text-xs font-medium text-vault-text-bright truncate">{task.title}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {task.project && (
          <span className="text-[10px] text-vault-accent truncate max-w-[100px]">{task.project}</span>
        )}
        <span className="text-[10px] text-vault-text-muted ml-auto flex-shrink-0">{dateLabel}</span>
      </div>
    </button>
  );
}
