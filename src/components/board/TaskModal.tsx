import { useState, useEffect, useMemo } from "react";
import { X, Trash2, Save, Sparkles } from "lucide-react";
import type { Task, TaskStatus, TaskPriority, TaskUrgency } from "@/types";
import { useVault } from "@/hooks/useVault";
import { useAppStore } from "@/stores/appStore";
import { OwnerSelect } from "./OwnerSelect";
import { ProjectSelect } from "./ProjectSelect";

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
}

const EMPTY_TASK: Task = {
  id: "",
  title: "",
  status: "todo",
  priority: "medium",
  urgency: "ongoing",
  project: "",
  owner: "",
  collaborators: [],
  source: "",
  source_quote: "",
  created: new Date().toISOString().split("T")[0],
  due: "",
  estimated_hours: 0,
  actual_hours: 0,
  blocked_by: [],
  subtasks: [],
  notes: "",
  archived: false,
  time_only: false,
};

export function TaskModal({ task, onClose }: TaskModalProps) {
  const isNew = !task;
  const [form, setForm] = useState<Task>(
    task || {
      ...EMPTY_TASK,
      id: `task_${crypto.randomUUID()}`,
    }
  );

  const { saveTask, deleteTask } = useVault();

  const update = (field: keyof Task, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    await saveTask(form);
    onClose();
  };

  const handleDelete = async () => {
    if (task) {
      await deleteTask(task.id);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-vault-surface border border-vault-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <h3 className="text-lg font-bold text-vault-text-bright">
            {isNew ? "New Task" : "Edit Task"}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Task title..."
              className="input-base w-full"
              autoFocus
            />
          </div>

          {/* Row: Status, Priority, Urgency */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="input-base w-full"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => update("priority", e.target.value)}
                className="input-base w-full"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Urgency
              </label>
              <select
                value={form.urgency}
                onChange={(e) => update("urgency", e.target.value)}
                className="input-base w-full"
              >
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="next_2weeks">Next 2 Weeks</option>
                <option value="ongoing">Ongoing</option>
              </select>
            </div>
          </div>

          {/* Row: Project, Owner, Due */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Project
              </label>
              <ProjectSelect
                value={form.project}
                onChange={(val) => update("project", val)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Owner
              </label>
              <OwnerSelect
                value={form.owner}
                onChange={(val) => update("owner", val)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Due Date
              </label>
              <input
                type="date"
                value={form.due}
                onChange={(e) => update("due", e.target.value)}
                className="input-base w-full"
              />
            </div>
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Estimated Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.estimated_hours}
                onChange={(e) => update("estimated_hours", parseFloat(e.target.value) || 0)}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Actual Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.actual_hours}
                onChange={(e) => update("actual_hours", parseFloat(e.target.value) || 0)}
                className="input-base w-full"
              />
            </div>
          </div>

          {/* Time-only toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.time_only || false}
              onChange={(e) => update("time_only", e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <div>
              <p className="text-sm text-vault-text">Time booking only</p>
              <p className="text-xs text-vault-text-muted">
                Hide from board -- this task is only for logging hours
              </p>
            </div>
          </label>

          {/* Source */}
          {form.source && (
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Source
              </label>
              <p className="text-sm text-vault-text-muted">{form.source}</p>
              {form.source_quote && (
                <p className="text-xs text-vault-text-muted italic mt-1">
                  "{form.source_quote}"
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Additional notes..."
              className="input-base w-full h-24 resize-y"
            />
          </div>

          {/* Subtasks */}
          <div>
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Subtasks
            </label>
            <div className="space-y-1.5">
              {form.subtasks.map((st, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={st}
                    onChange={(e) => {
                      const next = [...form.subtasks];
                      next[i] = e.target.value;
                      update("subtasks", next);
                    }}
                    className="input-base flex-1"
                  />
                  <button
                    onClick={() => {
                      update(
                        "subtasks",
                        form.subtasks.filter((_, j) => j !== i)
                      );
                    }}
                    className="btn-ghost p-1 text-vault-critical"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update("subtasks", [...form.subtasks, ""])}
                className="btn-ghost text-xs"
              >
                + Add subtask
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-vault-border">
          <div>
            {!isNew && (
              <button
                onClick={handleDelete}
                className="btn-ghost text-vault-critical flex items-center gap-1.5 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-xs">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.title.trim()}
              className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isNew ? "Create" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
