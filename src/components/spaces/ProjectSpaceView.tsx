import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { parseTimeInput, formatHours } from "@/lib/time";
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
  Archive,
  Trash2,
  Eye,
  PenLine,
  ListPlus,
} from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { useVault } from "@/hooks/useVault";
import { useLlm } from "@/hooks/useLlm";
import type { ProjectSpaceTab, SpaceNote, Task, StatusColors, TimeEntry, NoteSearchResult } from "@/types";
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
    setProjectSpaces,
    spaceNotes,
    upsertSpaceNote,
    config,
  } = useAppStore(
    useShallow((s) => ({
      projectSpaces: s.projectSpaces,
      activeSpaceId: s.activeSpaceId,
      setActiveSpaceId: s.setActiveSpaceId,
      setView: s.setView,
      tasks: s.tasks,
      setProjectSpaces: s.setProjectSpaces,
      spaceNotes: s.spaceNotes,
      upsertSpaceNote: s.upsertSpaceNote,
      config: s.config,
    }))
  );
  const { saveSpace: persistSpace, deleteSpace, saveTask, loadSpaceNotes, saveSpaceNote, deleteSpaceNote, indexSpaceNotes, searchSpaceNotes, spaceIndexStatus } = useVault();
  const { extractTasksFromText, isProcessing: llmProcessing } = useLlm();

  const [activeTab, setActiveTab] = useState<ProjectSpaceTab>("overview");
  const [editingNote, setEditingNote] = useState<SpaceNote | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newNoteType, setNewNoteType] = useState<"daily" | "meeting" | "note">("daily");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bookHours, setBookHours] = useState("");
  const [bookDate, setBookDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookDesc, setBookDesc] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Knowledge search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<{ indexed_count: number; last_modified_unix: number | null } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const space = projectSpaces.find((s) => s.id === activeSpaceId);
  const sc: StatusColors = { ...DEFAULT_STATUS_COLORS, ...(config.status_colors || {}) };

  // Notes loaded per-space from disk
  const notes: SpaceNote[] = activeSpaceId ? (spaceNotes[activeSpaceId] || []) : [];

  useEffect(() => {
    if (activeSpaceId) {
      loadSpaceNotes(activeSpaceId);
      setEditingNote(null);
      setActiveTab("overview");
    }
  }, [activeSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load index status when knowledge tab opens
  useEffect(() => {
    if (activeTab === "knowledge" && activeSpaceId) {
      spaceIndexStatus(activeSpaceId).then(setIndexStatus).catch(() => {});
    }
  }, [activeTab, activeSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced semantic search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim() || activeTab !== "knowledge") {
      setSearchResults([]);
      setSearchError("");
      return;
    }
    searchTimer.current = setTimeout(async () => {
      if (!activeSpaceId) return;
      try {
        setSearchError("");
        const results = await searchSpaceNotes(activeSpaceId, searchQuery, 8);
        setSearchResults(results);
      } catch (err) {
        setSearchError(String(err));
        setSearchResults([]);
      }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIndexNotes = useCallback(async () => {
    if (!activeSpaceId) return;
    setIsIndexing(true);
    setSearchError("");
    try {
      await indexSpaceNotes(activeSpaceId);
      const status = await spaceIndexStatus(activeSpaceId);
      setIndexStatus(status);
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setIsIndexing(false);
    }
  }, [activeSpaceId, indexSpaceNotes, spaceIndexStatus]);

  // Project tasks
  const projectTasks = useMemo(() => {
    if (!space) return [];
    return tasks.filter((t) => !t.archived && t.project === space.id);
  }, [tasks, space]);

  const openTasks = useMemo(() => projectTasks.filter((t) => t.status !== "done"), [projectTasks]);
  const doneTasks = useMemo(() => projectTasks.filter((t) => t.status === "done"), [projectTasks]);
  const totalHours = useMemo(() => projectTasks.reduce((s, t) => s + t.actual_hours, 0), [projectTasks]);
  const overdueTasks = useMemo(() => openTasks.filter((t) => t.due && t.due < new Date().toISOString().split("T")[0]), [openTasks]);
  const inProgressTasks = useMemo(() => openTasks.filter((t) => t.status === "in_progress"), [openTasks]);
  const blockedTasks = useMemo(() => openTasks.filter((t) => t.status === "blocked"), [openTasks]);
  const todoTasks = useMemo(() => openTasks.filter((t) => t.status === "todo"), [openTasks]);

  // Notes sorted by date
  const dailyNotes = useMemo(
    () => notes.filter((n) => n.type === "daily").sort((a, b) => b.date.localeCompare(a.date)),
    [notes]
  );
  const meetingNotes = useMemo(
    () => notes.filter((n) => n.type === "meeting").sort((a, b) => b.date.localeCompare(a.date)),
    [notes]
  );
  const allNotes = useMemo(
    () => [...notes].sort((a, b) => b.date.localeCompare(a.date)),
    [notes]
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
      upsertSpaceNote(space.id, updatedNote);

      // Debounced save of individual note file
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        setSaveStatus("saving");
        await saveSpaceNote(space.id, updatedNote);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      }, 3000);
    },
    [space, upsertSpaceNote, saveSpaceNote]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // Flush pending note save on tab switch or leaving the space
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        const currentNote = editingNote;
        if (currentNote && space) {
          saveSpaceNote(space.id, currentNote);
        }
      }
    };
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateNote = useCallback(async (type: "daily" | "meeting" | "note") => {
    if (!space) return;
    const today = new Date().toISOString().split("T")[0];

    // For daily notes, open existing one for today if it exists
    if (type === "daily") {
      const existing = notes.find((n) => n.type === "daily" && n.date === today);
      if (existing) {
        setEditingNote(existing);
        setPreviewMode(false);
        return;
      }
    }

    const id = `note_${Date.now()}`;
    let title = "";
    if (type === "daily") title = `Daily Note - ${today}`;
    else if (type === "meeting") title = `Meeting Notes - ${today}`;
    else title = "New Note";

    const note: SpaceNote = { id, title, type, date: today, content: "", tags: [] };
    upsertSpaceNote(space.id, note);
    setEditingNote(note);
    setPreviewMode(false);
    await saveSpaceNote(space.id, note);
  }, [space, notes, upsertSpaceNote, saveSpaceNote]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!space) return;
    if (editingNote?.id === noteId) setEditingNote(null);
    await deleteSpaceNote(space.id, noteId);
  }, [space, editingNote, deleteSpaceNote]);

  // Right-click note state
  const [noteMenu, setNoteMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const noteMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!noteMenu) return;
    const handler = (e: MouseEvent) => {
      if (noteMenuRef.current && !noteMenuRef.current.contains(e.target as Node)) {
        setNoteMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [noteMenu]);

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

  const handleArchiveSpace = useCallback(async () => {
    if (!space) return;
    const updated = { ...space, archived: true };
    setProjectSpaces(projectSpaces.map((s) => (s.id === space.id ? updated : s)));
    await persistSpace(updated);
    setActiveSpaceId(null);
    setView("dashboard");
  }, [space, projectSpaces, setProjectSpaces, persistSpace, setActiveSpaceId, setView]);

  const handleDeleteSpace = useCallback(async () => {
    if (!space) return;
    await deleteSpace(space.id);
    setActiveSpaceId(null);
    setView("dashboard");
  }, [space, deleteSpace, setActiveSpaceId, setView]);

  const handleBookHours = useCallback(async () => {
    if (!space || !bookHours) return;
    const parsed = parseTimeInput(bookHours);
    if (parsed === null || parsed <= 0) return;
    const entry: TimeEntry = {
      id: `time_${Date.now()}`,
      date: bookDate || new Date().toISOString().split("T")[0],
      hours: Math.round(parsed * 100) / 100,
      description: bookDesc,
    };
    const updated = { ...space, timeEntries: [...(space.timeEntries || []), entry] };
    setProjectSpaces(projectSpaces.map((s) => (s.id === space.id ? updated : s)));
    await persistSpace(updated);
    setBookHours("");
    setBookDesc("");
  }, [space, bookHours, bookDesc, projectSpaces, setProjectSpaces, persistSpace]);

  const totalBookedHours = useMemo(
    () => (space?.timeEntries || []).reduce((s, e) => s + e.hours, 0),
    [space]
  );

  const handleBack = () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      if (editingNote && space) saveSpaceNote(space.id, editingNote);
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
            {openTasks.length} open / {totalBookedHours.toFixed(1)}h booked / {totalHours.toFixed(1)}h task-tracked
          </span>

          {/* Spacer + actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Auto-save indicator */}
            {saveStatus === "saving" && (
              <span className="text-[10px] text-vault-text-muted flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-[10px] text-vault-success flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Saved
              </span>
            )}

            {space.id !== "general" && (
              <>
                <button
                  onClick={handleArchiveSpace}
                  className="btn-ghost p-1.5 text-vault-text-muted hover:text-vault-warning"
                  title="Archive this space"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-ghost p-1.5 text-vault-text-muted hover:text-vault-critical"
                  title="Delete this space"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mb-2 p-3 bg-vault-critical/10 border border-vault-critical/20 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-vault-critical flex-shrink-0" />
            <p className="text-xs text-vault-text flex-1">
              Delete "{space.name}"? This removes the space and all notes permanently.
            </p>
            <button onClick={handleDeleteSpace} className="text-xs text-vault-critical font-medium hover:underline">
              Delete
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-vault-text-muted hover:underline">
              Cancel
            </button>
          </div>
        )}

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
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── DASHBOARD / OVERVIEW ── */}
        {activeTab === "overview" && (
          <div className="flex-1 overflow-auto p-6">
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
                <p className="text-2xl font-bold text-vault-accent">{totalBookedHours.toFixed(1)}h</p>
                <p className="text-[10px] text-vault-text-muted">Booked</p>
              </div>
            </div>

            {/* Hour Booking */}
            <div className="card-base p-4">
              <h3 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Book Hours
              </h3>
              <div className="flex gap-2 mb-1">
                <input
                  type="date"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="input-base w-32 text-xs"
                />
                <input
                  type="text"
                  value={bookHours}
                  onChange={(e) => setBookHours(e.target.value)}
                  placeholder="1h30m"
                  className="input-base w-20 text-sm"
                />
                <input
                  type="text"
                  value={bookDesc}
                  onChange={(e) => setBookDesc(e.target.value)}
                  placeholder="What did you work on?"
                  className="input-base flex-1 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleBookHours(); }}
                />
                <button
                  onClick={handleBookHours}
                  disabled={!bookHours || parseTimeInput(bookHours) === null}
                  className="btn-primary text-xs px-3 disabled:opacity-50"
                >
                  Log
                </button>
              </div>

              {/* Weekly timesheet grid */}
              {(() => {
                const entries = space.timeEntries || [];
                if (entries.length === 0) return null;

                // Get current week Mon-Fri
                const now = new Date();
                const dayOfWeek = now.getDay();
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
                monday.setHours(0, 0, 0, 0);
                const weekDays = Array.from({ length: 5 }, (_, i) => {
                  const d = new Date(monday);
                  d.setDate(monday.getDate() + i);
                  return d.toISOString().split("T")[0];
                });

                const weekEntries = entries.filter((e) => weekDays.includes(e.date));
                const weekTotal = weekEntries.reduce((s, e) => s + e.hours, 0);

                return (
                  <div className="mt-3">
                    <p className="text-[10px] text-vault-text-muted mb-2 font-semibold uppercase tracking-wider">This Week</p>
                    <div className="flex gap-1 mb-2">
                      {weekDays.map((d) => {
                        const dayEntries = weekEntries.filter((e) => e.date === d);
                        const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
                        const isToday = d === new Date().toISOString().split("T")[0];
                        const date = new Date(d + "T12:00:00");
                        return (
                          <div
                            key={d}
                            className={`flex-1 rounded-lg p-1.5 text-center cursor-pointer ${
                              isToday ? "bg-vault-accent/10 border border-vault-accent/20" : "bg-vault-bg"
                            }`}
                            onClick={() => setBookDate(d)}
                          >
                            <p className={`text-[9px] font-medium ${isToday ? "text-vault-accent" : "text-vault-text-muted"}`}>
                              {date.toLocaleDateString("en-US", { weekday: "short" })}
                            </p>
                            <p className={`text-xs font-bold ${dayTotal > 0 ? "text-vault-text-bright" : "text-vault-text-muted opacity-30"}`}>
                              {dayTotal > 0 ? formatHours(dayTotal) : "-"}
                            </p>
                          </div>
                        );
                      })}
                      <div className="flex-1 rounded-lg p-1.5 text-center bg-vault-card">
                        <p className="text-[9px] font-medium text-vault-text-muted">Total</p>
                        <p className="text-xs font-bold text-vault-accent">{formatHours(weekTotal)}</p>
                      </div>
                    </div>

                    {/* Entries for selected date */}
                    {(() => {
                      const dateEntries = entries.filter((e) => e.date === bookDate).sort((a, b) => b.id.localeCompare(a.id));
                      if (dateEntries.length === 0) return null;
                      return (
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {dateEntries.map((e) => (
                            <div key={e.id} className="flex items-center gap-2 text-[10px] text-vault-text-muted">
                              <span className="text-vault-text font-medium w-10">{formatHours(e.hours)}</span>
                              <span className="truncate flex-1">{e.description || "No description"}</span>
                              <button
                                onClick={async () => {
                                  const updated = { ...space, timeEntries: space.timeEntries.filter((t) => t.id !== e.id) };
                                  setProjectSpaces(projectSpaces.map((s) => (s.id === space.id ? updated : s)));
                                  await persistSpace(updated);
                                }}
                                className="text-vault-critical hover:bg-vault-critical/10 p-0.5 rounded opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
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
          </div>
        )}

        {/* ── NOTES / MEETINGS ── */}
        {(activeTab === "notes" || activeTab === "meetings") && (
          <div className="flex-1 overflow-hidden flex gap-6 p-6">
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
                    onClick={() => { setEditingNote(note); setPreviewMode(false); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setNoteMenu({ noteId: note.id, x: e.clientX, y: e.clientY });
                    }}
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

              {/* Note right-click context menu */}
              {noteMenu && (
                <div
                  ref={noteMenuRef}
                  className="fixed z-[100] bg-vault-surface border border-vault-border rounded-xl shadow-2xl py-1.5 w-36"
                  style={{
                    left: Math.min(noteMenu.x, window.innerWidth - 160),
                    top: Math.min(noteMenu.y, window.innerHeight - 80),
                  }}
                >
                  <button
                    onClick={() => {
                      handleDeleteNote(noteMenu.noteId);
                      setNoteMenu(null);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-vault-critical hover:bg-vault-critical/10 rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Note
                  </button>
                </div>
              )}
            </div>

            {/* Note Editor (auto-save + markdown preview) */}
            <div className="flex-1 min-w-0 flex flex-col">
              {editingNote ? (
                <>
                  {/* Title Row */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={editingNote.title}
                      onChange={(e) => handleNoteChange({ ...editingNote, title: e.target.value })}
                      className="input-base flex-1 text-base font-semibold"
                    />
                    <div className="flex items-center gap-1">
                      {saveStatus === "saving" && <span className="text-[10px] text-vault-text-muted flex items-center gap-1"><Clock className="w-2.5 h-2.5 animate-spin" />Saving</span>}
                      {saveStatus === "saved" && <span className="text-[10px] text-vault-success flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Saved</span>}
                    </div>
                  </div>

                  {/* Toolbar Row */}
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-3 h-3 text-vault-text-muted" />
                    <span className="text-xs text-vault-text-muted">{editingNote.date}</span>
                    <span className="tag bg-vault-card border border-vault-border text-[10px]">{editingNote.type}</span>

                    <div className="ml-auto flex items-center gap-1">
                      {/* Create Task from Note */}
                      <button
                        onClick={() => setShowCreateTask(true)}
                        className="flex items-center gap-1 text-[10px] text-vault-accent hover:bg-vault-accent/10 px-2 py-1 rounded"
                        title="Create a task from this note"
                      >
                        <ListPlus className="w-3 h-3" />
                        Create Task
                      </button>

                      {/* Preview/Edit Toggle */}
                      <div className="flex bg-vault-bg rounded border border-vault-border p-0.5">
                        <button
                          onClick={() => setPreviewMode(false)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
                            !previewMode ? "bg-vault-card text-vault-accent" : "text-vault-text-muted"
                          }`}
                        >
                          <PenLine className="w-2.5 h-2.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => setPreviewMode(true)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
                            previewMode ? "bg-vault-card text-vault-accent" : "text-vault-text-muted"
                          }`}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          Preview
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Editor or Preview */}
                  {previewMode ? (
                    <div
                      className="flex-1 overflow-y-auto bg-vault-bg rounded-lg border border-vault-border p-4 prose-vault"
                      dangerouslySetInnerHTML={{
                        __html: (() => {
                          try {
                            const raw = marked.parse(editingNote.content || "*Empty note*") as string;
                            return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
                          } catch {
                            return `<div class="text-vault-critical text-sm"><strong>Markdown parse error.</strong></div>`;
                          }
                        })(),
                      }}
                    />
                  ) : (
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
                  )}

                  {/* Create Tasks from Note via LLM */}
                  {showCreateTask && (
                    <NoteToTasksModal
                      note={editingNote}
                      projectId={space?.id || "general"}
                      onClose={() => setShowCreateTask(false)}
                      extractTasksFromText={extractTasksFromText}
                      saveTask={saveTask}
                      isProcessing={llmProcessing}
                    />
                  )}
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
          <div className="flex-1 overflow-auto p-6">
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
          </div>
        )}

        {/* ── TASKS ── */}
        {activeTab === "tasks" && (
          <div className="flex-1 overflow-auto p-6">
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
          </div>
        )}

        {/* ── AI KNOWLEDGE ── */}
        {activeTab === "knowledge" && (
          <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-vault-accent" />
                <div>
                  <h3 className="text-base font-semibold text-vault-text-bright">Semantic Search</h3>
                  <p className="text-xs text-vault-text-muted">
                    {indexStatus
                      ? `${indexStatus.indexed_count} notes indexed${indexStatus.last_modified_unix ? ` · ${new Date(indexStatus.last_modified_unix * 1000).toLocaleDateString()}` : ""}`
                      : "Not indexed yet"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleIndexNotes}
                disabled={isIndexing || notes.length === 0}
                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isIndexing ? (
                  <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Indexing…</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> Index Notes</>
                )}
              </button>
            </div>

            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes semantically… (requires embedding model in LM Studio)"
                className="input-base w-full pl-8 text-sm"
              />
              <Sparkles className="w-3.5 h-3.5 text-vault-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchError(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vault-text-muted hover:text-vault-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Error banner */}
            {searchError && (
              <div className="card-base p-3 border-vault-critical/30 bg-vault-critical/5 text-xs text-vault-critical">
                {searchError}
              </div>
            )}

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((r) => (
                  <button
                    key={r.note_id}
                    onClick={() => {
                      const note = notes.find((n) => n.id === r.note_id);
                      if (note) { setEditingNote(note); setActiveTab(r.note_type === "meeting" ? "meetings" : "notes"); }
                    }}
                    className="card-base w-full p-3 text-left hover:border-vault-accent"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {r.note_type === "daily" && <Calendar className="w-3 h-3 text-vault-accent flex-shrink-0" />}
                      {r.note_type === "meeting" && <Users className="w-3 h-3 text-vault-warning flex-shrink-0" />}
                      {r.note_type === "note" && <StickyNote className="w-3 h-3 text-vault-success flex-shrink-0" />}
                      <span className="text-xs font-medium text-vault-text-bright flex-1 truncate">{r.title}</span>
                      <span className="text-[10px] text-vault-text-muted flex-shrink-0">{r.date}</span>
                      <span className={`text-[10px] font-mono flex-shrink-0 ${r.score > 0.8 ? "text-vault-success" : r.score > 0.6 ? "text-vault-warning" : "text-vault-text-muted"}`}>
                        {(r.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    {r.preview && (
                      <p className="text-[10px] text-vault-text-muted line-clamp-2">{r.preview}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state when no query */}
            {!searchQuery && !searchError && (
              <div className="card-base p-4 space-y-2 text-xs text-vault-text-muted">
                <p className="font-semibold text-vault-text">How it works</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Load an embedding model in LM Studio (e.g. <code className="text-vault-accent">nomic-embed-text</code> or <code className="text-vault-accent">all-minilm</code>)</li>
                  <li>Click <strong className="text-vault-text">Index Notes</strong> — this embeds all notes in this space (only changed notes are re-embedded on repeat runs)</li>
                  <li>Type a natural-language question to find semantically relevant notes</li>
                </ol>
                <div className="pt-1 flex gap-4 text-[10px]">
                  <span>{notes.length} notes in space</span>
                  <span>{indexStatus?.indexed_count ?? 0} indexed</span>
                </div>
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {editingTask && <TaskModal task={editingTask} onClose={() => setEditingTask(null)} />}
    </div>
  );
}

// ── Note-to-Tasks Modal (LLM extraction) ──────────────────────────────
function NoteToTasksModal({
  note,
  projectId,
  onClose,
  extractTasksFromText,
  saveTask,
  isProcessing,
}: {
  note: SpaceNote;
  projectId: string;
  onClose: () => void;
  extractTasksFromText: (text: string, source: string) => Promise<Partial<Task>[]>;
  saveTask: (task: Task) => Promise<void>;
  isProcessing: boolean;
}) {
  const { config, llmConnected } = useAppStore();
  const [extracted, setExtracted] = useState<Partial<Task>[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<"idle" | "extracting" | "review" | "done">("idle");
  const [error, setError] = useState("");

  const handleExtract = useCallback(async () => {
    setPhase("extracting");
    setError("");
    try {
      const prompt = `Note title: ${note.title}\nDate: ${note.date}\nType: ${note.type}\n\n${note.content}`;
      const tasks = await extractTasksFromText(prompt, `note:${note.id}`);

      // Set project to current space for all extracted tasks
      const withProject = tasks.map((t) => ({
        ...t,
        project: t.project || projectId,
        owner: t.owner || config.user_name || "",
      }));

      setExtracted(withProject);
      setSelected(new Set(withProject.map((_, i) => i)));
      setPhase("review");
    } catch (err) {
      setError(String(err));
      setPhase("idle");
    }
  }, [note, projectId, config.user_name, extractTasksFromText]);

  const handleApply = useCallback(async () => {
    let count = 0;
    for (const i of selected) {
      const partial = extracted[i];
      if (!partial) continue;
      const task: Task = {
        id: partial.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: partial.title || "Untitled",
        status: "todo",
        priority: (partial.priority as Task["priority"]) || "medium",
        urgency: (partial.urgency as Task["urgency"]) || "ongoing",
        project: partial.project || projectId,
        owner: partial.owner || "",
        collaborators: [],
        source: `note:${note.id}`,
        source_quote: partial.source_quote || "",
        created: new Date().toISOString().split("T")[0],
        due: partial.due || "",
        estimated_hours: 0,
        actual_hours: 0,
        blocked_by: [],
        subtasks: partial.subtasks || [],
        notes: "",
        archived: false,
        time_only: false,
      };
      await saveTask(task);
      count++;
      await new Promise((r) => setTimeout(r, 15));
    }
    setPhase("done");
    setTimeout(onClose, 1500);
  }, [extracted, selected, projectId, note.id, saveTask, onClose]);

  const toggleItem = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-vault-surface border border-vault-border rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-vault-border">
          <h3 className="text-sm font-bold text-vault-text-bright flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-vault-accent" />
            Extract Tasks from Note
          </h3>
          <p className="text-[10px] text-vault-text-muted mt-1">
            AI will analyze "{note.title}" and suggest actionable tasks.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Idle -- show Extract button */}
          {phase === "idle" && (
            <div className="text-center py-8">
              {!llmConnected || !config.active_model ? (
                <div>
                  <p className="text-sm text-vault-warning mb-2">LM Studio not connected or no model loaded.</p>
                  <p className="text-xs text-vault-text-muted">Connect LM Studio and select a model in Settings first.</p>
                </div>
              ) : (
                <>
                  <Sparkles className="w-8 h-8 mx-auto mb-3 text-vault-accent opacity-40" />
                  <p className="text-sm text-vault-text-muted mb-4">
                    The AI will read your note and extract action items, to-dos, and follow-ups as tasks.
                  </p>
                  <button onClick={handleExtract} className="btn-primary text-sm flex items-center gap-2 mx-auto">
                    <Sparkles className="w-4 h-4" />
                    Extract Tasks
                  </button>
                </>
              )}
              {error && <p className="text-xs text-vault-critical mt-3">{error}</p>}
            </div>
          )}

          {/* Extracting */}
          {phase === "extracting" && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-vault-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-vault-text-muted">Analyzing note content...</p>
            </div>
          )}

          {/* Review extracted tasks */}
          {phase === "review" && (
            <div>
              <p className="text-xs text-vault-text-muted mb-3">
                Found {extracted.length} task{extracted.length !== 1 ? "s" : ""}. Select which to create:
              </p>
              <div className="space-y-2">
                {extracted.map((task, i) => (
                  <div
                    key={i}
                    onClick={() => toggleItem(i)}
                    className={`card-base p-3 cursor-pointer flex items-start gap-2.5 ${
                      selected.has(i) ? "border-vault-accent" : "opacity-50"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      selected.has(i) ? "bg-vault-accent border-vault-accent" : "border-vault-border"
                    }`}>
                      {selected.has(i) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-vault-text-bright">{task.title}</p>
                      {task.source_quote && (
                        <p className="text-[10px] text-vault-text-muted italic mt-0.5 line-clamp-1">"{task.source_quote}"</p>
                      )}
                      <div className="flex gap-1.5 mt-1.5">
                        {task.priority && <span className="tag text-[9px] bg-vault-bg border border-vault-border">{task.priority}</span>}
                        {task.project && <span className="tag text-[9px] bg-vault-accent/10 text-vault-accent border border-vault-accent/20">{task.project}</span>}
                        {task.owner && <span className="tag text-[9px] bg-vault-bg border border-vault-border">{task.owner}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {extracted.length === 0 && (
                <p className="text-sm text-vault-text-muted text-center py-4">No tasks found in this note.</p>
              )}
            </div>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-10 h-10 text-vault-success mx-auto mb-3" />
              <p className="text-sm text-vault-text-bright">{selected.size} task{selected.size !== 1 ? "s" : ""} created</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "review" && extracted.length > 0 && (
          <div className="px-5 py-3 border-t border-vault-border flex items-center justify-between">
            <span className="text-[10px] text-vault-text-muted">{selected.size} of {extracted.length} selected</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={handleApply}
                disabled={selected.size === 0}
                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Create {selected.size} Task{selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
