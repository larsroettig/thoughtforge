import { useCallback } from "react";
import type { Task } from "@/types";
import { TaskCard } from "./TaskCard";

interface BoardColumnProps {
  id: string;
  title: string;
  color: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDrop: (taskId: string, columnId: string) => void;
}

export function BoardColumn({
  id,
  title,
  color,
  tasks,
  onTaskClick,
  onDrop,
}: BoardColumnProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-1", "ring-vault-accent/30");
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-1", "ring-vault-accent/30");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.currentTarget.classList.remove("ring-1", "ring-vault-accent/30");
      const taskId = e.dataTransfer.getData("text/plain");
      if (taskId) {
        onDrop(taskId, id);
      }
    },
    [id, onDrop]
  );

  return (
    <div
      className="min-w-0 bg-vault-surface rounded-xl p-4 flex flex-col max-h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}

        {tasks.length === 0 && (
          <div className="text-center py-8 text-vault-text-muted text-xs">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
