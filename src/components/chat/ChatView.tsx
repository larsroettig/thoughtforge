import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  Plus,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useLlm, parseActions, findTaskByTitle, type TaskAction } from "@/hooks/useLlm";
import { useVault } from "@/hooks/useVault";
import type { ChatMessage, Task } from "@/types";

const SLASH_COMMANDS = [
  { cmd: "/plan-day", desc: "Plan your day: top priorities, time blocks, goals" },
  { cmd: "/plan-week", desc: "Plan your week: day-by-day breakdown with daily goals" },
  { cmd: "/status", desc: "Overview of all projects and blockers" },
  { cmd: "/blocked", desc: "Show all blocked or overdue items" },
  { cmd: "/extract", desc: "Extract action items from pasted text" },
  { cmd: "/summarize", desc: "Summarize a project's status" },
  { cmd: "/prioritize", desc: "Suggest task priority ordering" },
  { cmd: "/refine", desc: "Break a task into subtasks" },
];

interface PendingAction {
  action: TaskAction;
  task: Task | null;
  label: string;
}

interface ActionResult {
  action: TaskAction;
  taskTitle: string;
  success: boolean;
}

export function ChatView() {
  const {
    chatSessions,
    activeChatId,
    setActiveChatId,
    createChatSession,
    addChatMessage,
    llmConnected,
    tasks,
    updateTask,
    config,
    models,
    setView,
  } = useAppStore();
  const { saveTask } = useVault();
  const { planningChat, checkConnection } = useLlm();

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);

  // Confirmation flow state
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [actionResults, setActionResults] = useState<ActionResult[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = chatSessions.find((s) => s.id === activeChatId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, streamingContent, pendingActions, actionResults, scrollToBottom]);

  // Resolve actions from LLM text (but don't apply -- just prepare for confirmation)
  const resolveActions = useCallback(
    (fullText: string): PendingAction[] => {
      const { actions } = parseActions(fullText);
      if (actions.length === 0) return [];

      const currentTasks = useAppStore.getState().tasks;

      return actions.map((action) => {
        if (action.type === "create_task") {
          // For create_task, there's no existing task to match
          return {
            action,
            task: null, // null means "will create new"
            label: `Create task: "${action.titleMatch}" (${action.project || "general"}, ${action.priority || "medium"})`,
          };
        }

        const task = findTaskByTitle(currentTasks, action.titleMatch);
        const typeLabels: Record<string, string> = {
          set_due: "Set due date",
          set_priority: "Set priority",
          set_status: "Set status",
          set_owner: "Assign to",
          archive: "Archive",
        };
        const label = task
          ? `${typeLabels[action.type] || action.type}: "${task.title}" -> ${action.value || "archived"}`
          : `${typeLabels[action.type] || action.type}: "${action.titleMatch}" (not found)`;

        return { action, task, label };
      });
    },
    []
  );

  // Apply confirmed actions to vault
  const applyActions = useCallback(
    async (pending: PendingAction[]) => {
      const results: ActionResult[] = [];

      for (const p of pending) {
        // Handle create_task
        if (p.action.type === "create_task") {
          const newTask: Task = {
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title: p.action.titleMatch,
            status: "todo",
            priority: (p.action.priority as Task["priority"]) || "medium",
            urgency: "ongoing",
            project: p.action.project || "general",
            owner: p.action.owner || "",
            collaborators: [],
            source: "chat",
            source_quote: "",
            created: new Date().toISOString().split("T")[0],
            due: "",
            estimated_hours: 0,
            actual_hours: 0,
            blocked_by: [],
            subtasks: [],
            notes: "",
            archived: false,
          };
          try {
            await saveTask(newTask);
            results.push({ action: p.action, taskTitle: newTask.title, success: true });
          } catch {
            results.push({ action: p.action, taskTitle: newTask.title, success: false });
          }
          // Small delay so IDs don't collide
          await new Promise((r) => setTimeout(r, 15));
          continue;
        }

        // Modify existing task
        if (!p.task) {
          results.push({ action: p.action, taskTitle: p.action.titleMatch, success: false });
          continue;
        }

        let updates: Partial<Task> = {};

        switch (p.action.type) {
          case "set_due":
            updates = { due: p.action.value };
            break;
          case "set_priority":
            if (["critical", "high", "medium", "low"].includes(p.action.value)) {
              updates = { priority: p.action.value as Task["priority"] };
            }
            break;
          case "set_status":
            if (["todo", "in_progress", "review", "done", "blocked"].includes(p.action.value)) {
              updates = { status: p.action.value as Task["status"] };
            }
            break;
          case "set_owner":
            updates = { owner: p.action.value };
            break;
          case "archive":
            updates = { archived: true, status: "done" as const };
            break;
        }

        if (Object.keys(updates).length > 0) {
          updateTask(p.task.id, updates);
          // Ensure all fields present when saving
          const fullTask: Task = {
            ...p.task,
            archived: p.task.archived ?? false,
            ...updates,
          };
          try {
            await saveTask(fullTask);
            results.push({ action: p.action, taskTitle: p.task.title, success: true });
          } catch (err) {
            console.error("Failed to save task:", p.task.id, err);
            results.push({ action: p.action, taskTitle: p.task.title, success: false });
          }
        }
      }

      setActionResults(results);
      setPendingActions([]);
      setTimeout(() => setActionResults([]), 8000);
    },
    [updateTask, saveTask]
  );

  const handleRejectActions = useCallback(() => {
    setPendingActions([]);
    // Add a system note to chat
    const sessionId = activeChatId;
    if (sessionId) {
      addChatMessage(sessionId, {
        role: "assistant",
        content: "Changes rejected. No tasks were modified.",
      });
    }
  }, [activeChatId, addChatMessage]);

  // Common handler for finishing a streamed response
  const handleStreamDone = useCallback(
    (sessionId: string, accumulated: string) => {
      const { cleanText, actions } = parseActions(accumulated);

      // Store clean text as the message (without action blocks)
      addChatMessage(sessionId, {
        role: "assistant",
        content: cleanText,
      });
      setStreamingContent("");
      setIsStreaming(false);

      // If actions found, queue for confirmation
      if (actions.length > 0) {
        const resolved = resolveActions(accumulated);
        setPendingActions(resolved);
      }
    },
    [addChatMessage, resolveActions]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !llmConnected) return;

    let sessionId = activeChatId;
    if (!sessionId) {
      const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
      sessionId = createChatSession(title);
    }

    addChatMessage(sessionId, { role: "user", content: text });
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setPendingActions([]);
    setActionResults([]);

    const session = useAppStore.getState().chatSessions.find((s) => s.id === sessionId);
    const history = (session?.messages || []).filter((m) => m.role !== "system");

    try {
      let accumulated = "";
      await planningChat(
        text,
        history.slice(0, -1),
        (chunk) => {
          accumulated += chunk;
          // Show streaming text without action blocks
          const { cleanText } = parseActions(accumulated);
          setStreamingContent(cleanText);
        },
        () => handleStreamDone(sessionId!, accumulated)
      );
    } catch (err) {
      addChatMessage(sessionId, { role: "assistant", content: `Error: ${err}` });
      setIsStreaming(false);
      setStreamingContent("");
    }
  }, [input, isStreaming, activeChatId, llmConnected, createChatSession, addChatMessage, planningChat, handleStreamDone]);

  const handleQuickSend = useCallback(async (text: string) => {
    if (isStreaming || !llmConnected) return;

    let sessionId = activeChatId;
    if (!sessionId) {
      const title = text.slice(0, 50);
      sessionId = createChatSession(title);
    }

    addChatMessage(sessionId, { role: "user", content: text });
    setIsStreaming(true);
    setStreamingContent("");
    setPendingActions([]);
    setActionResults([]);

    const session = useAppStore.getState().chatSessions.find((s) => s.id === sessionId);
    const history = (session?.messages || []).filter((m) => m.role !== "system");

    try {
      let accumulated = "";
      await planningChat(
        text,
        history.slice(0, -1),
        (chunk) => {
          accumulated += chunk;
          const { cleanText } = parseActions(accumulated);
          setStreamingContent(cleanText);
        },
        () => handleStreamDone(sessionId!, accumulated)
      );
    } catch (err) {
      addChatMessage(sessionId, { role: "assistant", content: `Error: ${err}` });
      setIsStreaming(false);
      setStreamingContent("");
    }
  }, [isStreaming, activeChatId, llmConnected, createChatSession, addChatMessage, planningChat, handleStreamDone]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "/" && input === "") {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleSlashCommand = (cmd: string) => {
    setInput(cmd + " ");
    setShowSlashMenu(false);
    inputRef.current?.focus();
  };

  const handleNewChat = () => {
    const id = createChatSession("New chat");
    setActiveChatId(id);
    setPendingActions([]);
    setActionResults([]);
  };

  const displayMessages = activeSession?.messages || [];

  return (
    <div className="h-full flex">
      {/* Chat Sessions Sidebar */}
      <div className="w-56 border-r border-vault-border flex flex-col">
        <div className="p-3 border-b border-vault-border">
          <button
            onClick={handleNewChat}
            className="btn-ghost w-full flex items-center gap-2 justify-center text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {chatSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveChatId(session.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate ${
                activeChatId === session.id
                  ? "bg-vault-card text-vault-accent"
                  : "text-vault-text-muted hover:text-vault-text"
              }`}
            >
              <MessageSquare className="w-3 h-3 inline mr-1.5" />
              {session.title}
            </button>
          ))}
          {chatSessions.length === 0 && (
            <div className="text-center py-6 text-vault-text-muted text-xs">
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Empty state */}
          {displayMessages.length === 0 && !isStreaming && (
            <div className="flex items-center justify-center h-full">
              {/* No model loaded -- show setup message */}
              {(!llmConnected || models.length === 0 || !config.active_model) ? (
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-vault-warning/10 flex items-center justify-center mx-auto mb-5">
                    <Sparkles className="w-8 h-8 text-vault-warning" />
                  </div>
                  <h3 className="text-lg font-semibold text-vault-text-bright mb-2">
                    {!llmConnected ? "LM Studio Not Connected" : models.length === 0 ? "No Models Loaded" : "No Model Selected"}
                  </h3>
                  <p className="text-sm text-vault-text-muted mb-6 leading-relaxed">
                    {!llmConnected ? (
                      "Start LM Studio to enable AI chat, planning, and task extraction."
                    ) : models.length === 0 ? (
                      <>
                        LM Studio is connected but no models are loaded. Load a model in LM Studio or run:
                        <code className="block mt-2 text-xs bg-vault-bg rounded px-3 py-1.5 text-vault-accent font-mono">
                          lms load qwen2.5-7b-instruct
                        </code>
                      </>
                    ) : (
                      "Select a model in Settings to start using AI features."
                    )}
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => setView("settings")}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      Go to Settings
                    </button>
                    {llmConnected && (
                      <button
                        onClick={() => checkConnection()}
                        className="btn-ghost text-sm"
                      >
                        Refresh Models
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Model ready -- show planning UI */
                <div className="text-center max-w-lg">
                  <Sparkles className="w-10 h-10 mx-auto mb-4 text-vault-accent opacity-40" />
                  <h3 className="text-lg font-semibold text-vault-text-bright mb-1">
                    Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}
                  </h3>
                  <p className="text-xs text-vault-text-muted mb-1">
                    Model: <span className="text-vault-accent">{config.active_model.split("/").pop()}</span>
                  </p>
                  <p className="text-sm text-vault-text-muted mb-6">
                    Plan your day, review your week, or ask about your tasks.
                    <br />
                    <span className="text-[10px]">Changes are proposed first -- you approve before anything is written.</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3 text-left mb-4">
                    <button
                      onClick={() => handleQuickSend("Plan my day. What should I focus on today? Give me a prioritized daily plan with time blocks based on my current tasks, due dates, and what's overdue. Set due dates to today for the tasks you recommend.")}
                      className="card-base p-4 hover:border-vault-accent group"
                    >
                      <span className="text-vault-accent font-semibold text-sm block mb-1">Plan My Day</span>
                      <span className="text-vault-text-muted text-xs block">Focused daily plan with priorities and time blocks</span>
                    </button>
                    <button
                      onClick={() => handleQuickSend("Plan my week. Give me a day-by-day breakdown Monday through Friday with daily goals. Set due dates on tasks for each day you assign them to. Suggest 2-4 tasks per day.")}
                      className="card-base p-4 hover:border-vault-accent group"
                    >
                      <span className="text-vault-accent font-semibold text-sm block mb-1">Plan My Week</span>
                      <span className="text-vault-text-muted text-xs block">Day-by-day breakdown with daily goals</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-left">
                    {SLASH_COMMANDS.slice(2, 8).map((cmd) => (
                      <button
                        key={cmd.cmd}
                        onClick={() => handleSlashCommand(cmd.cmd)}
                        className="card-base text-xs p-2.5"
                      >
                        <span className="text-vault-accent font-mono text-[11px]">{cmd.cmd}</span>
                        <span className="text-vault-text-muted block mt-0.5 text-[10px]">{cmd.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {displayMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-vault-accent text-white"
                    : "bg-vault-card text-vault-text border border-vault-border"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-vault-card text-vault-text border border-vault-border">
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                <span className="inline-block w-2 h-4 bg-vault-accent animate-pulse ml-0.5" />
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-vault-card rounded-xl px-4 py-3 border border-vault-border">
                <Loader2 className="w-4 h-4 animate-spin text-vault-accent" />
              </div>
            </div>
          )}

          {/* Pending Actions Confirmation Card */}
          {pendingActions.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl border-2 border-vault-warning bg-vault-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-4 h-4 text-vault-warning" />
                  <span className="text-sm font-semibold text-vault-text-bright">
                    Proposed Changes ({pendingActions.length})
                  </span>
                </div>
                <p className="text-xs text-vault-text-muted mb-3">
                  The AI wants to modify your tasks. Review and approve:
                </p>

                <div className="space-y-1.5 mb-4">
                  {pendingActions.map((p, i) => {
                    const isCreate = p.action.type === "create_task";
                    const isNotFound = !isCreate && !p.task;
                    return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                        isCreate
                          ? "bg-vault-success/10 text-vault-text"
                          : isNotFound
                          ? "bg-vault-critical/10 text-vault-critical"
                          : "bg-vault-bg text-vault-text"
                      }`}
                    >
                      <Zap className={`w-3 h-3 mt-0.5 flex-shrink-0 ${isCreate ? "text-vault-success" : "text-vault-warning"}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">
                          {isCreate ? "New task" : p.action.type.replace("set_", "").replace("_", " ")}
                        </span>
                        {isCreate ? ": " : " -> "}
                        <span className="text-vault-accent">
                          {isCreate ? `"${p.action.titleMatch}"` : (p.action.value || "archive")}
                        </span>
                        <div className="text-[10px] text-vault-text-muted mt-0.5 truncate">
                          {isCreate
                            ? `project: ${p.action.project || "general"}, priority: ${p.action.priority || "medium"}${p.action.owner ? `, owner: ${p.action.owner}` : ""}`
                            : p.task
                            ? `"${p.task.title}"`
                            : `"${p.action.titleMatch}" (task not found)`
                          }
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => applyActions(pendingActions)}
                    className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Apply All ({pendingActions.filter((p) => p.task).length} changes)
                  </button>
                  <button
                    onClick={handleRejectActions}
                    className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5 text-vault-critical"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Results Banner */}
          {actionResults.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl bg-vault-success/10 border border-vault-success/30 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="w-4 h-4 text-vault-success" />
                  <span className="text-xs font-semibold text-vault-success">
                    {actionResults.filter((r) => r.success).length} changes applied
                  </span>
                </div>
                <div className="space-y-0.5">
                  {actionResults.map((r, i) => (
                    <div key={i} className="text-[10px] text-vault-text-muted flex items-center gap-1.5">
                      {r.success ? (
                        <CheckCircle2 className="w-2.5 h-2.5 text-vault-success" />
                      ) : (
                        <XCircle className="w-2.5 h-2.5 text-vault-critical" />
                      )}
                      <span className="truncate">
                         {r.action.type.replace("set_", "")} &quot;{r.taskTitle}&quot; {"→"} {r.action.value || "archived"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-vault-border relative">
          {showSlashMenu && (
            <div className="absolute bottom-full left-4 mb-2 bg-vault-surface border border-vault-border rounded-lg p-1 shadow-xl">
              {SLASH_COMMANDS.map((cmd) => (
                <button
                  key={cmd.cmd}
                  onClick={() => handleSlashCommand(cmd.cmd)}
                  className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded hover:bg-vault-card text-left"
                >
                  <span className="text-vault-accent font-mono text-xs w-24">{cmd.cmd}</span>
                  <span className="text-vault-text-muted text-xs">{cmd.desc}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (e.target.value === "/") {
                    setShowSlashMenu(true);
                  } else if (!e.target.value.startsWith("/")) {
                    setShowSlashMenu(false);
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  !llmConnected
                    ? "LM Studio not connected..."
                    : !config.active_model
                    ? "No model selected. Go to Settings to choose one."
                    : "Ask about your projects... (type / for commands)"
                }
                disabled={!llmConnected || !config.active_model || pendingActions.length > 0}
                className="input-base w-full resize-none"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 120) + "px";
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || !llmConnected || !config.active_model || pendingActions.length > 0}
              className="btn-primary px-3 disabled:opacity-50"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          {pendingActions.length > 0 && (
            <p className="text-xs text-vault-warning mt-2">
              Review the proposed changes above before continuing.
            </p>
          )}

          {!llmConnected && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-vault-critical flex-1">
                LM Studio not connected.
              </p>
              <button onClick={() => setView("settings")} className="text-xs text-vault-accent hover:underline">
                Open Settings
              </button>
            </div>
          )}
          {llmConnected && !config.active_model && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-vault-warning flex-1">
                {models.length === 0 ? "No models loaded in LM Studio." : "No model selected."}
              </p>
              <button onClick={() => setView("settings")} className="text-xs text-vault-accent hover:underline">
                {models.length === 0 ? "Load a Model" : "Select Model"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
