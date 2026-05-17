import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useAppStore } from "@/stores/appStore";
import { useLlm, findTaskByTitle, type TaskAction } from "@/hooks/useLlm";
import { useVault } from "@/hooks/useVault";
import type { SpaceNote, Task } from "@/types";

interface Props {
  spaceId: string;
  spaceName: string;
  notes: SpaceNote[];
  tasks: Task[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  action: TaskAction;
  task: Task | null;
  label: string;
}

function renderMarkdown(text: string): string {
  try {
    const raw = marked.parse(text) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  } catch {
    return text;
  }
}

export function SpaceChat({ spaceId: _spaceId, spaceName, notes, tasks }: Props) {
  const { llmConnected, updateTask } = useAppStore();
  const { spacePlanningChat } = useLlm();
  const { saveTask } = useVault();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { cancelStreamRef.current?.(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer, pendingActions]);

  // Build history for the LLM (all messages except the current streaming one)
  const historyFor = (msgs: Message[]) =>
    msgs.map((m) => ({ role: m.role, content: m.content }));

  const resolveActions = useCallback((actions: TaskAction[]): PendingAction[] => {
    const allTasks = useAppStore.getState().tasks;
    return actions
      .filter((a) => ["create_task", "set_due", "set_priority", "set_status", "set_owner", "archive"].includes(a.type))
      .map((action) => {
        if (action.type === "create_task") {
          const dup = findTaskByTitle(allTasks, action.titleMatch);
          return {
            action,
            task: dup ?? null,
            label: dup
              ? `DUPLICATE: "${action.titleMatch}" already exists — will skip`
              : `Create task: "${action.titleMatch}" (${action.project || "general"}, ${action.priority || "medium"})`,
          };
        }
        const task = findTaskByTitle(allTasks, action.titleMatch);
        const labels: Record<string, string> = { set_due: "Set due date", set_priority: "Set priority", set_status: "Set status", set_owner: "Assign to", archive: "Archive" };
        return {
          action,
          task,
          label: task
            ? `${labels[action.type]}: "${task.title}" → ${action.value || "archived"}`
            : `${labels[action.type]}: "${action.titleMatch}" (not found)`,
        };
      });
  }, []);

  const applyActions = useCallback(
    async (pending: PendingAction[]) => {
      const results: string[] = [];
      for (const p of pending) {
        if (p.action.type === "create_task") {
          const allTasks = useAppStore.getState().tasks;
          const dup = findTaskByTitle(allTasks, p.action.titleMatch);
          if (dup && !dup.archived) {
            results.push(`Skipped (duplicate): "${p.action.titleMatch}"`);
            continue;
          }
          const newTask: Task = {
            id: `task_${crypto.randomUUID()}`,
            title: p.action.titleMatch,
            status: "todo",
            priority: (p.action.priority as Task["priority"]) || "medium",
            urgency: "ongoing",
            project: p.action.project || "general",
            owner: p.action.owner || "",
            collaborators: [],
            source: "space-chat",
            source_quote: "",
            created: new Date().toISOString().split("T")[0],
            due: "",
            estimated_hours: 0,
            actual_hours: 0,
            blocked_by: [],
            subtasks: [],
            notes: "",
            archived: false,
            time_only: false,
          };
          try {
            await saveTask(newTask);
            results.push(`Created: "${newTask.title}"`);
          } catch {
            results.push(`Failed to create: "${newTask.title}"`);
          }
          await new Promise((r) => setTimeout(r, 15));
          continue;
        }

        if (!p.task) {
          results.push(`Not found: "${p.action.titleMatch}"`);
          continue;
        }

        let updates: Partial<Task> = {};
        switch (p.action.type) {
          case "set_due":       updates = { due: p.action.value }; break;
          case "set_priority":  updates = { priority: p.action.value as Task["priority"] }; break;
          case "set_status":    updates = { status: p.action.value as Task["status"] }; break;
          case "set_owner":     updates = { owner: p.action.value }; break;
          case "archive":       updates = { archived: true, status: "done" }; break;
        }
        if (Object.keys(updates).length > 0) {
          updateTask(p.task.id, updates);
          const full: Task = { ...p.task, archived: p.task.archived ?? false, time_only: p.task.time_only ?? false, ...updates };
          try {
            await saveTask(full);
            results.push(`Done: "${p.task.title}"`);
          } catch {
            results.push(`Failed: "${p.task.title}"`);
          }
        }
      }
      setPendingActions([]);
      setApplyResult(results.join(" · "));
      setTimeout(() => setApplyResult(null), 6000);
    },
    [updateTask, saveTask]
  );

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;

    const history = historyFor(messages);
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setStreaming(true);
    setStreamBuffer("");
    setPendingActions([]);
    setApplyResult(null);

    cancelStreamRef.current?.();
    let fullText = "";
    try {
      const cancel = await spacePlanningChat(
        msg,
        history,
        spaceName,
        notes,
        tasks,
        (chunk) => { fullText += chunk; setStreamBuffer(fullText); },
        () => {  // onDone — immediately unblock UI
          setMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
          setStreamBuffer("");
          setStreaming(false);
        },
        (actions) => {  // onActions — deferred after extraction
          if (actions.length > 0) {
            setPendingActions(resolveActions(actions));
          }
        }
      );
      cancelStreamRef.current = cancel;
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${String(err)}` },
      ]);
      setStreamBuffer("");
      setStreaming(false);
    }
  }, [input, streaming, messages, spacePlanningChat, spaceName, notes, tasks, resolveActions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Connection guard
  if (!llmConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-vault-text-muted opacity-30" />
          <p className="text-sm text-vault-text-muted">LM Studio not connected.</p>
          <p className="text-xs text-vault-text-muted mt-1">Check Settings to configure the AI endpoint.</p>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center pt-12">
            <div className="w-12 h-12 rounded-2xl bg-vault-accent/10 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-vault-accent" />
            </div>
            <p className="text-sm font-medium text-vault-text-bright">Ask about {spaceName}</p>
            <p className="text-xs text-vault-text-muted mt-1 max-w-xs">
              Notes, tasks, meetings — I have full context for this space.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {["What are my open tasks?", "Summarize last week's notes", "Any blockers?"].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 rounded-full bg-vault-card border border-vault-border text-vault-text-muted hover:text-vault-text hover:border-vault-accent/40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={
                msg.role === "user"
                  ? "max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-vault-accent text-white text-sm"
                  : "max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-vault-card border border-vault-border text-sm prose-vault"
              }
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-vault-card border border-vault-border text-sm prose-vault">
              {streamBuffer ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamBuffer) }} />
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-vault-text-muted" />
              )}
              {streamBuffer && <span className="animate-pulse text-vault-accent">▌</span>}
            </div>
          </div>
        )}

        {/* Action confirmation card */}
        {pendingActions.length > 0 && (
          <div className="card-base p-4 border-vault-accent/30 bg-vault-accent/5 space-y-3">
            <p className="text-xs font-semibold text-vault-accent">Suggested changes</p>
            <ul className="space-y-1">
              {pendingActions.map((p, i) => (
                <li key={i} className="text-xs text-vault-text-muted flex items-start gap-1.5">
                  <span className="mt-0.5 text-vault-accent">✦</span>
                  {p.label}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => applyActions(pendingActions)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-vault-accent text-white hover:bg-vault-accent/90 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" /> Apply
              </button>
              <button
                onClick={() => setPendingActions([])}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-vault-card border border-vault-border text-vault-text-muted hover:text-vault-text transition-colors"
              >
                <XCircle className="w-3 h-3" /> Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Apply result banner */}
        {applyResult && (
          <div className="text-xs text-vault-success bg-vault-success/5 border border-vault-success/20 rounded-lg px-3 py-2">
            {applyResult}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="border-t border-vault-border px-6 py-3">
        <div className="flex items-end gap-2 bg-vault-card border border-vault-border rounded-2xl px-4 py-2 focus-within:border-vault-accent/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${spaceName}…`}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-vault-text placeholder:text-vault-text-muted max-h-32 overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 w-8 h-8 rounded-xl bg-vault-accent text-white flex items-center justify-center disabled:opacity-40 hover:bg-vault-accent/90 transition-colors"
          >
            {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-vault-text-muted mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
