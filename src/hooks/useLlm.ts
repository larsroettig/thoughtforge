import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import type { ChatMessage, Task } from "@/types";
import { getNonWorkingDays, isWorkingDay } from "@/lib/holidays";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting action items from meeting transcripts.

Given a transcript, extract ALL action items, tasks, commitments, and follow-ups.

For each item, provide:
- title: Clear, concise task description
- owner: Who is responsible (use the name mentioned, or "Unknown")
- priority: critical | high | medium | low
- urgency: today | this_week | next_2weeks | ongoing
- project: Best-guess project tag (lowercase, hyphenated)
- due: Due date if mentioned (YYYY-MM-DD format), or empty string
- source_quote: Brief quote from the transcript that contains this action item
- subtasks: Array of subtask strings if the item can be broken down

Respond ONLY with a valid JSON array of objects. No markdown, no explanation.
Example:
[{"title":"Review quarterly report","owner":"Alice","priority":"high","urgency":"this_week","project":"marketing","due":"2026-05-14","source_quote":"I will send the report today","subtasks":[]}]`;

const PLANNING_SYSTEM_PROMPT = `You are ThoughtForge, a personal AI planning assistant that can READ and MODIFY the user's task board. Today's date is provided in the context.

## Capabilities
You can help the user by:
- Answering questions about their projects and commitments
- Prioritizing and organizing tasks
- Planning their day or week
- **CHANGING tasks** (priority, due date, status, owner) when the user asks

## How to change tasks
When the user asks you to change something on a task, you MUST include action blocks in your response. Put each action on its own line using this exact format:

[[ACTION: set_due | task_title_substring | YYYY-MM-DD]]
[[ACTION: set_priority | task_title_substring | critical/high/medium/low]]
[[ACTION: set_status | task_title_substring | todo/in_progress/review/done/blocked]]
[[ACTION: set_owner | task_title_substring | Owner Name]]
[[ACTION: archive | task_title_substring]]

The task_title_substring is a unique part of the task title (case-insensitive match). Use enough of the title to uniquely identify it.

## How to create NEW tasks
When the user asks you to create a task, add a to-do, or when planning suggests new work:

[[ACTION: create_task | Task Title | project_id | priority | owner]]

- project_id: lowercase hyphenated project name (e.g. "hackathon", "ai-team"), or "general" if unsure
- priority: critical/high/medium/low
- owner: name of the person, or empty if unassigned

Examples:
- User: "create a task to review the contract" -> [[ACTION: create_task | Review the contract | general | medium | ]]
- User: "add a high priority task for the hackathon demo" -> [[ACTION: create_task | Prepare hackathon demo | hackathon | high | ]]
- User: "remind me to book flights" -> [[ACTION: create_task | Book flights | personal | medium | ]]

## Examples for modifying tasks:
- User: "set quarterly report to high priority" -> [[ACTION: set_priority | quarterly report | high]]
- User: "make the review task due today" -> [[ACTION: set_due | review task | 2026-05-12]]
- User: "mark design mockup as in progress" -> [[ACTION: set_status | design mockup | in_progress]]
- User: "assign the Jira task to Bob" -> [[ACTION: set_owner | Jira | Bob]]

## Planning with actions
When planning a day or week, use set_due on EXISTING tasks. Create new tasks only if the user explicitly asks.

CRITICAL RULES FOR SCHEDULING:
- NEVER schedule tasks on non-working days (weekends or public holidays)
- The context includes a list of non-working days for the current period
- If a task is currently due on a non-working day, move it to the next working day
- Saturday and Sunday are ALWAYS non-working days
- MAXIMUM 3-5 tasks per day. If a day has too many, move lower-priority tasks to the next day or clear their due date
- The context shows "Workload per day" -- respect the capacity limits
- To REMOVE a due date (unschedule a task), use: [[ACTION: set_due | task_title | ]]  (empty value clears the date)

When the user asks to plan their day (/plan-day):
1. Check if today is a working day. If not, say so and plan for the next working day instead
2. Look at overdue, due-today, and high-priority tasks
3. Pick ONLY 3-5 tasks for today (or next working day) -- do not overload
4. If today already has more than 5 tasks, move lower-priority ones to tomorrow or clear their dates
5. Set their due dates using [[ACTION: set_due | ... | YYYY-MM-DD]]
6. For tasks that are too much: [[ACTION: set_due | task_title | ]]  to clear the date
7. Present the plan clearly, explain what was deferred and why

When the user asks to plan their week (/plan-week):
1. Look at all open tasks, deadlines, priorities
2. Distribute tasks across WORKING DAYS ONLY (skip weekends and holidays listed in context)
3. MAX 3-5 tasks per day -- if there are more tasks than available slots, defer lower-priority tasks (clear their due dates)
4. Set due dates using [[ACTION: set_due | ... | YYYY-MM-DD]] for each scheduled task
5. For deferred tasks: [[ACTION: set_due | task_title | ]]  to clear overloaded dates
6. Present the day-by-day plan with only working days
7. List deferred tasks separately at the end as "Backlog (unscheduled)"

IMPORTANT:
- Always include [[ACTION:...]] blocks when modifying or creating tasks
- Put actions AFTER your explanation text, not before
- You can include multiple actions in one response
- Always confirm what you changed in your text response
- If you can't find a matching task, say so instead of guessing
- For create_task: the task is created as "todo" status with urgency "ongoing" and due date empty
- To clear a due date, set value to empty string: [[ACTION: set_due | task_title | ]]`;

export interface TaskAction {
  type: "set_due" | "set_priority" | "set_status" | "set_owner" | "archive" | "create_task";
  titleMatch: string;
  value: string;
  // For create_task: extra fields parsed from the action
  project?: string;
  priority?: string;
  owner?: string;
}

export function parseActions(text: string): { cleanText: string; actions: TaskAction[] } {
  const actions: TaskAction[] = [];
  const lines = text.split("\n");
  const cleanLines: string[] = [];

  for (const line of lines) {
    // Match create_task: [[ACTION: create_task | Title | project | priority | owner]]
    const createMatch = line.match(/\[\[ACTION:\s*create_task\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|\]]*?)\s*\]\]/i);
    if (createMatch) {
      actions.push({
        type: "create_task",
        titleMatch: createMatch[1].trim(),
        value: createMatch[1].trim(), // title is the value for display
        project: createMatch[2].trim() || "general",
        priority: createMatch[3].trim() || "medium",
        owner: createMatch[4].trim() || "",
      });
      continue;
    }

    // Match modify actions: [[ACTION: type | title | value]]
    const match = line.match(/\[\[ACTION:\s*(set_due|set_priority|set_status|set_owner|archive)\s*\|\s*([^|]+?)\s*(?:\|\s*(.+?))?\s*\]\]/i);
    if (match) {
      actions.push({
        type: match[1] as TaskAction["type"],
        titleMatch: match[2].trim(),
        value: (match[3] || "").trim(),
      });
    } else {
      cleanLines.push(line);
    }
  }

  return {
    cleanText: cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    actions,
  };
}

export function findTaskByTitle(tasks: Task[], titleMatch: string): Task | null {
  const lower = titleMatch.toLowerCase();
  // Exact substring match first
  const exact = tasks.find((t) =>
    t.title.toLowerCase().includes(lower)
  );
  if (exact) return exact;

  // Fuzzy: try matching individual words
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;

  let bestMatch: Task | null = null;
  let bestScore = 0;

  for (const task of tasks) {
    const taskLower = task.title.toLowerCase();
    const score = words.filter((w) => taskLower.includes(w)).length / words.length;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = task;
    }
  }

  return bestMatch;
}

export function useLlm() {
  const {
    config,
    models,
    setModels,
    setLlmConnected,
    tasks,
    isProcessing,
    setIsProcessing,
  } = useAppStore();

  const checkConnection = useCallback(async () => {
    try {
      const result = await invoke<Array<{ id: string; object: string }>>(
        "list_models",
        { baseUrl: config.lm_studio_url }
      );
      setModels(result);
      setLlmConnected(true);
      return true;
    } catch {
      setLlmConnected(false);
      setModels([]);
      return false;
    }
  }, [config.lm_studio_url, setModels, setLlmConnected]);

  const chatCompletion = useCallback(
    async (messages: ChatMessage[]): Promise<string> => {
      const result = await invoke<string>("chat_completion", {
        baseUrl: config.lm_studio_url,
        model: config.active_model,
        messages,
        temperature: 0.7,
        maxTokens: 4096,
      });
      return result;
    },
    [config.lm_studio_url, config.active_model]
  );

  const streamChat = useCallback(
    async (
      messages: ChatMessage[],
      onChunk: (text: string) => void,
      onDone: () => void
    ): Promise<void> => {
      const streamId = `${Date.now()}`;

      const unlisten1 = await listen<string>(
        `stream-chunk-${streamId}`,
        (event) => {
          onChunk(event.payload);
        }
      );

      const unlisten2 = await listen(`stream-done-${streamId}`, () => {
        onDone();
        unlisten1();
        unlisten2();
      });

      await invoke("stream_chat", {
        baseUrl: config.lm_studio_url,
        model: config.active_model,
        messages,
        temperature: 0.7,
        maxTokens: 4096,
        streamId,
      });
    },
    [config.lm_studio_url, config.active_model]
  );

  const extractTasksFromText = useCallback(
    async (text: string, sourceName: string): Promise<Partial<Task>[]> => {
      setIsProcessing(true);
      try {
        const MAX_CHUNK_SIZE = 12000;
        const chunks: string[] = [];

        if (text.length <= MAX_CHUNK_SIZE) {
          chunks.push(text);
        } else {
          const paragraphs = text.split(/\n\n+/);
          let current = "";
          for (const para of paragraphs) {
            if (current.length + para.length > MAX_CHUNK_SIZE) {
              if (current) chunks.push(current);
              current = para;
            } else {
              current += (current ? "\n\n" : "") + para;
            }
          }
          if (current) chunks.push(current);
        }

        const allTasks: Partial<Task>[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const messages: ChatMessage[] = [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Extract action items from this transcript (part ${i + 1}/${chunks.length}):\n\n${chunks[i]}`,
            },
          ];

          const response = await chatCompletion(messages);

          try {
            let jsonStr = response.trim();
            if (jsonStr.startsWith("```")) {
              jsonStr = jsonStr.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
            }
            const extracted = JSON.parse(jsonStr) as Array<Record<string, unknown>>;

            for (const item of extracted) {
              const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              allTasks.push({
                id,
                title: (item.title as string) || "",
                status: "todo",
                priority: (item.priority as Task["priority"]) || "medium",
                urgency: (item.urgency as Task["urgency"]) || "ongoing",
                project: (item.project as string) || "",
                owner: (item.owner as string) || "",
                collaborators: [],
                source: sourceName,
                source_quote: (item.source_quote as string) || "",
                created: new Date().toISOString().split("T")[0],
                due: (item.due as string) || "",
                estimated_hours: 0,
                actual_hours: 0,
                blocked_by: [],
                subtasks: (item.subtasks as string[]) || [],
                notes: "",
              });
            }
          } catch {
            console.warn("Failed to parse LLM extraction response for chunk", i);
          }
        }

        return allTasks;
      } finally {
        setIsProcessing(false);
      }
    },
    [chatCompletion, setIsProcessing]
  );

  const buildContextPrompt = useCallback((): string => {
    const today = new Date().toISOString().split("T")[0];
    const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const country = config.country || "DE";

    const activeTasks = tasks.filter((t) => !t.archived);
    const openTasks = activeTasks.filter((t) => t.status !== "done");
    const overdue = openTasks.filter((t) => t.due && t.due < today);
    const dueToday = openTasks.filter((t) => t.due === today);

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 14); // Look 2 weeks ahead
    const weekEndStr = weekEnd.toISOString().split("T")[0];
    const dueThisWeek = openTasks.filter(
      (t) => t.due && t.due >= today && t.due <= weekEndStr
    );

    // Non-working days in the next 2 weeks
    const nonWorkingDays = getNonWorkingDays(today, weekEndStr, country);
    const nonWorkingStr = nonWorkingDays
      .map((d) => `- ${d.date} (${d.name})`)
      .join("\n");

    // Tasks scheduled on non-working days (need rescheduling)
    const tasksOnNonWorking = openTasks.filter(
      (t) => t.due && !isWorkingDay(t.due, country)
    );

    // Build workload per day for the next 2 weeks
    const workloadByDay: Record<string, { count: number; hours: number; tasks: string[] }> = {};
    for (const t of openTasks) {
      if (t.due) {
        if (!workloadByDay[t.due]) workloadByDay[t.due] = { count: 0, hours: 0, tasks: [] };
        workloadByDay[t.due].count++;
        workloadByDay[t.due].hours += t.estimated_hours || 1;
        workloadByDay[t.due].tasks.push(t.title);
      }
    }

    const overloadedDays = Object.entries(workloadByDay)
      .filter(([, w]) => w.count > 5)
      .map(([date, w]) => `- ${date}: ${w.count} tasks, ~${w.hours.toFixed(1)}h (OVERLOADED -- max 5)`)
      .join("\n");

    const workloadStr = Object.entries(workloadByDay)
      .filter(([date]) => date >= today)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 14)
      .map(([date, w]) => {
        const isWorking = isWorkingDay(date, country);
        return `- ${date}: ${w.count} tasks, ~${w.hours.toFixed(1)}h${!isWorking ? " (NON-WORKING DAY!)" : ""}${w.count > 5 ? " OVERLOADED" : ""}`;
      })
      .join("\n");

    const taskSummary = openTasks
      .map(
        (t) =>
          `- [${t.status}] "${t.title}" (${t.priority}) owner:${t.owner || "unassigned"} project:${t.project || "none"}${t.due ? ` due:${t.due}` : " no-date"}${t.estimated_hours ? ` est:${t.estimated_hours}h` : ""}${t.actual_hours ? ` tracked:${t.actual_hours}h` : ""}`
      )
      .join("\n");

    const projects = [...new Set(openTasks.map((t) => t.project).filter(Boolean))];
    const unscheduled = openTasks.filter((t) => !t.due).length;
    const todayIsWorking = isWorkingDay(today, country);

    return `## Context
Today: ${today} (${weekday})${!todayIsWorking ? " -- NON-WORKING DAY" : ""}
Country: ${country}

## Board Summary
Open tasks: ${openTasks.length} (${unscheduled} unscheduled)
Overdue: ${overdue.length}
Due today: ${dueToday.length}
Due next 2 weeks: ${dueThisWeek.length}
Projects: ${projects.join(", ") || "none"}

## Workload per day (next 2 weeks):
${workloadStr || "(no tasks scheduled)"}
${overloadedDays ? `\n## WARNING: Overloaded days (more than 5 tasks):\n${overloadedDays}\nRemove due dates from lower-priority tasks on these days!\n` : ""}
## Non-Working Days (next 2 weeks):
${nonWorkingStr || "(none -- all days are working days)"}

${tasksOnNonWorking.length > 0 ? `## WARNING: Tasks on non-working days (MUST reschedule):\n${tasksOnNonWorking.map((t) => `- "${t.title}" due:${t.due} -- RESCHEDULE to next working day`).join("\n")}\n` : ""}
${overdue.length > 0 ? `### Overdue Tasks:\n${overdue.map((t) => `- "${t.title}" (due:${t.due}, ${t.priority}) owner:${t.owner}`).join("\n")}\n` : ""}
${dueToday.length > 0 ? `### Due Today:\n${dueToday.map((t) => `- "${t.title}" (${t.priority}) owner:${t.owner}`).join("\n")}\n` : ""}
### All Open Tasks:
${taskSummary || "(no tasks yet)"}`;
  }, [tasks, config.country]);

  const planningChat = useCallback(
    async (
      userMessage: string,
      history: ChatMessage[],
      onChunk: (text: string) => void,
      onDone: () => void
    ) => {
      const contextPrompt = buildContextPrompt();
      const systemMessage: ChatMessage = {
        role: "system",
        content: `${PLANNING_SYSTEM_PROMPT}\n\n${contextPrompt}`,
      };

      const messages: ChatMessage[] = [
        systemMessage,
        ...history,
        { role: "user", content: userMessage },
      ];

      await streamChat(messages, onChunk, onDone);
    },
    [buildContextPrompt, streamChat]
  );

  return {
    checkConnection,
    chatCompletion,
    streamChat,
    extractTasksFromText,
    planningChat,
    isProcessing,
  };
}
