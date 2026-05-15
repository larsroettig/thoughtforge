import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, X, FolderOpen, Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { PROJECT_COLORS } from "@/types";
import type { ProjectSpace } from "@/types";

interface ProjectSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProjectSelect({ value, onChange }: ProjectSelectProps) {
  const { tasks, projectSpaces, addProjectSpace } = useAppStore();
  const { saveSpace } = useVault();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge project names from spaces + tasks
  const allProjects = useMemo(() => {
    const set = new Set<string>();
    for (const s of projectSpaces) {
      if (!s.archived) set.add(s.id);
    }
    for (const t of tasks) {
      if (t.project) set.add(t.project);
    }
    return [...set].sort();
  }, [projectSpaces, tasks]);

  // Get display name for a project ID
  const getDisplayName = useCallback(
    (id: string) => {
      const space = projectSpaces.find((s) => s.id === id);
      return space?.name || id;
    },
    [projectSpaces]
  );

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return allProjects;
    const q = search.toLowerCase();
    return allProjects.filter(
      (p) => p.toLowerCase().includes(q) || getDisplayName(p).toLowerCase().includes(q)
    );
  }, [allProjects, search, getDisplayName]);

  // Does the search text match an existing project?
  const searchMatchesExisting = useMemo(() => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const asId = q.replace(/\s+/g, "-");
    return allProjects.some(
      (p) => p.toLowerCase() === q || p.toLowerCase() === asId
    );
  }, [search, allProjects]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setShowCreateConfirm(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
    setShowCreateConfirm(false);
  };

  const handleCreateNew = async () => {
    const name = search.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-");

    // Create the space
    const newSpace: ProjectSpace = {
      id,
      name,
      description: "",
      color: "",
      created: new Date().toISOString().split("T")[0],
      archived: false,
      documents: [],
      timeEntries: [],
    };
    addProjectSpace(newSpace);
    await saveSpace(newSpace);
    handleSelect(id);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="input-base w-full flex items-center gap-2 cursor-pointer"
      >
        {value ? (
          <>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PROJECT_COLORS[value] || PROJECT_COLORS.default }}
            />
            <span className="flex-1 truncate">{getDisplayName(value)}</span>
          </>
        ) : (
          <>
            <FolderOpen className="w-3.5 h-3.5 text-vault-text-muted flex-shrink-0" />
            <span className="flex-1 text-vault-text-muted">Select project...</span>
          </>
        )}
        {value && (
          <button onClick={handleClear} className="p-0.5 hover:bg-vault-border rounded flex-shrink-0">
            <X className="w-3 h-3 text-vault-text-muted" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-vault-text-muted flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-vault-surface border border-vault-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-vault-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowCreateConfirm(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (filtered.length > 0 && !showCreateConfirm) {
                    handleSelect(filtered[0]);
                  } else if (showCreateConfirm) {
                    handleCreateNew();
                  }
                }
                if (e.key === "Escape") {
                  setOpen(false);
                  setSearch("");
                }
              }}
              placeholder="Search or type new project..."
              className="w-full bg-vault-bg border border-vault-border rounded px-2 py-1.5 text-xs text-vault-text placeholder:text-vault-text-muted focus:outline-none focus:border-vault-accent"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto py-1">
            {/* Unassign */}
            <button
              onClick={() => handleSelect("")}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-vault-text-muted hover:bg-vault-card"
            >
              <X className="w-3 h-3" />
              No project
            </button>

            {filtered.map((p) => {
              const color = PROJECT_COLORS[p] || PROJECT_COLORS.default;
              return (
                <button
                  key={p}
                  onClick={() => handleSelect(p)}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs ${
                    value === p
                      ? "bg-vault-accent/10 text-vault-accent"
                      : "text-vault-text hover:bg-vault-card"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate">{getDisplayName(p)}</span>
                  {value === p && <span className="ml-auto text-[10px] text-vault-accent">current</span>}
                </button>
              );
            })}

            {/* Create new option */}
            {search.trim() && !searchMatchesExisting && !showCreateConfirm && (
              <button
                onClick={() => setShowCreateConfirm(true)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-vault-accent hover:bg-vault-card border-t border-vault-border"
              >
                <Plus className="w-3 h-3" />
                Create project "{search.trim()}"
              </button>
            )}

            {/* Confirm creation */}
            {showCreateConfirm && (
              <div className="px-3 py-2 border-t border-vault-border bg-vault-accent/5">
                <p className="text-xs text-vault-text mb-2">
                  Create new project space <strong>"{search.trim()}"</strong>?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateNew}
                    className="btn-primary text-[10px] px-3 py-1"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreateConfirm(false)}
                    className="btn-ghost text-[10px] px-3 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
