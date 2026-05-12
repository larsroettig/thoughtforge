import { useState, useMemo, useCallback } from "react";
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
  Trash2,
  Save,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import type { ProjectSpace, ProjectSpaceTab, SpaceNote, Task } from "@/types";
import { PROJECT_COLORS } from "@/types";
import { TaskCard } from "@/components/board/TaskCard";
import { TaskModal } from "@/components/board/TaskModal";

const TABS: { id: ProjectSpaceTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "meetings", label: "Meetings", icon: Users },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "knowledge", label: "AI Knowledge", icon: Sparkles },
];

export function ProjectSpaceView() {
  const {
    projectSpaces,
    activeSpaceId,
    setActiveSpaceId,
    setView,
    tasks,
    updateSpaceNote,
    addProjectSpace,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<ProjectSpaceTab>("overview");
  const [editingNote, setEditingNote] = useState<SpaceNote | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteType, setNewNoteType] = useState<"daily" | "meeting" | "note">("daily");

  const space = projectSpaces.find((s) => s.id === activeSpaceId);

  // Project tasks
  const projectTasks = useMemo(() => {
    if (!space) return [];
    return tasks.filter(
      (t) => !t.archived && t.project === space.id
    );
  }, [tasks, space]);

  const openTasks = projectTasks.filter((t) => t.status !== "done");
  const doneTasks = projectTasks.filter((t) => t.status === "done");
  const totalHours = projectTasks.reduce((s, t) => s + t.actual_hours, 0);

  // Notes by type
  const dailyNotes = useMemo(
    () => (space?.notes || []).filter((n) => n.type === "daily").sort((a, b) => b.date.localeCompare(a.date)),
    [space]
  );
  const meetingNotes = useMemo(
    () => (space?.notes || []).filter((n) => n.type === "meeting").sort((a, b) => b.date.localeCompare(a.date)),
    [space]
  );
  const generalNotes = useMemo(
    () => (space?.notes || []).filter((n) => n.type === "note").sort((a, b) => b.date.localeCompare(a.date)),
    [space]
  );

  const handleUploadDoc = useCallback(async () => {
    if (!space) return;
    const files = await open({
      multiple: true,
      filters: [{ name: "Documents", extensions: ["pdf", "txt", "md", "docx", "csv", "json"] }],
    });
    if (files) {
      const paths = Array.isArray(files) ? files : [files];
      // TODO: copy files into space directory and update state
      console.log("Upload docs to space:", paths);
    }
  }, [space]);

  const handleCreateNote = useCallback(() => {
    if (!space) return;
    const today = new Date().toISOString().split("T")[0];
    const id = `note_${Date.now()}`;

    let title = "";
    if (newNoteType === "daily") title = `Daily Note - ${today}`;
    else if (newNoteType === "meeting") title = `Meeting Notes - ${today}`;
    else title = "New Note";

    const note: SpaceNote = {
      id,
      title,
      type: newNoteType,
      date: today,
      content: "",
      tags: [],
    };

    updateSpaceNote(space.id, note);
    setEditingNote(note);
    setShowNewNote(false);
  }, [space, newNoteType, updateSpaceNote]);

  const handleSaveNote = useCallback(() => {
    if (!editingNote || !space) return;
    updateSpaceNote(space.id, editingNote);
    setEditingNote(null);
  }, [editingNote, space, updateSpaceNote]);

  const handleBack = () => {
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

  const color = PROJECT_COLORS[space.id] || PROJECT_COLORS.default;

  // Knowledge base content for AI context
  const knowledgeContent = useMemo(() => {
    const parts: string[] = [];
    parts.push(`## Project: ${space.name}`);
    parts.push(space.description || "");
    parts.push(`\n### Notes (${space.notes.length}):`);
    for (const note of space.notes.slice(0, 20)) {
      parts.push(`#### ${note.title} (${note.date})`);
      parts.push(note.content.slice(0, 500));
    }
    parts.push(`\n### Tasks (${projectTasks.length} total, ${openTasks.length} open):`);
    for (const t of openTasks) {
      parts.push(`- [${t.status}] ${t.title} (${t.priority}) owner:${t.owner}${t.due ? ` due:${t.due}` : ""}`);
    }
    return parts.join("\n");
  }, [space, projectTasks, openTasks]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-vault-border">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={handleBack} className="btn-ghost p-1.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <h2 className="text-xl font-bold text-vault-text-bright">{space.name}</h2>
          <span className="text-xs text-vault-text-muted">
            {openTasks.length} open tasks / {totalHours.toFixed(1)}h tracked
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-vault-card text-vault-accent"
                    : "text-vault-text-muted hover:text-vault-text hover:bg-vault-card"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-3 gap-6 max-w-5xl">
            {/* Stats Cards */}
            <div className="card-base p-4">
              <p className="text-xs text-vault-text-muted uppercase tracking-wide mb-1">Open Tasks</p>
              <p className="text-2xl font-bold text-vault-text-bright">{openTasks.length}</p>
            </div>
            <div className="card-base p-4">
              <p className="text-xs text-vault-text-muted uppercase tracking-wide mb-1">Completed</p>
              <p className="text-2xl font-bold text-vault-success">{doneTasks.length}</p>
            </div>
            <div className="card-base p-4">
              <p className="text-xs text-vault-text-muted uppercase tracking-wide mb-1">Time Tracked</p>
              <p className="text-2xl font-bold text-vault-text-bright">{totalHours.toFixed(1)}h</p>
            </div>

            {/* Recent Notes */}
            <div className="col-span-2">
              <h3 className="text-sm font-semibold text-vault-text-bright mb-3">Recent Notes</h3>
              <div className="space-y-2">
                {space.notes.slice(0, 5).map((note) => (
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
                {space.notes.length === 0 && (
                  <p className="text-xs text-vault-text-muted">No notes yet. Create a daily note to get started.</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h3 className="text-sm font-semibold text-vault-text-bright mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => { setNewNoteType("daily"); setShowNewNote(true); handleCreateNote(); }}
                  className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                >
                  <Calendar className="w-4 h-4 text-vault-accent mb-1" />
                  <span className="font-medium text-vault-text-bright block">Daily Note</span>
                  <span className="text-vault-text-muted">Log today's progress</span>
                </button>
                <button
                  onClick={() => { setNewNoteType("meeting"); setShowNewNote(true); handleCreateNote(); }}
                  className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                >
                  <Users className="w-4 h-4 text-vault-warning mb-1" />
                  <span className="font-medium text-vault-text-bright block">Meeting Notes</span>
                  <span className="text-vault-text-muted">Capture meeting takeaways</span>
                </button>
                <button
                  onClick={handleUploadDoc}
                  className="card-base p-3 w-full text-left text-xs hover:border-vault-accent"
                >
                  <Upload className="w-4 h-4 text-vault-success mb-1" />
                  <span className="font-medium text-vault-text-bright block">Upload Document</span>
                  <span className="text-vault-text-muted">Add files to this project</span>
                </button>
              </div>
            </div>

            {/* Description */}
            {space.description && (
              <div className="col-span-3">
                <h3 className="text-sm font-semibold text-vault-text-bright mb-2">Description</h3>
                <p className="text-sm text-vault-text leading-relaxed">{space.description}</p>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS */}
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

        {/* NOTES / MEETINGS */}
        {(activeTab === "notes" || activeTab === "meetings") && (
          <div className="flex gap-6 max-w-5xl">
            {/* Note List */}
            <div className="w-72 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-vault-text-bright">
                  {activeTab === "meetings" ? "Meeting Notes" : "Notes"}
                </h3>
                <button
                  onClick={() => {
                    setNewNoteType(activeTab === "meetings" ? "meeting" : "note");
                    handleCreateNote();
                  }}
                  className="btn-ghost p-1"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick: Add Daily Note */}
              {activeTab === "notes" && (
                <button
                  onClick={() => { setNewNoteType("daily"); handleCreateNote(); }}
                  className="card-base w-full p-2.5 text-xs text-left mb-3 hover:border-vault-accent flex items-center gap-2"
                >
                  <Calendar className="w-3.5 h-3.5 text-vault-accent" />
                  <span className="text-vault-accent font-medium">Today's Daily Note</span>
                </button>
              )}

              <div className="space-y-1.5">
                {(activeTab === "meetings" ? meetingNotes : [...dailyNotes, ...generalNotes]).map((note) => (
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
                  </button>
                ))}
              </div>
            </div>

            {/* Note Editor */}
            <div className="flex-1 min-w-0">
              {editingNote ? (
                <div className="h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="text"
                      value={editingNote.title}
                      onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                      className="input-base flex-1 text-base font-semibold"
                    />
                    <button onClick={handleSaveNote} className="btn-primary text-xs flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      onClick={() => setEditingNote(null)}
                      className="btn-ghost p-1.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-3 text-xs text-vault-text-muted">
                    <Clock className="w-3 h-3" /> {editingNote.date}
                    <span className="tag bg-vault-card border border-vault-border">{editingNote.type}</span>
                  </div>
                  <textarea
                    value={editingNote.content}
                    onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                    placeholder={
                      editingNote.type === "daily"
                        ? "What did you work on today?\n\n## Progress\n- \n\n## Blockers\n- \n\n## Tomorrow's Plan\n- "
                        : editingNote.type === "meeting"
                        ? "## Attendees\n- \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- "
                        : "Write your notes here... (Markdown supported)"
                    }
                    className="input-base flex-1 w-full resize-none font-mono text-sm leading-relaxed"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-vault-text-muted text-sm">
                  Select a note or create a new one
                </div>
              )}
            </div>
          </div>
        )}

        {/* TASKS */}
        {activeTab === "tasks" && (
          <div className="max-w-4xl">
            <h3 className="text-base font-semibold text-vault-text-bright mb-4">
              Project Tasks ({openTasks.length} open, {doneTasks.length} done)
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

        {/* AI KNOWLEDGE */}
        {activeTab === "knowledge" && (
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-vault-accent" />
              <div>
                <h3 className="text-base font-semibold text-vault-text-bright">AI Knowledge Base</h3>
                <p className="text-xs text-vault-text-muted">
                  Everything the AI knows about this project. Use Chat to ask questions.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card-base p-4">
                <h4 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wide mb-2">
                  Knowledge Sources
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-vault-text">
                    <span>Notes</span>
                    <span>{space.notes.length} documents</span>
                  </div>
                  <div className="flex justify-between text-vault-text">
                    <span>Documents</span>
                    <span>{space.documents.length} files</span>
                  </div>
                  <div className="flex justify-between text-vault-text">
                    <span>Tasks</span>
                    <span>{projectTasks.length} items</span>
                  </div>
                </div>
              </div>

              <div className="card-base p-4">
                <h4 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wide mb-2">
                  Context Preview (sent to AI)
                </h4>
                <pre className="text-[10px] text-vault-text-muted font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto bg-vault-bg rounded p-3">
                  {knowledgeContent}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingTask && (
        <TaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}
