import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, X, User } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

interface OwnerSelectProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function OwnerSelect({ value, onChange, compact = false }: OwnerSelectProps) {
  const { tasks } = useAppStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Extract unique individual owner names from all tasks
  const allOwners = useMemo(() => {
    const nameSet = new Set<string>();
    for (const t of tasks) {
      if (!t.owner) continue;
      // Add the full owner string
      nameSet.add(t.owner);
      // Also extract individual names from compound owners
      const parts = t.owner.split(/[\/+,]/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        nameSet.add(part);
      }
    }
    return [...nameSet].sort();
  }, [tasks]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return allOwners;
    const q = search.toLowerCase();
    return allOwners.filter((o) => o.toLowerCase().includes(q));
  }, [allOwners, search]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setOpen(false);
    setSearch("");
  };

  if (compact) {
    // Compact version for context menu
    return (
      <div ref={ref} className="relative">
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {allOwners.slice(0, 12).map((name) => (
            <button
              key={name}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(name);
              }}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs ${
                value === name
                  ? "bg-vault-accent/10 text-vault-accent"
                  : "text-vault-text hover:bg-vault-card"
              }`}
            >
              <User className="w-3 h-3" />
              {name}
              {value === name && (
                <span className="ml-auto text-[10px] text-vault-accent">assigned</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className="input-base w-full flex items-center gap-2 cursor-pointer"
      >
        <User className="w-3.5 h-3.5 text-vault-text-muted flex-shrink-0" />
        {value ? (
          <span className="flex-1 truncate">{value}</span>
        ) : (
          <span className="flex-1 text-vault-text-muted">Select or type owner...</span>
        )}
        {value && (
          <button
            onClick={handleClear}
            className="p-0.5 hover:bg-vault-border rounded flex-shrink-0"
          >
            <X className="w-3 h-3 text-vault-text-muted" />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-vault-text-muted flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-vault-surface border border-vault-border rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-vault-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (search.trim()) {
                    handleSelect(search.trim());
                  } else if (filtered.length > 0) {
                    handleSelect(filtered[0]);
                  }
                }
                if (e.key === "Escape") {
                  setOpen(false);
                  setSearch("");
                }
              }}
              placeholder="Search or type new name..."
              className="w-full bg-vault-bg border border-vault-border rounded px-2 py-1.5 text-xs text-vault-text placeholder:text-vault-text-muted focus:outline-none focus:border-vault-accent"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto py-1">
            {/* Unassign option */}
            <button
              onClick={() => handleSelect("")}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-vault-text-muted hover:bg-vault-card"
            >
              <X className="w-3 h-3" />
              Unassigned
            </button>

            {filtered.map((name) => (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs ${
                  value === name
                    ? "bg-vault-accent/10 text-vault-accent"
                    : "text-vault-text hover:bg-vault-card"
                }`}
              >
                <User className="w-3 h-3" />
                <span className="truncate">{name}</span>
              </button>
            ))}

            {/* Create new option if search doesn't match */}
            {search.trim() && !filtered.some((o) => o.toLowerCase() === search.toLowerCase()) && (
              <button
                onClick={() => handleSelect(search.trim())}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-vault-accent hover:bg-vault-card border-t border-vault-border"
              >
                <span className="text-vault-accent">+</span>
                Assign to "{search.trim()}"
              </button>
            )}

            {filtered.length === 0 && !search.trim() && (
              <div className="px-3 py-4 text-xs text-vault-text-muted text-center">
                No owners found. Type a name to create.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
