import { useMemo, useState, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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

function getTaskPosition(task: Task, dayTasks: Task[]): { top: number; height: number } {
  const idx = dayTasks.indexOf(task);
  const estimatedH = task.estimated_hours || 1;
  let startHour = 8;
  for (let i = 0; i < idx; i++) {
    startHour += dayTasks[i].estimated_hours || 1;
  }
  return {
    top: (startHour - 7) * HOUR_HEIGHT,
    height: Math.max(estimatedH * HOUR_HEIGHT, 40),
  };
}

function DroppableHourSlot({ id, top }: { id: string; top: number }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`absolute w-full border-b border-vault-border ${isOver ? "bg-vault-accent/10" : ""}`}
      style={{ top, height: HOUR_HEIGHT }}
    />
  );
}

function DraggableTaskBlock({
  task,
  top,
  height,
  color,
  sc,
  onTaskClick,
}: {
  task: Task;
  top: number;
  height: number;
  color: string;
  sc: StatusColors;
  onTaskClick: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        top,
        height: Math.max(height, 36),
        backgroundColor: `${color}20`,
        borderLeft: `3px solid ${color}`,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onTaskClick(task)}
      className="absolute left-1 right-1 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing overflow-hidden hover:ring-1 hover:ring-vault-accent/50 transition-all group touch-none"
    >
      <p className="text-[11px] font-medium text-vault-text-bright leading-tight truncate">
        {task.title}
      </p>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[9px] font-medium" style={{ color }}>
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
        <p className="text-[9px] text-vault-text-muted mt-0.5 truncate">{task.owner}</p>
      )}
    </div>
  );
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
  const gridRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const days = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const today = fmt(new Date());

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
      for (const t of tasksByDay[ds] || []) {
        h += t.actual_hours;
      }
      map[ds] = h;
    }
    return map;
  }, [days, projectSpaces, tasksByDay]);

  const handleDndEnd = useCallback(
    (event: DragEndEvent) => {
      if (!event.over) return;
      const taskId = String(event.active.id);
      const [dayStr] = String(event.over.id).split("::");
      onDrop(taskId, dayStr);
    },
    [onDrop]
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
      <DndContext sensors={sensors} onDragEnd={handleDndEnd}>
        <div className="flex-1 overflow-auto" ref={gridRef}>
          <div className="flex min-w-max">
            {/* Time Labels Column */}
            <div className="w-16 flex-shrink-0">
              <div className="h-14" />
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
                    {HOURS.map((hour) => (
                      <DroppableHourSlot
                        key={hour}
                        id={`${dayStr}::${hour}`}
                        top={(hour - 7) * HOUR_HEIGHT}
                      />
                    ))}

                    {dayTasks.map((task) => {
                      const { top, height } = getTaskPosition(task, dayTasks);
                      const color = PROJECT_COLORS[task.project] || PROJECT_COLORS.default;
                      return (
                        <DraggableTaskBlock
                          key={task.id}
                          task={task}
                          top={top}
                          height={height}
                          color={color}
                          sc={sc}
                          onTaskClick={onTaskClick}
                        />
                      );
                    })}

                    {/* Today marker */}
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
      </DndContext>

      {editingTask && (
        <TaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}
