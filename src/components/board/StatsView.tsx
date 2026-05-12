import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Flame,
  FolderOpen,
  ListChecks,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import type { Task, StatusColors } from "@/types";
import { PROJECT_COLORS, DEFAULT_STATUS_COLORS } from "@/types";

function getWeekDates(offset: number): { start: Date; end: Date; days: Date[] } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const end = new Date(days[6]);
  end.setHours(23, 59, 59, 999);

  return { start: monday, end, days };
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function StatsView() {
  const { tasks, projectSpaces, config } = useAppStore();
  const sc: StatusColors = { ...DEFAULT_STATUS_COLORS, ...(config.status_colors || {}) };
  const [weekOffset, setWeekOffset] = useState(0);

  const { start, end, days } = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const allTasks = tasks.filter((t) => !t.archived);

  // Tasks completed this week
  const completedThisWeek = useMemo(() => {
    const s = fmt(start);
    const e = fmt(end);
    // A task counts as "completed this week" if status is done and created date is within range
    // Since we don't track completion date, use tasks that are done
    // For better accuracy, we'd need a completed_at field -- for now use created date as proxy
    return allTasks.filter((t) => t.status === "done");
  }, [allTasks, start, end]);

  // Hours by project (from space timeEntries)
  const hoursByProject = useMemo(() => {
    const s = fmt(start);
    const e = fmt(end);
    const map: Record<string, number> = {};

    for (const space of projectSpaces) {
      const entries = (space.timeEntries || []).filter(
        (te) => te.date >= s && te.date <= e
      );
      const total = entries.reduce((sum, te) => sum + te.hours, 0);
      if (total > 0) map[space.name] = total;
    }

    // Also add task tracked hours
    for (const t of allTasks) {
      if (t.actual_hours > 0) {
        const proj = t.project || "Unassigned";
        const name = projectSpaces.find((s) => s.id === proj)?.name || proj;
        map[name] = (map[name] || 0) + t.actual_hours;
      }
    }

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [projectSpaces, allTasks, start, end]);

  const totalHoursThisWeek = hoursByProject.reduce((s, [, h]) => s + h, 0);

  // Tasks by status
  const statusCounts = useMemo(() => {
    const counts = { todo: 0, in_progress: 0, review: 0, done: 0, blocked: 0 };
    for (const t of allTasks) {
      counts[t.status]++;
    }
    return counts;
  }, [allTasks]);

  // Tasks by project
  const tasksByProject = useMemo(() => {
    const map: Record<string, { open: number; done: number; total: number }> = {};
    for (const t of allTasks) {
      const p = t.project || "Unassigned";
      if (!map[p]) map[p] = { open: 0, done: 0, total: 0 };
      map[p].total++;
      if (t.status === "done") map[p].done++;
      else map[p].open++;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [allTasks]);

  // Daily activity (tasks with due date on each day)
  const dailyActivity = useMemo(() => {
    return days.map((d) => {
      const dateStr = fmt(d);
      const due = allTasks.filter((t) => t.due === dateStr);
      const done = due.filter((t) => t.status === "done").length;
      const open = due.filter((t) => t.status !== "done").length;

      // Hours booked on this day
      let hours = 0;
      for (const space of projectSpaces) {
        for (const te of space.timeEntries || []) {
          if (te.date === dateStr) hours += te.hours;
        }
      }

      return { date: d, dateStr, due: due.length, done, open, hours };
    });
  }, [days, allTasks, projectSpaces]);

  const maxDailyTasks = Math.max(...dailyActivity.map((d) => d.due), 1);
  const maxDailyHours = Math.max(...dailyActivity.map((d) => d.hours), 1);

  // Streak: consecutive days with at least 1 completed task
  const streak = useMemo(() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = fmt(d);
      const hasDone = allTasks.some((t) => t.status === "done" && t.due === dateStr);
      if (hasDone || i === 0) count++;
      else break;
    }
    return count;
  }, [allTasks]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-vault-accent" />
            <div>
              <h2 className="text-xl font-bold text-vault-text-bright">Weekly Review</h2>
              <p className="text-xs text-vault-text-muted">{weekLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="btn-ghost p-1.5">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className={`btn-ghost text-xs px-3 ${weekOffset === 0 ? "text-vault-accent" : ""}`}
            >
              This Week
            </button>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="btn-ghost p-1.5">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card-base p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1" style={{ color: sc.done }} />
            <p className="text-3xl font-bold text-vault-text-bright">{statusCounts.done}</p>
            <p className="text-[10px] text-vault-text-muted">Tasks Completed</p>
          </div>
          <div className="card-base p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-vault-accent" />
            <p className="text-3xl font-bold text-vault-text-bright">{totalHoursThisWeek.toFixed(1)}h</p>
            <p className="text-[10px] text-vault-text-muted">Hours Logged</p>
          </div>
          <div className="card-base p-4 text-center">
            <ListChecks className="w-5 h-5 mx-auto mb-1" style={{ color: sc.todo }} />
            <p className="text-3xl font-bold text-vault-text-bright">{statusCounts.todo + statusCounts.in_progress}</p>
            <p className="text-[10px] text-vault-text-muted">Open Tasks</p>
          </div>
          <div className="card-base p-4 text-center">
            <Flame className="w-5 h-5 mx-auto mb-1 text-vault-orange" />
            <p className="text-3xl font-bold text-vault-text-bright">{streak}</p>
            <p className="text-[10px] text-vault-text-muted">Day Streak</p>
          </div>
        </div>

        {/* Daily Activity Chart */}
        <div className="card-base p-5">
          <h3 className="text-sm font-semibold text-vault-text-bright mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-vault-accent" />
            Daily Activity
          </h3>
          <div className="flex items-end gap-3 h-32">
            {dailyActivity.map((day) => {
              const isToday = day.dateStr === fmt(new Date());
              const taskHeight = maxDailyTasks > 0 ? (day.due / maxDailyTasks) * 100 : 0;
              const hourHeight = maxDailyHours > 0 ? (day.hours / maxDailyHours) * 100 : 0;

              return (
                <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1">
                  {/* Bars */}
                  <div className="flex gap-0.5 items-end h-24 w-full">
                    {/* Tasks bar */}
                    <div
                      className="flex-1 rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(taskHeight, 4)}%`,
                        backgroundColor: day.done > 0 ? sc.done : sc.todo,
                        opacity: day.due > 0 ? 1 : 0.15,
                      }}
                      title={`${day.due} tasks (${day.done} done)`}
                    />
                    {/* Hours bar */}
                    <div
                      className="flex-1 rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(hourHeight, 4)}%`,
                        backgroundColor: "var(--vault-accent)",
                        opacity: day.hours > 0 ? 0.7 : 0.1,
                      }}
                      title={`${day.hours.toFixed(1)}h`}
                    />
                  </div>
                  {/* Label */}
                  <span className={`text-[10px] ${isToday ? "text-vault-accent font-bold" : "text-vault-text-muted"}`}>
                    {dayLabel(day.date)}
                  </span>
                  {day.hours > 0 && (
                    <span className="text-[9px] text-vault-text-muted">{day.hours.toFixed(1)}h</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-vault-text-muted">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: sc.done }} />
              Tasks
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-vault-accent opacity-70" />
              Hours
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Hours by Project */}
          <div className="card-base p-5">
            <h3 className="text-sm font-semibold text-vault-text-bright mb-4 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-vault-accent" />
              Hours by Project
            </h3>
            {hoursByProject.length === 0 ? (
              <p className="text-xs text-vault-text-muted py-4">No hours logged this week. Use the timer or book hours in a space.</p>
            ) : (
              <div className="space-y-3">
                {hoursByProject.map(([name, hours]) => {
                  const pct = totalHoursThisWeek > 0 ? (hours / totalHoursThisWeek) * 100 : 0;
                  const space = projectSpaces.find((s) => s.name === name);
                  const color = space ? (PROJECT_COLORS[space.id] || space.color) : PROJECT_COLORS.default;
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs text-vault-text">{name}</span>
                        </div>
                        <span className="text-xs font-semibold text-vault-text-bright">{hours.toFixed(1)}h</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-vault-border overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tasks by Project */}
          <div className="card-base p-5">
            <h3 className="text-sm font-semibold text-vault-text-bright mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-vault-accent" />
              Tasks by Project
            </h3>
            <div className="space-y-2.5">
              {tasksByProject.map(([projId, info]) => {
                const space = projectSpaces.find((s) => s.id === projId);
                const name = space?.name || projId;
                const color = space ? (PROJECT_COLORS[space.id] || space.color) : PROJECT_COLORS.default;
                const pct = info.total > 0 ? (info.done / info.total) * 100 : 0;
                return (
                  <div key={projId}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-xs text-vault-text">{name}</span>
                      </div>
                      <span className="text-[10px] text-vault-text-muted">
                        {info.done}/{info.total} done
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-vault-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="card-base p-5">
          <h3 className="text-sm font-semibold text-vault-text-bright mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-vault-accent" />
            Task Status Breakdown
          </h3>
          <div className="flex gap-3 h-4 rounded-full overflow-hidden bg-vault-border">
            {statusCounts.done > 0 && (
              <div
                className="h-full rounded-full"
                style={{ width: `${(statusCounts.done / allTasks.length) * 100}%`, backgroundColor: sc.done }}
                title={`Done: ${statusCounts.done}`}
              />
            )}
            {statusCounts.in_progress > 0 && (
              <div
                className="h-full"
                style={{ width: `${(statusCounts.in_progress / allTasks.length) * 100}%`, backgroundColor: sc.in_progress }}
                title={`In Progress: ${statusCounts.in_progress}`}
              />
            )}
            {statusCounts.review > 0 && (
              <div
                className="h-full"
                style={{ width: `${(statusCounts.review / allTasks.length) * 100}%`, backgroundColor: sc.review }}
                title={`Review: ${statusCounts.review}`}
              />
            )}
            {statusCounts.todo > 0 && (
              <div
                className="h-full"
                style={{ width: `${(statusCounts.todo / allTasks.length) * 100}%`, backgroundColor: sc.todo }}
                title={`To Do: ${statusCounts.todo}`}
              />
            )}
            {statusCounts.blocked > 0 && (
              <div
                className="h-full"
                style={{ width: `${(statusCounts.blocked / allTasks.length) * 100}%`, backgroundColor: sc.blocked }}
                title={`Blocked: ${statusCounts.blocked}`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-vault-text-muted flex-wrap">
            {(["done", "in_progress", "review", "todo", "blocked"] as const).map((s) => (
              statusCounts[s] > 0 && (
                <div key={s} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: sc[s] }} />
                  {s.replace("_", " ")}: {statusCounts[s]}
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
