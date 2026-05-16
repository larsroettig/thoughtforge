import { useState, useMemo } from "react";
import { Target, Plus, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";
import type { SmartGoal } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { GoalModal } from "./GoalModal";

const DIFFICULTY_LABEL: Record<SmartGoal["difficulty"], string> = {
  easy: "Easy",
  moderate: "Moderate",
  stretch: "Stretch",
};

const DIFFICULTY_COLOR: Record<SmartGoal["difficulty"], string> = {
  easy: "text-vault-success bg-vault-success/10 border-vault-success/20",
  moderate: "text-vault-warning bg-vault-warning/10 border-vault-warning/20",
  stretch: "text-vault-accent bg-vault-accent/10 border-vault-accent/20",
};

const STATUS_ICON = {
  active: TrendingUp,
  completed: CheckCircle2,
  abandoned: XCircle,
};

const STATUS_COLOR: Record<SmartGoal["status"], string> = {
  active: "text-vault-accent",
  completed: "text-vault-success",
  abandoned: "text-vault-text-muted",
};

function GoalCard({
  goal,
  spaceName,
  progress,
  isOverdue,
  onClick,
}: {
  goal: SmartGoal;
  spaceName: string;
  progress: number;
  isOverdue: boolean;
  onClick: () => void;
}) {
  const StatusIcon = STATUS_ICON[goal.status];

  return (
    <button
      onClick={onClick}
      className="card-base text-left hover:border-vault-accent/40 transition-colors w-full"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-sm font-semibold text-vault-text-bright leading-snug flex-1">
          {goal.title}
        </h4>
        <StatusIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${STATUS_COLOR[goal.status]}`} />
      </div>

      {/* Progress bar */}
      {goal.linked_tasks.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-vault-text-muted mb-1">
            <span>Progress</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-vault-border rounded-full overflow-hidden">
            <div
              className="h-full bg-vault-accent rounded-full transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <span className="tag bg-vault-card text-vault-text-muted border border-vault-border">
          {spaceName}
        </span>
        <span className={`tag border ${DIFFICULTY_COLOR[goal.difficulty]}`}>
          {DIFFICULTY_LABEL[goal.difficulty]}
        </span>
        {goal.metric && (
          <span className="tag bg-vault-card text-vault-text-muted border border-vault-border">
            {goal.metric}
          </span>
        )}
        {goal.due && (
          <span className={`tag border flex items-center gap-1 ${
            isOverdue ? "text-vault-critical bg-vault-critical/10 border-vault-critical/20" : "text-vault-text-muted bg-vault-card border-vault-border"
          }`}>
            <Clock className="w-2.5 h-2.5" />
            {goal.due}
          </span>
        )}
      </div>

      {goal.target && (
        <p className="text-xs text-vault-text-muted mt-2 line-clamp-1">
          Target: {goal.target}
        </p>
      )}
    </button>
  );
}

export function GoalsView() {
  const { projectSpaces, tasks } = useAppStore();
  const [editGoal, setEditGoal] = useState<SmartGoal | null | "new">(null);
  const [statusFilter, setStatusFilter] = useState<SmartGoal["status"] | "all">("active");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");

  const today = new Date().toISOString().split("T")[0];

  const allGoals = useMemo(
    () => projectSpaces.flatMap((s) => (s.goals ?? []).map((g) => ({ ...g, _spaceName: s.name }))),
    [projectSpaces]
  );

  const filtered = useMemo(
    () => allGoals
      .filter((g) => statusFilter === "all" || g.status === statusFilter)
      .filter((g) => spaceFilter === "all" || g.space === spaceFilter),
    [allGoals, statusFilter, spaceFilter]
  );

  const getProgress = (goal: SmartGoal) => {
    if (!goal.linked_tasks.length) return 0;
    const done = goal.linked_tasks.filter((id) => {
      const t = tasks.find((x) => x.id === id);
      return t?.status === "done";
    }).length;
    return done / goal.linked_tasks.length;
  };

  const spacesWithGoals = useMemo(
    () => [...new Set(allGoals.map((g) => g.space))],
    [allGoals]
  );

  const spaceName = (id: string) => projectSpaces.find((s) => s.id === id)?.name ?? id;

  // Group filtered goals by space
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const g of filtered) {
      const list = map.get(g.space) ?? [];
      list.push(g);
      map.set(g.space, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-vault-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-vault-accent" />
          <div>
            <h2 className="text-lg font-bold text-vault-text-bright">Goals</h2>
            <p className="text-xs text-vault-text-muted mt-0.5">{allGoals.length} total</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status filter */}
          <div className="flex rounded-lg border border-vault-border overflow-hidden text-xs">
            {(["active", "completed", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-vault-accent text-white"
                    : "text-vault-text-muted hover:bg-vault-card"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Space filter */}
          {spacesWithGoals.length > 1 && (
            <select
              value={spaceFilter}
              onChange={(e) => setSpaceFilter(e.target.value)}
              className="input-base text-xs py-1.5 pr-7"
            >
              <option value="all">All spaces</option>
              {spacesWithGoals.map((id) => (
                <option key={id} value={id}>{spaceName(id)}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setEditGoal("new")}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Goal
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-vault-text-muted">
            <Target className="w-12 h-12 opacity-20" />
            <div className="text-center">
              <p className="font-semibold">No goals yet</p>
              <p className="text-sm mt-1">Use SMART goals to turn your intentions into measurable outcomes.</p>
            </div>
            <button
              onClick={() => setEditGoal("new")}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create your first goal
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {[...grouped.entries()].map(([spaceId, goals]) => (
              <div key={spaceId}>
                <h3 className="text-xs font-semibold text-vault-text-muted uppercase tracking-wider mb-3">
                  {spaceName(spaceId)}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      spaceName={spaceName(goal.space)}
                      progress={getProgress(goal)}
                      isOverdue={!!goal.due && goal.due < today && goal.status === "active"}
                      onClick={() => setEditGoal(goal)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editGoal !== null && (
        <GoalModal
          goal={editGoal === "new" ? null : editGoal}
          onClose={() => setEditGoal(null)}
        />
      )}
    </div>
  );
}
