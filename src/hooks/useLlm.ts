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

const PLANNING_SYSTEM_PROMPT = `You are ThoughtForge, a task planning assistant. You can read and modify the user's task board.

## Actions (put AFTER your text, one per line)
Modify: [[ACTION: set_due | title_substring | YYYY-MM-DD]]
         [[ACTION: set_priority | title_substring | critical/high/medium/low]]
         [[ACTION: set_status | title_substring | todo/in_progress/review/done/blocked]]
         [[ACTION: set_owner | title_substring | Name]]
         [[ACTION: archive | title_substring]]
Clear date: [[ACTION: set_due | title_substring | ]]
Create: [[ACTION: create_task | Title | project_id | priority | owner]]

## Rules
- NEVER create a task if one with a similar title already exists. Modify the existing one instead.
- NEVER schedule on weekends or holidays (listed in context).
- Max 4 tasks per day. If overloaded, clear dates of low-priority tasks.
- Only create tasks when the user EXPLICITLY asks. Planning = rearranging existing tasks.
- Use enough of the title to uniquely match. Check the task list before acting.
- Be concise. Bullet points.`;

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
        value: createMatch[1].trim(),
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

  // Fallback: if no [[ACTION:...]] found, try to parse JSON response
  if (actions.length === 0) {
    const jsonActions = parseJsonResponse(text);
    if (jsonActions.length > 0) {
      // Remove JSON block from clean text
      const cleanText = text
        .replace(/```json\s*\n?[\s\S]*?\n?```/g, "")
        .replace(/\{[\s\S]*"(?:Monday|Tuesday|Wednesday|Thursday|Friday|task|due)"[\s\S]*\}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { cleanText: cleanText || "Here's your plan (see proposed changes below):", actions: jsonActions };
    }
  }

  return {
    cleanText: cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    actions,
  };
}

/**
 * Parse JSON responses from models that ignore the [[ACTION:...]] format.
 * Handles structures like:
 * { "Monday": [{ "task": "title", "due_date": "2026-05-14" }], ... }
 * or [{ "task": "title", "due_date": "...", "priority": "..." }]
 */
function parseJsonResponse(text: string): TaskAction[] {
  const actions: TaskAction[] = [];

  // Try to extract JSON from the text (might be wrapped in ```json blocks)
  let jsonStr = text;
  const codeBlockMatch = text.match(/```json?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    // Try to find a JSON object/array in the text
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      return [];
    }
  }

  try {
    const data = JSON.parse(jsonStr);

    // Format: { "Monday": [...], "Tuesday": [...], ... }
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    if (typeof data === "object" && !Array.isArray(data)) {
      for (const key of Object.keys(data)) {
        if (dayNames.some((d) => key.toLowerCase().includes(d.toLowerCase()))) {
          const dayTasks = data[key];
          if (Array.isArray(dayTasks)) {
            for (const item of dayTasks) {
              const title = item.task || item.title || item.name || "";
              const due = item.due_date || item.due || item.date || "";
              if (title && due) {
                actions.push({
                  type: "set_due",
                  titleMatch: title,
                  value: due,
                });
              }
              // Also handle priority changes
              if (item.priority) {
                actions.push({
                  type: "set_priority",
                  titleMatch: title,
                  value: item.priority,
                });
              }
            }
          }
        }
      }
    }

    // Format: [{ "task": "...", "due_date": "...", ... }]
    if (Array.isArray(data)) {
      for (const item of data) {
        const title = item.task || item.title || item.name || "";
        const due = item.due_date || item.due || item.date || "";
        if (title && due) {
          actions.push({ type: "set_due", titleMatch: title, value: due });
        }
        if (title && item.priority) {
          actions.push({ type: "set_priority", titleMatch: title, value: item.priority });
        }
        if (title && item.status) {
          actions.push({ type: "set_status", titleMatch: title, value: item.status });
        }
      }
    }
  } catch {
    // Not valid JSON, ignore
  }

  return actions;
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

    const todayIsWorking = isWorkingDay(today, country);
    const projects = [...new Set(openTasks.map((t) => t.project).filter(Boolean))];

    // Only include RELEVANT tasks (max 30) -- prioritize overdue, due soon, high priority
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const relevantTasks = [...openTasks]
      .sort((a, b) => {
        // Overdue first
        if (a.due && a.due < today && !(b.due && b.due < today)) return -1;
        if (b.due && b.due < today && !(a.due && a.due < today)) return 1;
        // Due soon next
        if (a.due && b.due) {
          const cmp = a.due.localeCompare(b.due);
          if (cmp !== 0) return cmp;
        }
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        // Then by priority
        return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      })
      .slice(0, 30);

    const taskLines = relevantTasks
      .map((t) => `- "${t.title}" [${t.status}] ${t.priority}${t.due ? ` due:${t.due}` : ""} project:${t.project || "-"}`)
      .join("\n");

    // Compact non-working days (only holidays, weekends are implied)
    const holidays = nonWorkingDays.filter((d) => d.name !== "Saturday" && d.name !== "Sunday");
    const holidayStr = holidays.length > 0
      ? holidays.map((d) => `${d.date} ${d.name}`).join(", ")
      : "none";

    return `Today: ${today} (${weekday})${!todayIsWorking ? " NON-WORKING" : ""} | Country: ${country}
Open: ${openTasks.length} | Overdue: ${overdue.length} | Due today: ${dueToday.length}
Projects: ${projects.join(", ") || "none"}
Holidays (next 2wk): ${holidayStr}
${tasksOnNonWorking.length > 0 ? `Tasks on non-working days: ${tasksOnNonWorking.map((t) => `"${t.title}" ${t.due}`).join(", ")}\n` : ""}
Tasks (top ${relevantTasks.length} of ${openTasks.length}):
${taskLines || "(none)"}`;
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
