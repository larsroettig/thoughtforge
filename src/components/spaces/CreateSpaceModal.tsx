import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { ProjectSpace } from "@/types";

interface Props {
  onClose: () => void;
}

const COLORS = [
  "#f0883e", "#56d364", "#bc8cff", "#e3b341", "#58a6ff",
  "#f85149", "#79c0ff", "#d29922", "#3fb950", "#db61a2",
];

export function CreateSpaceModal({ onClose }: Props) {
  const { addProjectSpace, setActiveSpaceId, setView } = useAppStore();
  const { saveSpace } = useVault();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const id = name.trim().toLowerCase().replace(/\s+/g, "-");
    const space: ProjectSpace = {
      id,
      name: name.trim(),
      description,
      color,
      created: new Date().toISOString().split("T")[0],
      archived: false,
      documents: [],
      timeEntries: [],
    };
    addProjectSpace(space);
    await saveSpace(space);
    setActiveSpaceId(id);
    setView("project-space");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-title"
        className="bg-vault-surface border border-vault-border rounded-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border">
          <h3 id="create-space-title" className="text-lg font-bold text-vault-text-bright">New Project Space</h3>
          <button onClick={onClose} aria-label="Close dialog" className="btn-ghost p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label htmlFor="space-name" className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Project Name
            </label>
            <input
              id="space-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Launch"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="space-description" className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Description
            </label>
            <textarea
              id="space-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this project..."
              className="input-base w-full h-20 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-2 block">
              Color
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Select color ${c}`}
                  aria-pressed={color === c}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    color === c ? "border-vault-text-bright scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-vault-border">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Create Space
          </button>
        </div>
      </div>
    </div>
  );
}
