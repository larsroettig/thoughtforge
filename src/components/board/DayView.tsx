import { useMemo, useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, CalendarOff } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Task } from "@/types";
import { TaskCard } from "./TaskCard";

interface DayViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDrop: (taskId: string, columnId: string) => void;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  const weekday = target.toLocaleDateString("en-US", { weekday: "short" });
  const month = target.toLocaleDateString("en-US", { month: "short" });
  const day = target.getDate();
  return `${weekday}, ${month} ${day}`;
}

function getDayColor(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff < 0) return "#f85149";
  if (diff === 0) return "#d29922";
  if (diff === 1) return "#f0883e";
  if (diff <= 3) return "#58a6ff";
  return "#3fb950";
}

function DroppableDayColumn({
  col,
  children,
}: {
  col: { id: string; label: string; sublabel: string; color: string; isSpecial: boolean };
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 bg-vault-surface rounded-xl p-3 flex flex-col max-h-full transition-all ${
        col.isSpecial ? "w-56" : "w-48"
      } ${isOver ? "ring-1 ring-vault-accent/30" : ""}`}
    >
      {/* Column Header */}
      <div
        className="flex items-center justify-between mb-3 pb-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: col.color, borderBottom: `2px solid ${col.color}` }}
      >
        <div className="flex items-center gap-1.5">
          {col.id === "overdue" && <AlertCircle className="w-3.5 h-3.5" />}
          {col.id === "no-date" && <CalendarOff className="w-3.5 h-3.5" />}
          <span>{col.label}</span>
        </div>
      </div>

      {/* Sublabel */}
      {!col.isSpecial && (
        <div className="text-[10px] text-vault-text-muted mb-2 -mt-1">{col.sublabel}</div>
      )}

      {/* Cards */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">{children}</div>
    </div>
  );
}

export function DayView({ tasks, onTaskClick, onDrop }: DayViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const dayColumns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + weekOffset * 7);

    const columns: {
      id: string;
      label: string;
      sublabel: string;
      color: string;
      tasks: Task[];
      isSpecial: boolean;
    }[] = [];

    const overdueTasks = tasks.filter((t) => {
      if (!t.due || t.status === "done") return false;
      const dueDate = new Date(t.due);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    if (overdueTasks.length > 0 || weekOffset === 0) {
      columns.push({
        id: "overdue",
        label: "Overdue",
        sublabel: `${overdueTasks.length} items`,
        color: "#f85149",
        tasks: overdueTasks,
        isSpecial: true,
      });
    }

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = formatDate(date);

      const dayTasks = tasks.filter((t) => {
        if (t.status === "done") return false;
        return t.due === dateStr;
      });

      columns.push({
        id: dateStr,
        label: formatDayLabel(date),
        sublabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        color: getDayColor(date),
        tasks: dayTasks,
        isSpecial: false,
      });
    }

    const noDateTasks = tasks.filter((t) => !t.due && t.status !== "done");
    columns.push({
      id: "no-date",
      label: "No Date",
      sublabel: `${noDateTasks.length} items`,
      color: "#8b949e",
      tasks: noDateTasks,
      isSpecial: true,
    });

    return columns;
  }, [tasks, weekOffset]);

  const handleDndEnd = useCallback(
    (event: DragEndEvent) => {
      const taskId = String(event.active.id);
      const columnId = event.over ? String(event.over.id) : null;
      if (!columnId || columnId === "overdue") return;
      onDrop(taskId, columnId === "no-date" ? "" : columnId);
    },
    [onDrop]
  );

  const totalDue = tasks.filter((t) => t.due && t.status !== "done").length;
  const totalNoDue = tasks.filter((t) => !t.due && t.status !== "done").length;

  return (
    <div className="h-full flex flex-col">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
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
        <div className="text-xs text-vault-text-muted">
          {totalDue} scheduled / {totalNoDue} unscheduled
        </div>
      </div>

      {/* Day Columns */}
      <DndContext sensors={sensors} onDragEnd={handleDndEnd}>
        <div className="flex gap-3 h-full min-w-max overflow-x-auto">
          {dayColumns.map((col) => (
            <DroppableDayColumn key={col.id} col={col}>
              {col.tasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={onTaskClick} draggable />
              ))}
              {col.tasks.length === 0 && (
                <div className="text-center py-4 text-vault-text-muted text-[10px] opacity-50">
                  {col.id === "overdue"
                    ? "Nothing overdue"
                    : col.id === "no-date"
                    ? "All tasks have dates"
                    : "No tasks"}
                </div>
              )}
            </DroppableDayColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
