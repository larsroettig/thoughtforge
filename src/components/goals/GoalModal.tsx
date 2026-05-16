import { useState, useMemo } from "react";
import { X, Trash2 } from "lucide-react";
import type { SmartGoal } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";

interface GoalModalProps {
  goal: SmartGoal | null;
  onClose: () => void;
}

const EMPTY_GOAL: Omit<SmartGoal, "id" | "created"> = {
  title: "",
  metric: "",
  target: "",
  current: "",
  difficulty: "moderate",
  space: "",
  due: "",
  status: "active",
  linked_tasks: [],
  notes: "",
};

export function GoalModal({ goal, onClose }: GoalModalProps) {
  const isNew = !goal;
  const { tasks, projectSpaces } = useAppStore();
  const { saveGoal, deleteGoal } = useVault();

  const [form, setForm] = useState<SmartGoal>(
    goal ?? {
      ...EMPTY_GOAL,
      id: `goal_${crypto.randomUUID()}`,
      created: new Date().toISOString().split("T")[0],
      space: projectSpaces.find((s) => !s.archived)?.id ?? "",
    }
  );

  const update = <K extends keyof SmartGoal>(field: K, value: SmartGoal[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const spaceTasks = useMemo(
    () => tasks.filter((t) => !t.archived && t.project === form.space && t.status !== "done"),
    [tasks, form.space]
  );

  const toggleTask = (id: string) => {
    const linked = form.linked_tasks.includes(id)
      ? form.linked_tasks.filter((x) => x !== id)
      : [...form.linked_tasks, id];
    update("linked_tasks", linked);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    await saveGoal(form);
    onClose();
  };

  const handleDelete = async () => {
    if (goal) await deleteGoal(goal.id, goal.space);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-vault-surface border border-vault-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border flex-shrink-0">
          <h3 className="text-lg font-bold text-vault-text-bright">
            {isNew ? "New Goal" : "Edit Goal"}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
          {/* S — Specific */}
          <div>
            <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
              S — Specific title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="What exactly do you want to achieve?"
              className="input-base w-full"
              autoFocus
            />
          </div>

          {/* M — Measurable */}
          <div>
            <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
              M — Measurable
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-vault-text-muted mb-1">Metric</label>
                <input
                  type="text"
                  value={form.metric}
                  onChange={(e) => update("metric", e.target.value)}
                  placeholder="What to track"
                  className="input-base w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-vault-text-muted mb-1">Target</label>
                <input
                  type="text"
                  value={form.target}
                  onChange={(e) => update("target", e.target.value)}
                  placeholder="Success looks like…"
                  className="input-base w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-vault-text-muted mb-1">Current</label>
                <input
                  type="text"
                  value={form.current}
                  onChange={(e) => update("current", e.target.value)}
                  placeholder="Where we are now"
                  className="input-base w-full text-sm"
                />
              </div>
            </div>
          </div>

          {/* A & R — Achievable / Relevant */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
                A — Achievable
              </label>
              <select
                value={form.difficulty}
                onChange={(e) => update("difficulty", e.target.value as SmartGoal["difficulty"])}
                className="input-base w-full"
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
                R — Relevant space
              </label>
              <select
                value={form.space}
                onChange={(e) => { update("space", e.target.value); update("linked_tasks", []); }}
                className="input-base w-full"
              >
                <option value="">— select space —</option>
                {projectSpaces.filter((s) => !s.archived).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* T — Time-bound */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
                T — Due date
              </label>
              <input
                type="date"
                value={form.due}
                onChange={(e) => update("due", e.target.value)}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value as SmartGoal["status"])}
                className="input-base w-full"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
          </div>

          {/* Linked Tasks */}
          {form.space && (
            <div>
              <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
                Linked tasks
              </label>
              {spaceTasks.length === 0 ? (
                <p className="text-xs text-vault-text-muted">No active tasks in this space.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {spaceTasks.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-vault-card cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.linked_tasks.includes(t.id)}
                        onChange={() => toggleTask(t.id)}
                        className="rounded"
                      />
                      <span className="text-xs text-vault-text truncate">{t.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-1.5">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              placeholder="Context, obstacles, ideas…"
              className="input-base w-full resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-vault-border flex-shrink-0">
          <div>
            {!isNew && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-xs text-vault-critical hover:bg-vault-critical/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-sm px-4 py-1.5">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.title.trim()}
              className="btn-primary text-sm px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
