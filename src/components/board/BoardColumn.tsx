import { useDroppable } from "@dnd-kit/core";
import type { Task } from "@/types";
import { TaskCard } from "./TaskCard";

interface BoardColumnProps {
  id: string;
  title: string;
  color: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function BoardColumn({ id, title, color, tasks, onTaskClick }: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-0 bg-vault-surface rounded-xl p-4 flex flex-col max-h-full transition-all ${
        isOver ? "ring-1 ring-vault-accent/30" : ""
      }`}
    >
      {/* Column Header */}
      <div
        className="flex items-center gap-2 mb-4 pb-3 font-semibold text-sm uppercase tracking-wide"
        style={{ color, borderBottom: `2px solid ${color}` }}
      >
        <span>{title}</span>
        <span className="bg-vault-card rounded-full px-2 py-0.5 text-xs text-vault-text-muted font-normal">
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto space-y-2.5 min-h-0">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={onTaskClick} draggable />
        ))}

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-vault-text-muted/40">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span className="text-xs">No tasks</span>
          </div>
        )}
      </div>
    </div>
  );
}
