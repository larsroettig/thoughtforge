import { useState, useCallback, useEffect, useRef } from "react";
import {
  X,
  Upload,
  FileText,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useVault } from "@/hooks/useVault";
import { useAppStore } from "@/stores/appStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Task, TaskPriority, TaskUrgency } from "@/types";
import { PROJECT_COLORS } from "@/types";

interface ImportModalProps {
  onClose: () => void;
}

interface ParsedImportTask {
  title: string;
  context: string;
  project: string;
  owner: string;
  priority: TaskPriority;
  urgency: TaskUrgency;
  source: string;
  selected: boolean;
}

function parseJsonImport(json: string): ParsedImportTask[] {
  try {
    const data = JSON.parse(json);
    const items = Array.isArray(data) ? data : data.tasks || [];

    return items.map((item: Record<string, unknown>) => ({
      title: String(item.title || item.name || "Untitled"),
      context: String(item.context || item.description || item.notes || ""),
      project: String(item.project || item.tag || ""),
      owner: String(item.owner || item.assignee || ""),
      priority: (item.priority as TaskPriority) || "medium",
      urgency: (item.urgency as TaskUrgency) || "ongoing",
      source: String(item.source || "JSON import"),
      selected: true,
    }));
  } catch {
    return [];
  }
}

function parseMarkdownImport(md: string): ParsedImportTask[] {
  const tasks: ParsedImportTask[] = [];
  const lines = md.split("\n");

  // Look for markdown task items: - [ ] Task text or - Task text or * Task text
  for (const line of lines) {
    const trimmed = line.trim();

    // Checkbox style: - [ ] or - [x]
    const checkMatch = trimmed.match(/^[-*]\s*\[[ x]\]\s+(.+)$/i);
    if (checkMatch) {
      tasks.push({
        title: checkMatch[1].trim(),
        context: "",
        project: "",
        owner: "",
        priority: "medium",
        urgency: "ongoing",
        source: "Markdown import",
        selected: true,
      });
      continue;
    }

    // Plain list item with enough substance (>10 chars, no header)
    const listMatch = trimmed.match(/^[-*]\s+(.{10,})$/);
    if (listMatch && !trimmed.startsWith("##")) {
      tasks.push({
        title: listMatch[1].trim(),
        context: "",
        project: "",
        owner: "",
        priority: "medium",
        urgency: "ongoing",
        source: "Markdown import",
        selected: true,
      });
    }
  }

  return tasks;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [importedTasks, setImportedTasks] = useState<ParsedImportTask[]>([]);
  const [importSource, setImportSource] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [importDone, setImportDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { saveTask, loadTasks } = useVault();
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError("");

    try {
      const content = await file.text();
      const filename = file.name;
      setImportSource(filename);

      let parsed: ParsedImportTask[] = [];

      if (filename.endsWith(".json")) {
        parsed = parseJsonImport(content);
      } else if (filename.endsWith(".md") || filename.endsWith(".txt")) {
        parsed = parseMarkdownImport(content);
      }

      if (parsed.length === 0) {
        setError("No tasks found in this file. Supported formats: JSON task arrays, Markdown checklists.");
      }

      setImportedTasks(parsed);
    } catch (err) {
      setError(`Failed to read file: ${err}`);
    } finally {
      setIsLoading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const toggleTask = useCallback((index: number) => {
    setImportedTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  }, []);

  const toggleAll = useCallback(() => {
    const allSelected = importedTasks.every((t) => t.selected);
    setImportedTasks((prev) =>
      prev.map((t) => ({ ...t, selected: !allSelected }))
    );
  }, [importedTasks]);

  const handleImport = useCallback(async () => {
    const toImport = importedTasks.filter((t) => t.selected);
    setIsLoading(true);

    try {
      for (const item of toImport) {
        const task: Task = {
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: item.title,
          status: "todo",
          priority: item.priority,
          urgency: item.urgency,
          project: item.project,
          owner: item.owner,
          collaborators: [],
          source: item.source || importSource,
          source_quote: item.context,
          created: new Date().toISOString().split("T")[0],
          due: "",
          estimated_hours: 0,
          actual_hours: 0,
          blocked_by: [],
          subtasks: [],
          notes: item.context,
          archived: false,
  time_only: false,
        };

        await saveTask(task);

        // Small delay so IDs don't collide
        await new Promise((r) => setTimeout(r, 10));
      }

      // Reload tasks from vault to get fresh state
      await loadTasks();
      setImportDone(true);
    } catch (err) {
      setError(`Import failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [importedTasks, importSource, saveTask, loadTasks]);

  const selectedCount = importedTasks.filter((t) => t.selected).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="bg-vault-surface border border-vault-border rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between">
          <div>
            <h3 id="import-modal-title" className="text-lg font-bold text-vault-text-bright">
              Import Tasks
            </h3>
            <p className="text-xs text-vault-text-muted mt-0.5">
              Import from JSON files or Markdown checklists
            </p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Import Done State */}
          {importDone && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-vault-success/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-vault-success" />
              </div>
              <h4 className="text-lg font-semibold text-vault-text-bright mb-2">
                Import Complete
              </h4>
              <p className="text-sm text-vault-text-muted">
                {selectedCount} tasks imported from {importSource}
              </p>
              <button onClick={onClose} className="btn-primary mt-6">
                Close
              </button>
            </div>
          )}

          {/* File Selection */}
          {!importDone && importedTasks.length === 0 && (
            <div className="text-center py-12">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.md,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={handleFileSelect}
                disabled={isLoading}
                className="card-base inline-flex flex-col items-center gap-3 px-12 py-8 hover:border-vault-accent cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-10 h-10 text-vault-accent animate-spin" />
                ) : (
                  <Upload className="w-10 h-10 text-vault-text-muted" />
                )}
                <div>
                  <p className="text-sm font-medium text-vault-text-bright">
                    Choose a file to import
                  </p>
                  <p className="text-xs text-vault-text-muted mt-1">
                    .json .md .txt
                  </p>
                </div>
              </button>

              {error && (
                <div className="mt-4 flex items-center gap-2 justify-center text-sm text-vault-critical">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="mt-8 text-left max-w-md mx-auto">
                <h4 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wide mb-3">
                  Supported Formats
                </h4>
                <div className="space-y-2">
                  <div className="card-base p-3">
                    <p className="text-xs font-medium text-vault-text-bright">
                      JSON Task Array
                    </p>
                    <p className="text-[10px] text-vault-text-muted mt-0.5">
                      Array of objects with title, project, owner, priority fields. Or {"{"} tasks: [...] {"}"}.
                    </p>
                  </div>
                  <div className="card-base p-3">
                    <p className="text-xs font-medium text-vault-text-bright">
                      Markdown Checklist
                    </p>
                    <p className="text-[10px] text-vault-text-muted mt-0.5">
                      Lines starting with - [ ], - [x], or - are imported as tasks.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview & Selection */}
          {!importDone && importedTasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-vault-text-bright">
                    Found {importedTasks.length} tasks in{" "}
                    <span className="text-vault-accent">{importSource}</span>
                  </p>
                  <p className="text-xs text-vault-text-muted mt-0.5">
                    Deselect any tasks you don't want to import
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={toggleAll} className="btn-ghost text-xs">
                    {importedTasks.every((t) => t.selected)
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                  <button
                    onClick={handleFileSelect}
                    className="btn-ghost text-xs"
                  >
                    Choose Different File
                  </button>
                </div>
              </div>

              {error && (
                <div className="mb-4 flex items-center gap-2 text-sm text-vault-critical">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {importedTasks.map((task, i) => {
                  const projectColor =
                    PROJECT_COLORS[task.project] || PROJECT_COLORS.default;

                  return (
                    <div
                      key={i}
                      onClick={() => toggleTask(i)}
                      className={`card-base flex items-start gap-3 cursor-pointer ${
                        task.selected
                          ? "border-vault-accent/40"
                          : "opacity-40"
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                          task.selected
                            ? "bg-vault-accent border-vault-accent"
                            : "border-vault-border"
                        }`}
                      >
                        {task.selected && (
                          <Check className="w-2.5 h-2.5 text-vault-bg" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-vault-text-bright leading-snug">
                          {task.title}
                        </h4>
                        {task.context && (
                          <p className="text-[10px] text-vault-text-muted mt-0.5 line-clamp-1">
                            {task.context}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {task.priority === "critical" && (
                            <span className="tag text-[10px] bg-vault-critical/15 text-vault-critical border border-vault-critical/30">
                              critical
                            </span>
                          )}
                          {task.project && (
                            <span
                              className="tag text-[10px] border"
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
                            <span className="tag text-[10px] bg-vault-accent/10 text-vault-accent-hover border border-vault-accent/20">
                              {task.owner}
                            </span>
                          )}
                          <span className="tag text-[10px] bg-vault-bg text-vault-text-muted border border-vault-border">
                            {task.urgency}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!importDone && importedTasks.length > 0 && (
          <div className="px-6 py-4 border-t border-vault-border flex items-center justify-between">
            <p className="text-xs text-vault-text-muted">
              {selectedCount} of {importedTasks.length} selected
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost text-xs">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0 || isLoading}
                className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                Import {selectedCount} Tasks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
