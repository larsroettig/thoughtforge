import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Gauge,
  MessageSquare,
  FileText,
  Settings,
  Archive,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Square,
  Timer,
  Plus,
} from "lucide-react";
import { CreateSpaceModal as CreateSpaceModalInline } from "@/components/spaces/CreateSpaceModal";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { AppView } from "@/types";
import { PROJECT_COLORS } from "@/types";

const NAV_ITEMS: { id: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "board", label: "Board", icon: LayoutDashboard },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const {
    currentView,
    setView,
    tasks,
    projectFilter,
    setProjectFilter,
    activeTimer,
    stopTimer,
    updateTask,
    projectSpaces,
    activeSpaceId,
    setActiveSpaceId,
  } = useAppStore();
  const { saveTask } = useVault();
  const [showCreateSpace, setShowCreateSpace] = useState(false);

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  // Timer tick
  useEffect(() => {
    if (!activeTimer) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - activeTimer.startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedCount = tasks.filter((t) => t.archived).length;

  const taskCounts = {
    total: activeTasks.length,
    critical: activeTasks.filter(
      (t) => t.priority === "critical" && t.status !== "done"
    ).length,
    inProgress: activeTasks.filter((t) => t.status === "in_progress").length,
    done: activeTasks.filter((t) => t.status === "done").length,
  };

  // Projects tree
  const projectTree = useMemo(() => {
    const map: Record<string, { count: number; doneCount: number }> = {};
    for (const t of activeTasks) {
      const p = t.project || "(no project)";
      if (!map[p]) map[p] = { count: 0, doneCount: 0 };
      map[p].count++;
      if (t.status === "done") map[p].doneCount++;
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [activeTasks]);

  const timerTask = activeTimer
    ? tasks.find((t) => t.id === activeTimer.taskId)
    : null;

  const formatElapsed = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const handleStopTimer = async () => {
    const result = stopTimer();
    if (result) {
      const t = useAppStore.getState().tasks.find((x) => x.id === result.taskId);
      if (t) await saveTask(t);
    }
  };

  return (
    <aside className="w-56 bg-vault-surface border-r border-vault-border flex flex-col h-full">
      {/* App Title */}
      <div className="px-4 pt-4 pb-3 border-b border-vault-border">
        <div className="flex items-center gap-2">
          <img src="/thoughtforge.png" alt="ThoughtForge" className="w-6 h-6 rounded" />
          <h1 className="text-base font-bold text-vault-text-bright">ThoughtForge</h1>
        </div>
      </div>

      {/* Active Timer */}
      {timerTask && (
        <div className="px-3 py-2 border-b border-vault-border bg-vault-success/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-vault-success animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-vault-success">
              Timer Running
            </span>
          </div>
          <p className="text-xs text-vault-text-bright truncate mb-1">
            {timerTask.title}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-vault-success font-bold">
              {formatElapsed(elapsed)}
            </span>
            <button
              onClick={handleStopTimer}
              className="flex items-center gap-1 text-[10px] text-vault-critical hover:bg-vault-critical/10 px-2 py-0.5 rounded"
            >
              <Square className="w-2.5 h-2.5" />
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                if (item.id === "board") setProjectFilter(null);
              }}
              className={`sidebar-btn ${currentView === item.id ? "active" : ""}`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === "archive" && archivedCount > 0 && (
                <span className="text-[10px] bg-vault-card rounded-full px-1.5 py-0.5 text-vault-text-muted">
                  {archivedCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Project Spaces */}
      <div className="flex-1 overflow-y-auto px-3 border-t border-vault-border">
        <div className="flex items-center gap-1.5 w-full py-2.5">
          <button
            onClick={() => setProjectsOpen(!projectsOpen)}
            className="flex items-center gap-1.5 flex-1 text-[10px] uppercase tracking-wider font-semibold text-vault-text-muted hover:text-vault-text"
          >
            {projectsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <FolderTree className="w-3 h-3" />
            Spaces
          </button>
          <button
            onClick={() => setShowCreateSpace(true)}
            className="p-0.5 hover:bg-vault-card rounded text-vault-text-muted hover:text-vault-accent"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {projectsOpen && (
          <div className="space-y-0.5 pb-2">
            {/* Project Spaces (clickable into full workspace) */}
            {projectSpaces.map((space) => {
              const isActive = currentView === "project-space" && activeSpaceId === space.id;
              const taskCount = activeTasks.filter((t) => t.project === space.id && t.status !== "done").length;
              return (
                <button
                  key={space.id}
                  onClick={() => {
                    setActiveSpaceId(space.id);
                    setView("project-space");
                  }}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
                    isActive
                      ? "bg-vault-card text-vault-text-bright"
                      : "text-vault-text-muted hover:bg-vault-card hover:text-vault-text"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: space.color }} />
                  <span className="flex-1 text-left truncate">{space.name}</span>
                  {taskCount > 0 && <span className="text-[10px] text-vault-text-muted">{taskCount}</span>}
                  <span className="text-[10px] text-vault-text-muted">{space.notes.length}n</span>
                </button>
              );
            })}

            {/* Task-derived projects (no space yet) */}
            {projectTree
              .filter(([name]) => !projectSpaces.some((s) => s.id === name))
              .map(([name, info]) => {
                const color = PROJECT_COLORS[name] || PROJECT_COLORS.default;
                const isActive = projectFilter === name && currentView === "board";
                return (
                  <button
                    key={name}
                    onClick={() => { setView("board"); setProjectFilter(isActive ? null : name); }}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
                      isActive ? "bg-vault-card text-vault-text-bright" : "text-vault-text-muted hover:bg-vault-card hover:text-vault-text"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0 opacity-50" style={{ backgroundColor: color }} />
                    <span className="flex-1 text-left truncate opacity-70">{name}</span>
                    <span className="text-[10px] text-vault-text-muted">{info.count - info.doneCount}</span>
                  </button>
                );
              })}

            {projectSpaces.length === 0 && projectTree.length === 0 && (
              <p className="text-[10px] text-vault-text-muted px-2 py-2">No projects yet</p>
            )}
          </div>
        )}
      </div>

      {showCreateSpace && (
        <CreateSpaceModalInline onClose={() => setShowCreateSpace(false)} />
      )}

      {/* Quick Stats */}
      <div className="px-4 py-2.5 border-t border-vault-border text-[10px] text-vault-text-muted space-y-0.5">
        <div className="flex justify-between">
          <span>Active</span>
          <span className="text-vault-text">{taskCounts.total - taskCounts.done}</span>
        </div>
        {taskCounts.critical > 0 && (
          <div className="flex justify-between">
            <span>Critical</span>
            <span className="text-vault-critical">{taskCounts.critical}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>In Progress</span>
          <span className="text-vault-warning">{taskCounts.inProgress}</span>
        </div>
        <div className="flex justify-between">
          <span>Done</span>
          <span className="text-vault-success">{taskCounts.done}</span>
        </div>
      </div>
    </aside>
  );
}
