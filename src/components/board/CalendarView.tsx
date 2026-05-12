import { useMemo, useState, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { formatHours } from "@/lib/time";
import type { Task, StatusColors } from "@/types";
import { PROJECT_COLORS, DEFAULT_STATUS_COLORS } from "@/types";
import { TaskModal } from "./TaskModal";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM - 8 PM
const HOUR_HEIGHT = 60; // px per hour

function getWeekDates(offset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface CalendarViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDrop: (taskId: string, columnId: string) => void;
}

export function CalendarView({ tasks, onTaskClick, onDrop }: CalendarViewProps) {
  const { config, projectSpaces } = useAppStore();
  const { saveTask } = useVault();
  const sc: StatusColors = { ...DEFAULT_STATUS_COLORS, ...(config.status_colors || {}) };
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ day: string; hour: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const today = fmt(new Date());

  // Tasks with due dates mapped to days
  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const d of days) {
      map[fmt(d)] = [];
    }
    for (const t of tasks) {
      if (t.due && map[t.due] && t.status !== "done") {
        map[t.due].push(t);
      }
    }
    return map;
  }, [tasks, days]);

  // Hours per day from spaces
  const hoursPerDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of days) {
      const ds = fmt(d);
      let h = 0;
      for (const space of projectSpaces) {
        for (const te of space.timeEntries || []) {
          if (te.date === ds) h += te.hours;
        }
      }
      // Also task tracked hours for tasks due that day
      for (const t of tasksByDay[ds] || []) {
        h += t.actual_hours;
      }
      map[ds] = h;
    }
    return map;
  }, [days, projectSpaces, tasksByDay]);

  // Handle dropping a task onto a day/hour slot
  const handleDrop = useCallback(
    async (e: React.DragEvent, dayStr: string, hour: number) => {
      e.preventDefault();
      setDragOverSlot(null);
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Update due date
      onDrop(taskId, dayStr);
    },
    [tasks, onDrop]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, dayStr: string, hour: number) => {
      e.preventDefault();
      setDragOverSlot({ day: dayStr, hour });
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  // Distribute tasks across time slots (simple stacking)
  const getTaskPosition = useCallback(
    (task: Task, dayTasks: Task[]): { top: number; height: number } => {
      const idx = dayTasks.indexOf(task);
      const estimatedH = task.estimated_hours || 1;
      // Stack tasks from 8 AM downward
      let startHour = 8;
      for (let i = 0; i < idx; i++) {
        startHour += dayTasks[i].estimated_hours || 1;
      }
      const top = (startHour - 7) * HOUR_HEIGHT;
      const height = Math.max(estimatedH * HOUR_HEIGHT, 40);
      return { top, height };
    },
    []
  );

  return (
    <div className="h-full flex flex-col">
      {/* Week Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="btn-ghost p-1.5">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className={`btn-ghost text-xs px-3 ${weekOffset === 0 ? "text-vault-accent" : ""}`}
          >
            This Week
          </button>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="btn-ghost p-1.5">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto" ref={gridRef}>
        <div className="flex min-w-max">
          {/* Time Labels Column */}
          <div className="w-16 flex-shrink-0">
            <div className="h-14" /> {/* Header spacer */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="flex items-start justify-end pr-2 text-[10px] text-vault-text-muted"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour <= 12 ? hour : hour - 12}:00{hour < 12 ? "AM" : "PM"}
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {days.map((day) => {
            const dayStr = fmt(day);
            const isToday = dayStr === today;
            const dayTasks = tasksByDay[dayStr] || [];
            const dayHours = hoursPerDay[dayStr] || 0;

            return (
              <div key={dayStr} className="flex-1 min-w-[160px] border-l border-vault-border">
                {/* Day Header */}
                <div
                  className={`h-14 px-2 py-1.5 border-b border-vault-border text-center ${
                    isToday ? "bg-vault-accent/5" : ""
                  }`}
                >
                  <p className={`text-xs font-semibold ${isToday ? "text-vault-accent" : "text-vault-text-bright"}`}>
                    {day.toLocaleDateString("en-US", { weekday: "short" })},{" "}
                    {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className={`text-[10px] ${dayHours > 0 ? "text-vault-accent font-medium" : "text-vault-text-muted"}`}>
                    {dayHours > 0 ? formatHours(dayHours) : "0h"}
                  </p>
                </div>

                {/* Hour Grid */}
                <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                  {/* Grid Lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className={`absolute w-full border-b border-vault-border ${
                        dragOverSlot?.day === dayStr && dragOverSlot?.hour === hour
                          ? "bg-vault-accent/10"
                          : ""
                      }`}
                      style={{ top: (hour - 7) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onDragOver={(e) => handleDragOver(e, dayStr, hour)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, dayStr, hour)}
                    />
                  ))}

                  {/* Task Blocks */}
                  {dayTasks.map((task) => {
                    const { top, height } = getTaskPosition(task, dayTasks);
                    const color = PROJECT_COLORS[task.project] || PROJECT_COLORS.default;
                    const statusColor = sc[task.status] || sc.todo;

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          (e.target as HTMLElement).style.opacity = "0.5";
                        }}
                        onDragEnd={(e) => {
                          (e.target as HTMLElement).style.opacity = "1";
                        }}
                        onClick={() => onTaskClick(task)}
                        className="absolute left-1 right-1 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing overflow-hidden hover:ring-1 hover:ring-vault-accent/50 transition-all group"
                        style={{
                          top,
                          height: Math.max(height, 36),
                          backgroundColor: `${color}20`,
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        <p className="text-[11px] font-medium text-vault-text-bright leading-tight truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className="text-[9px] font-medium"
                            style={{ color }}
                          >
                            {task.project}
                          </span>
                          {task.estimated_hours > 0 && (
                            <span className="text-[9px] text-vault-text-muted">
                              {formatHours(task.estimated_hours)}
                            </span>
                          )}
                          {task.actual_hours > 0 && (
                            <span className="text-[9px] text-vault-success">
                              {formatHours(task.actual_hours)}
                            </span>
                          )}
                        </div>
                        {height > 50 && task.owner && (
                          <p className="text-[9px] text-vault-text-muted mt-0.5 truncate">
                            {task.owner}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Today marker line */}
                  {isToday && (() => {
                    const now = new Date();
                    const currentHour = now.getHours() + now.getMinutes() / 60;
                    if (currentHour >= 7 && currentHour <= 21) {
                      const top = (currentHour - 7) * HOUR_HEIGHT;
                      return (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-vault-critical z-10 pointer-events-none"
                          style={{ top }}
                        >
                          <div className="w-2 h-2 rounded-full bg-vault-critical -mt-1 -ml-1" />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
