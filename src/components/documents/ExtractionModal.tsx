import { useState } from "react";
import { X, Check, Trash2, Sparkles } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { Task } from "@/types";
import { PROJECT_COLORS } from "@/types";

export function ExtractionModal() {
  const { extractionPreview, setExtractionPreview } = useAppStore();
  const { saveTask } = useVault();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(extractionPreview?.tasks.map((t) => t.id || "") || [])
  );

  if (!extractionPreview) return null;

  const toggleTask = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAccept = async () => {
    const tasksToAdd = extractionPreview.tasks.filter((t) =>
      selectedIds.has(t.id || "")
    );

    for (const partial of tasksToAdd) {
      const task: Task = {
        id: partial.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: partial.title || "Untitled task",
        status: partial.status || "todo",
        priority: partial.priority || "medium",
        urgency: partial.urgency || "ongoing",
        project: partial.project || "",
        owner: partial.owner || "",
        collaborators: partial.collaborators || [],
        source: partial.source || extractionPreview.source,
        source_quote: partial.source_quote || "",
        created: partial.created || new Date().toISOString().split("T")[0],
        due: partial.due || "",
        estimated_hours: partial.estimated_hours || 0,
        actual_hours: partial.actual_hours || 0,
        blocked_by: partial.blocked_by || [],
        subtasks: partial.subtasks || [],
        notes: partial.notes || "",
        archived: false,
  time_only: false,
      };

      await saveTask(task);
    }

    setExtractionPreview(null);
  };

  const handleDismiss = () => {
    setExtractionPreview(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-vault-surface border border-vault-border rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-vault-accent" />
            <div>
              <h3 className="text-lg font-bold text-vault-text-bright">
                Extracted Action Items
              </h3>
              <p className="text-xs text-vault-text-muted">
                From: {extractionPreview.source} -- Found{" "}
                {extractionPreview.tasks.length} items
              </p>
            </div>
          </div>
          <button onClick={handleDismiss} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {extractionPreview.tasks.map((task) => {
            const isSelected = selectedIds.has(task.id || "");
            const projectColor =
              PROJECT_COLORS[task.project || ""] || PROJECT_COLORS.default;

            return (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id || "")}
                className={`card-base flex items-start gap-3 cursor-pointer ${
                  isSelected ? "border-vault-accent/50" : "opacity-50"
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    isSelected
                      ? "bg-vault-accent border-vault-accent"
                      : "border-vault-border"
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-vault-bg" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-vault-text-bright">
                    {task.title}
                  </h4>
                  {task.source_quote && (
                    <p className="text-xs text-vault-text-muted italic mt-1 line-clamp-2">
                      "{task.source_quote}"
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {task.priority && (
                      <span
                        className={`tag ${
                          task.priority === "critical"
                            ? "bg-vault-critical/15 text-vault-critical border border-vault-critical/30"
                            : task.priority === "high"
                            ? "bg-vault-warning/15 text-vault-warning border border-vault-warning/30"
                            : "bg-vault-bg text-vault-text-muted border border-vault-border"
                        }`}
                      >
                        {task.priority}
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
                      <span className="tag bg-vault-accent/10 text-vault-accent-hover border border-vault-accent/20">
                        {task.owner}
                      </span>
                    )}
                    {task.urgency && (
                      <span className="tag bg-vault-bg text-vault-text-muted border border-vault-border">
                        {task.urgency}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-vault-border flex items-center justify-between">
          <p className="text-xs text-vault-text-muted">
            {selectedIds.size} of {extractionPreview.tasks.length} selected
          </p>
          <div className="flex gap-2">
            <button onClick={handleDismiss} className="btn-ghost text-xs">
              Dismiss All
            </button>
            <button
              onClick={handleAccept}
              disabled={selectedIds.size === 0}
              className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Add {selectedIds.size} to Board
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
