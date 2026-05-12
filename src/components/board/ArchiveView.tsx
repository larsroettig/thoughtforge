import { useMemo, useState, useCallback } from "react";
import { Archive, RotateCcw, Trash2, Search } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { Task } from "@/types";
import { PROJECT_COLORS } from "@/types";

export function ArchiveView() {
  const { tasks, updateTask } = useAppStore();
  const { saveTask, deleteTask } = useVault();
  const [search, setSearch] = useState("");

  const archived = useMemo(() => {
    let items = tasks.filter((t) => t.archived);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.project.toLowerCase().includes(q) ||
          t.owner.toLowerCase().includes(q)
      );
    }
    return items.sort(
      (a, b) => (b.created || "").localeCompare(a.created || "")
    );
  }, [tasks, search]);

  const handleRestore = useCallback(
    async (task: Task) => {
      const updated = { ...task, archived: false, status: "todo" as const };
      updateTask(task.id, { archived: false, status: "todo" });
      await saveTask(updated);
    },
    [updateTask, saveTask]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTask(id);
    },
    [deleteTask]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-vault-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Archive className="w-5 h-5 text-vault-text-muted" />
          <h2 className="text-xl font-bold text-vault-text-bright">Archive</h2>
          <span className="text-sm text-vault-text-muted">
            {archived.length} item{archived.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-vault-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived..."
            className="input-base pl-8 w-64 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {archived.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Archive className="w-12 h-12 mx-auto mb-3 text-vault-text-muted opacity-20" />
              <p className="text-sm text-vault-text-muted">
                {search ? "No matching archived tasks" : "No archived tasks yet"}
              </p>
              <p className="text-xs text-vault-text-muted mt-1">
                Right-click a task and choose "Archive" to move it here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {archived.map((task) => {
              const projectColor =
                PROJECT_COLORS[task.project] || PROJECT_COLORS.default;
              return (
                <div
                  key={task.id}
                  className="card-base flex items-center gap-4 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-vault-text-bright truncate">
                      {task.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
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
                        <span className="text-[10px] text-vault-text-muted">
                          {task.owner}
                        </span>
                      )}
                      {task.actual_hours > 0 && (
                        <span className="text-[10px] text-vault-success">
                          {task.actual_hours.toFixed(1)}h logged
                        </span>
                      )}
                      <span className="text-[10px] text-vault-text-muted">
                        {task.created}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestore(task)}
                    className="btn-ghost p-1.5 text-vault-accent"
                    title="Restore to board"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="btn-ghost p-1.5 text-vault-critical"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
