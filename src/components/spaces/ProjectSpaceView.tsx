import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ArrowLeft,
  LayoutGrid,
  FileText,
  StickyNote,
  Users,
  ListChecks,
  Sparkles,
  Plus,
  Upload,
  Calendar,
  Clock,
  Folder,
  Save,
  X,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Timer,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import type { ProjectSpaceTab, SpaceNote, Task, StatusColors } from "@/types";
import { PROJECT_COLORS, DEFAULT_STATUS_COLORS } from "@/types";
import { TaskCard } from "@/components/board/TaskCard";
import { TaskModal } from "@/components/board/TaskModal";

const TABS: { id: ProjectSpaceTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutGrid },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "meetings", label: "Meetings", icon: Users },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "knowledge", label: "AI Context", icon: Sparkles },
];

export function ProjectSpaceView() {
  const {
    projectSpaces,
    activeSpaceId,
    setActiveSpaceId,
    setView,
    tasks,
    updateSpaceNote,
    config,
  } = useAppStore();
  const { saveSpace: persistSpace } = useVault();

  const [activeTab, setActiveTab] = useState<ProjectSpaceTab>("overview");
  const [editingNote, setEditingNote] = useState<SpaceNote | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newNoteType, setNewNoteType] = useState<"daily" | "meeting" | "note">("daily");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const space = projectSpaces.find((s) => s.id === activeSpaceId);
  const sc: StatusColors = { ...DEFAULT_STATUS_COLORS, ...(config.status_colors || {}) };

  // Project tasks
  const projectTasks = useMemo(() => {
    if (!space) return [];
    return tasks.filter((t) => !t.archived && t.project === space.id);
  }, [tasks, space]);

  const openTasks = projectTasks.filter((t) => t.status !== "done");
  const doneTasks = projectTasks.filter((t) => t.status === "done");
  const totalHours = projectTasks.reduce((s, t) => s + t.actual_hours, 0);
  const overdueTasks = openTasks.filter((t) => t.due && t.due < new Date().toISOString().split("T")[0]);
  const inProgressTasks = openTasks.filter((t) => t.status === "in_progress");
  const blockedTasks = openTasks.filter((t) => t.status === "blocked");
  const todoTasks = openTasks.filter((t) => t.status === "todo");

  // Notes sorted by date
  const dailyNotes = useMemo(
    () => (space?.notes || []).filter((n) => n.type === "daily").sort((a, b) => b.date.localeCompare(a.date)),
    [space]
  );
  const meetingNotes = useMemo(
    () => (space?.notes || []).filter((n) => n.type === "meeting").sort((a, b) => b.date.localeCompare(a.date)),
    [space]
  );
  const allNotes = useMemo(
    () => (space?.notes || []).sort((a, b) => b.date.localeCompare(a.date)),
    [space]
  );

  // ── Auto-save (3 second debounce) ──────────────────────────────────
  const persistCurrentSpace = useCallback(async () => {
    const updated = useAppStore.getState().projectSpaces.find((s) => s.id === activeSpaceId);
    if (updated) {
      setSaveStatus("saving");
      await persistSpace(updated);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }
  }, [activeSpaceId, persistSpace]);

  const handleNoteChange = useCallback(
    (updatedNote: SpaceNote) => {
      if (!space) return;
      setEditingNote(updatedNote);
      updateSpaceNote(space.id, updatedNote);

      // Debounced auto-save
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        persistCurrentSpace();
      }, 3000);
    },
    [space, updateSpaceNote, persistCurrentSpace]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // Save on tab switch or leaving the space
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        persistCurrentSpace();
      }
    };
  }, [activeTab, persistCurrentSpace]);

  const handleCreateNote = useCallback(async (type: "daily" | "meeting" | "note") => {
    if (!space) return;
    const today = new Date().toISOString().split("T")[0];
    const id = `note_${Date.now()}`;

    let title = "";
    if (type === "daily") title = `Daily Note - ${today}`;
    else if (type === "meeting") title = `Meeting Notes - ${today}`;
    else title = "New Note";

    const note: SpaceNote = { id, title, type, date: today, content: "", tags: [] };
    updateSpaceNote(space.id, note);
    setEditingNote(note);

    setTimeout(async () => {
      const updated = useAppStore.getState().projectSpaces.find((s) => s.id === space.id);
      if (updated) await persistSpace(updated);
    }, 50);
  }, [space, updateSpaceNote, persistSpace]);

  const handleUploadDoc = useCallback(async () => {
    if (!space) return;
    const files = await open({
      multiple: true,
      filters: [{ name: "Documents", extensions: ["pdf", "txt", "md", "docx", "csv", "json"] }],
    });
    if (files) {
      console.log("Upload docs to space:", files);
    }
  }, [space]);

  const handleBack = () => {
    // Flush any pending auto-save
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      persistCurrentSpace();
    }
    setActiveSpaceId(null);
    setView("dashboard");
  };

  if (!space) {
    return (
      <div className="h-full flex items-center justify-center text-vault-text-muted">
        <p>No project space selected</p>
      </div>
    );
  }

  const color = PROJECT_COLORS[space.id] || space.color || PROJECT_COLORS.default;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-3 border-b border-vault-border">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={handleBack} className="btn-ghost p-1.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <h2 className="text-lg font-bold text-vault-text-bright">{space.name}</h2>
          <span className="text-xs text-vault-text-muted">
            {openTasks.length} open / {totalHours.toFixed(1)}h tracked
          </span>
          {/* Auto-save indicator */}
          {saveStatus === "saving" && (
            <span className="text-[10px] text-vault-text-muted ml-auto flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 animate-spin" /> Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[10px] text-vault-success ml-auto flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> Saved
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive ? "bg-vault-card text-vault-accent" : "text-vault-text-muted hover:text-vault-text hover:bg-vault-card"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "notes" && allNotes.length > 0 && (
                  <span className="text-[9px] bg-vault-border rounded-full px-1">{allNotes.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">

        {/* ── DASHBOARD / OVERVIEW ── */}
        {activeTab === "overview" && (
          <div className="max-w-5xl space-y-6">
            {/* Status Cards Row */}
            <div className="grid grid-cols-5 gap-3">
              <div className="card-base p-3 text-center" style={{ borderLeftWidth: 3, borderLeftColor: sc.todo }}>
                <p className="text-2xl font-bold text-vault-text-bright">{todoTasks.length}</p>
                <p className="text-[10px] text-vault-text-muted">To Do</p>
              </div>
              <div className="card-base p-3 text-center" style={{ borderLeftWidth: 3, borderLeftColor: sc.in_progress }}>
                <p className="text-2xl font-bold" style={{ color: sc.in_progress }}>{inProgressTasks.length}</p>
                <p className="text-[10px] text-vault-text-muted">In Progress</p>
              </div>
              <div className="card-base p-3 text-center" style={{ borderLeftWidth: 3, borderLeftColor: sc.done }}>
                <p className="text-2xl font-bold" style={{ color: sc.done }}>{doneTasks.length}</p>
                <p className="text-[10px] text-vault-text-muted">Done</p>
              </div>
              <div className="card-base p-3 text-center" style={{ borderLeftWidth: 3, borderLeftColor: sc.blocked }}>
                <p className="text-2xl font-bold" style={{ color: sc.blocked }}>{blockedTasks.length}</p>
                <p className="text-[10px] text-vault-text-muted">Blocked</p>
              </div>
              <div className="card-base p-3 text-center">
                <p className="text-2xl font-bold text-vault-text-bright">{totalHours.toFixed(1)}h</p>
                <p className="text-[10px] text-vault-text-muted">Tracked</p>
              </div>
            </div>

            {/* Overdue alert */}
            {overdueTasks.length > 0 && (
              <div className="card-base p-3 flex items-center gap-3" style={{ borderLeftWidth: 3, borderLeftColor: sc.blocked }}>
                <AlertTriangle className="w-4 h-4" style={{ color: sc.blocked }} />
                <div className="flex-1">
                  <p className="text-xs font-medium text-vault-text-bright">{overdueTasks.length} overdue task{overdueTasks.length !== 1 ? "s" : ""}</p>
                  <p className="text-[10px] text-vault-text-muted">{overdueTasks.map((t) => t.title).join(", ")}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              {/* Recent Notes */}
              <div className="col-span-2">
                <h3 className="text-sm font-semibold text-vault-text-bright mb-3">Recent Notes</h3>
                <div className="space-y-2">
                  {allNotes.slice(0, 5).map((note) => (
                    <div
                      key={note.id}
                      onClick={() => { setEditingNote(note); setActiveTab("notes"); }}
                      className="card-base p-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {note.type === "daily" && <Calendar className="w-3.5 h-3.5 text-vault-accent" />}
                        {note.type === "meeting" && <Users className="w-3.5 h-3.5 text-vault-warning" />}
                        {note.type === "note" && <StickyNote className="w-3.5 h-3.5 text-vault-success" />}
                        <span className="text-xs font-medium text-vault-text-bright">{note.title}</span>
                        <span className="text-[10px] text-vault-text-muted ml-auto">{note.date}</span>
                      </div>
                      {note.content && (
                        <p className="text-[10px] text-vault-text-muted mt-1 line-clamp-2">{note.content}</p>
                      )}
                    </div>
                  ))}
                  {allNotes.length === 0 && (
                    <p className="text-xs text-vault-text-muted py-4">No notes yet. Create a daily note to get started.</p>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold text-vault-text-bright mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => { handleCreateNote("daily"); setActiveTab("notes"); }}
                    className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                  >
                    <Calendar className="w-4 h-4 text-vault-accent mb-1" />
                    <span className="font-medium text-vault-text-bright block">Daily Note</span>
                    <span className="text-vault-text-muted">Log today's progress</span>
                  </button>
                  <button
                    onClick={() => { handleCreateNote("meeting"); setActiveTab("meetings"); }}
                    className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                  >
                    <Users className="w-4 h-4 text-vault-warning mb-1" />
                    <span className="font-medium text-vault-text-bright block">Meeting Notes</span>
                    <span className="text-vault-text-muted">Capture meeting takeaways</span>
                  </button>
                  <button
                    onClick={() => { handleCreateNote("note"); setActiveTab("notes"); }}
                    className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                  >
                    <StickyNote className="w-4 h-4 text-vault-success mb-1" />
                    <span className="font-medium text-vault-text-bright block">Fleeting Note</span>
                    <span className="text-vault-text-muted">Quick thought or idea</span>
                  </button>
                  <button
                    onClick={handleUploadDoc}
                    className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                  >
                    <Upload className="w-4 h-4 text-vault-purple mb-1" />
                    <span className="font-medium text-vault-text-bright block">Upload Document</span>
                    <span className="text-vault-text-muted">Add files to this project</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Open tasks preview */}
            {openTasks.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-vault-text-bright mb-3">
                  Open Tasks ({openTasks.length})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {openTasks.slice(0, 6).map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => setEditingTask(task)} />
                  ))}
                </div>
                {openTasks.length > 6 && (
                  <button onClick={() => setActiveTab("tasks")} className="text-xs text-vault-accent hover:underline mt-2">
                    View all {openTasks.length} tasks
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── NOTES / MEETINGS ── */}
        {(activeTab === "notes" || activeTab === "meetings") && (
          <div className="flex gap-6 max-w-5xl h-full">
            {/* Note List */}
            <div className="w-64 flex-shrink-0 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-vault-text-bright">
                  {activeTab === "meetings" ? "Meetings" : "Notes"}
                </h3>
                <button
                  onClick={() => handleCreateNote(activeTab === "meetings" ? "meeting" : "note")}
                  className="btn-ghost p-1"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {activeTab === "notes" && (
                <button
                  onClick={() => handleCreateNote("daily")}
                  className="card-base w-full p-2.5 text-xs text-left mb-3 hover:border-vault-accent flex items-center gap-2"
                >
                  <Calendar className="w-3.5 h-3.5 text-vault-accent" />
                  <span className="text-vault-accent font-medium">Today's Daily Note</span>
                </button>
              )}

              <div className="flex-1 overflow-y-auto space-y-1.5">
                {(activeTab === "meetings" ? meetingNotes : allNotes.filter((n) => n.type !== "meeting")).map((note) => (
                  <button
                    key={note.id}
                    onClick={() => setEditingNote(note)}
                    className={`card-base w-full p-2.5 text-xs text-left ${
                      editingNote?.id === note.id ? "border-vault-accent" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {note.type === "daily" && <Calendar className="w-3 h-3 text-vault-accent" />}
                      {note.type === "meeting" && <Users className="w-3 h-3 text-vault-warning" />}
                      {note.type === "note" && <StickyNote className="w-3 h-3 text-vault-success" />}
                      <span className="font-medium text-vault-text-bright truncate">{note.title}</span>
                    </div>
                    <span className="text-[10px] text-vault-text-muted block mt-0.5">{note.date}</span>
                    {note.content && (
                      <p className="text-[10px] text-vault-text-muted mt-0.5 line-clamp-1">{note.content}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Editor (auto-save) */}
            <div className="flex-1 min-w-0 flex flex-col">
              {editingNote ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="text"
                      value={editingNote.title}
                      onChange={(e) => handleNoteChange({ ...editingNote, title: e.target.value })}
                      className="input-base flex-1 text-base font-semibold"
                    />
                    <div className="flex items-center gap-2 text-[10px] text-vault-text-muted">
                      {saveStatus === "saving" && <><Clock className="w-2.5 h-2.5 animate-spin" /> Saving...</>}
                      {saveStatus === "saved" && <><CheckCircle2 className="w-2.5 h-2.5 text-vault-success" /> Saved</>}
                      {saveStatus === "idle" && <span className="opacity-50">Auto-saves</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2 text-xs text-vault-text-muted">
                    <Clock className="w-3 h-3" /> {editingNote.date}
                    <span className="tag bg-vault-card border border-vault-border">{editingNote.type}</span>
                  </div>
                  <textarea
                    value={editingNote.content}
                    onChange={(e) => handleNoteChange({ ...editingNote, content: e.target.value })}
                    placeholder={
                      editingNote.type === "daily"
                        ? "## What I worked on today\n- \n\n## Blockers\n- \n\n## Plan for tomorrow\n- "
                        : editingNote.type === "meeting"
                        ? "## Attendees\n- \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- "
                        : "Write your thoughts... (Markdown supported)\n\nAuto-saves every 3 seconds."
                    }
                    className="input-base flex-1 w-full resize-none font-mono text-sm leading-relaxed"
                  />
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-vault-text-muted text-sm">
                  <div className="text-center">
                    <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>Select a note or create a new one</p>
                    <p className="text-[10px] mt-1">Notes auto-save every 3 seconds</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {activeTab === "documents" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-vault-text-bright">Documents</h3>
              <button onClick={handleUploadDoc} className="btn-primary text-xs flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
            </div>
            {space.documents.length === 0 ? (
              <div className="text-center py-12 text-vault-text-muted">
                <Folder className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No documents yet</p>
                <p className="text-xs mt-1">Upload PDFs, transcripts, specs, or any project files</p>
              </div>
            ) : (
              <div className="space-y-2">
                {space.documents.map((doc, i) => (
                  <div key={i} className="card-base p-3 flex items-center gap-3">
                    <FileText className="w-4 h-4 text-vault-text-muted" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-vault-text-bright truncate">{doc.name}</p>
                      <p className="text-[10px] text-vault-text-muted">{doc.added}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TASKS ── */}
        {activeTab === "tasks" && (
          <div className="max-w-4xl">
            <h3 className="text-base font-semibold text-vault-text-bright mb-4">
              Tasks ({openTasks.length} open, {doneTasks.length} done)
            </h3>
            {openTasks.length === 0 ? (
              <p className="text-sm text-vault-text-muted">No open tasks for this project.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {openTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onClick={() => setEditingTask(task)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AI KNOWLEDGE ── */}
        {activeTab === "knowledge" && (
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-vault-accent" />
              <div>
                <h3 className="text-base font-semibold text-vault-text-bright">AI Knowledge Base</h3>
                <p className="text-xs text-vault-text-muted">Everything the AI knows about this project.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="card-base p-4">
                <h4 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wide mb-2">Sources</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-vault-text">
                    <span>Notes</span><span>{space.notes.length}</span>
                  </div>
                  <div className="flex justify-between text-vault-text">
                    <span>Documents</span><span>{space.documents.length}</span>
                  </div>
                  <div className="flex justify-between text-vault-text">
                    <span>Tasks</span><span>{projectTasks.length}</span>
                  </div>
                </div>
              </div>
              <div className="card-base p-4">
                <h4 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wide mb-2">Context Preview</h4>
                <pre className="text-[10px] text-vault-text-muted font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto bg-vault-bg rounded p-3">
{`## Project: ${space.name}
${space.description || ""}

### Notes (${space.notes.length}):
${space.notes.slice(0, 10).map((n) => `#### ${n.title} (${n.date})\n${n.content.slice(0, 300)}`).join("\n\n")}

### Tasks (${projectTasks.length} total, ${openTasks.length} open):
${openTasks.map((t) => `- [${t.status}] ${t.title} (${t.priority}) owner:${t.owner}${t.due ? ` due:${t.due}` : ""}`).join("\n")}`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingTask && <TaskModal task={editingTask} onClose={() => setEditingTask(null)} />}
    </div>
  );
}
