import { useState, useCallback, useMemo } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { TaskCard } from "@/components/board/TaskCard";
import { TaskModal } from "@/components/board/TaskModal";
import type { Task, TaskPriority, TaskUrgency } from "@/types";

type QuadrantId = "q1" | "q2" | "q3" | "q4";

interface Quadrant {
  id: QuadrantId;
  title: string;
  sub: string;
  colorClass: string;
  borderClass: string;
  badgeClass: string;
  urgentValues: TaskUrgency[];
  importantValues: TaskPriority[];
  dropUrgency: TaskUrgency;
  dropPriority: TaskPriority | null;
}

const QUADRANTS: Quadrant[] = [
  {
    id: "q1",
    title: "Do First",
    sub: "Urgent + Important",
    colorClass: "text-vault-critical",
    borderClass: "border-vault-critical/40",
    badgeClass: "bg-vault-critical/20 text-vault-critical",
    urgentValues: ["overdue", "today"],
    importantValues: ["critical", "high"],
    dropUrgency: "today",
    dropPriority: "high",
  },
  {
    id: "q2",
    title: "Schedule",
    sub: "Not Urgent + Important",
    colorClass: "text-vault-accent",
    borderClass: "border-vault-accent/40",
    badgeClass: "bg-vault-accent/20 text-vault-accent",
    urgentValues: ["this_week", "next_2weeks", "ongoing"],
    importantValues: ["critical", "high"],
    dropUrgency: "this_week",
    dropPriority: null,
  },
  {
    id: "q3",
    title: "Delegate",
    sub: "Urgent + Not Important",
    colorClass: "text-vault-warning",
    borderClass: "border-vault-warning/40",
    badgeClass: "bg-vault-warning/20 text-vault-warning",
    urgentValues: ["overdue", "today"],
    importantValues: ["medium", "low"],
    dropUrgency: "today",
    dropPriority: "medium",
  },
  {
    id: "q4",
    title: "Eliminate",
    sub: "Not Urgent + Not Important",
    colorClass: "text-vault-text-muted",
    borderClass: "border-vault-border",
    badgeClass: "bg-vault-card text-vault-text-muted",
    urgentValues: ["this_week", "next_2weeks", "ongoing"],
    importantValues: ["medium", "low"],
    dropUrgency: "ongoing",
    dropPriority: "low",
  },
];

function DroppableQuadrant({
  quad,
  children,
}: {
  quad: Quadrant;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: quad.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col border-vault-border overflow-hidden transition-colors ${
        quad.id === "q1" || quad.id === "q2" ? "border-b" : ""
      } ${quad.id === "q1" || quad.id === "q3" ? "border-r" : ""} ${
        isOver ? "bg-vault-card/50" : ""
      }`}
    >
      {children}
    </div>
  );
}

function classifyTask(task: Task): QuadrantId {
  const isUrgent = (task.urgency === "overdue" || task.urgency === "today");
  const isImportant = (task.priority === "critical" || task.priority === "high");
  if (isUrgent && isImportant) return "q1";
  if (!isUrgent && isImportant) return "q2";
  if (isUrgent && !isImportant) return "q3";
  return "q4";
}

export function EisenhowerMatrix() {
  const { tasks, projectSpaces } = useAppStore();
  const { saveTask } = useVault();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.archived && !t.time_only && t.status !== "done"),
    [tasks]
  );

  const filteredTasks = useMemo(
    () => projectFilter === "all" ? activeTasks : activeTasks.filter((t) => t.project === projectFilter),
    [activeTasks, projectFilter]
  );

  const tasksByQuadrant = useMemo(() => {
    const map: Record<QuadrantId, Task[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const t of filteredTasks) map[classifyTask(t)].push(t);
    return map;
  }, [filteredTasks]);

  const projects = useMemo(() => {
    const ids = [...new Set(activeTasks.map((t) => t.project).filter(Boolean))];
    return ids.map((id) => {
      const space = projectSpaces.find((s) => s.id === id);
      return { id, name: space?.name ?? id };
    });
  }, [activeTasks, projectSpaces]);

  const handleDndEnd = useCallback(
    (event: DragEndEvent) => {
      const taskId = String(event.active.id);
      const quadId = event.over ? String(event.over.id) : null;
      if (!quadId) return;
      const quad = QUADRANTS.find((q) => q.id === quadId);
      if (!quad) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const updates: Partial<Task> = { urgency: quad.dropUrgency };
      if (quad.dropPriority !== null) {
        const keepPriority = task.priority === "critical" && quad.id === "q1";
        if (!keepPriority) updates.priority = quad.dropPriority;
      }
      const updated = { ...task, ...updates };
      useAppStore.getState().updateTask(task.id, updates);
      saveTask(updated).catch(console.error);
    },
    [tasks, saveTask]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-vault-text-bright">Eisenhower Matrix</h2>
          <p className="text-xs text-vault-text-muted mt-0.5">{filteredTasks.length} active tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="input-base text-xs py-1.5 pr-7"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => setNewTask(true)}
            className="btn-primary text-xs py-1.5 px-3"
          >
            + New Task
          </button>
        </div>
      </div>

      {/* 2×2 Grid */}
      <DndContext sensors={sensors} onDragEnd={handleDndEnd}>
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 overflow-hidden">
          {QUADRANTS.map((quad) => {
            const qTasks = tasksByQuadrant[quad.id];
            return (
              <DroppableQuadrant key={quad.id} quad={quad}>
                {/* Quadrant header */}
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${quad.borderClass} flex-shrink-0`}>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-bold ${quad.colorClass}`}>{quad.title}</span>
                    <span className="text-xs text-vault-text-muted ml-2">{quad.sub}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${quad.badgeClass}`}>
                    {qTasks.length}
                  </span>
                </div>

                {/* Task list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {qTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 gap-2 text-vault-text-muted/40">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                      <span className="text-xs">No tasks</span>
                    </div>
                  ) : (
                    qTasks.map((task) => (
                      <TaskCard key={task.id} task={task} onClick={(t) => setSelectedTask(t)} draggable />
                    ))
                  )}
                </div>
              </DroppableQuadrant>
            );
          })}
        </div>
      </DndContext>

      {(selectedTask || newTask) && (
        <TaskModal
          task={selectedTask}
          onClose={() => { setSelectedTask(null); setNewTask(false); }}
        />
      )}
    </div>
  );
}
