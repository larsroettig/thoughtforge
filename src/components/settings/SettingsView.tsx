import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import {
  Save,
  RefreshCw,
  Wifi,
  WifiOff,
  FolderPlus,
  X,
  Loader2,
  Check,
  Brain,
  Sun,
  Moon,
  Monitor,
  Cpu,
  AlertCircle,
  Circle,
  Download,
  ArrowUpCircle,
  Server,
  Copy,
  Eye,
  EyeOff,
  RotateCcw,
  GripVertical,
  PanelLeft,
  Settings,
  Gauge,
  LayoutDashboard,
  Grid2x2,
  Target,
  BarChart3,
  MessageSquare,
  FileText,
  Archive,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { useLlm, resolveProviderUrl } from "@/hooks/useLlm";
import { useTheme, type Theme } from "@/hooks/useTheme";
import type { LlmProvider } from "@/types";
import { ModelRecommendations } from "./ModelRecommendations";
import { DEFAULT_STATUS_COLORS, STATUS_LABELS } from "@/types";
import type { TaskStatus, StatusColors } from "@/types";
import { SUPPORTED_COUNTRIES } from "@/lib/holidays";

const EMBEDDING_MODELS = [
  {
    id: "nomic-embed-text-v1.5",
    label: "nomic-embed-text v1.5",
    size: "274 MB",
    context: "8k",
    desc: "Best all-round local embedding. Strong semantic search across long notes.",
  },
  {
    id: "all-minilm-l6-v2",
    label: "all-MiniLM-L6-v2",
    size: "90 MB",
    context: "512 tok",
    desc: "Smallest and fastest. Good for short task titles and quick lookup.",
  },
  {
    id: "mxbai-embed-large-v1",
    label: "mxbai-embed-large v1",
    size: "670 MB",
    context: "512 tok",
    desc: "Highest retrieval quality. Outperforms nomic on most benchmarks.",
  },
  {
    id: "bge-m3",
    label: "BGE-M3",
    size: "1.1 GB",
    context: "8k",
    desc: "Multilingual + long context. Best if your notes mix languages.",
  },
];

const COLOR_PRESETS = [
  "#8b949e", "#6c5ce7", "#58a6ff", "#79c0ff", "#3498db",
  "#d29922", "#f0883e", "#e67e22", "#f39c12",
  "#3fb950", "#27ae60", "#56d364",
  "#f85149", "#e74c3c", "#db61a2",
  "#bc8cff", "#9b59b6",
];

const CONTROLLABLE_NAV: { id: string; label: string; icon: typeof Gauge }[] = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "board", label: "Board", icon: LayoutDashboard },
  { id: "matrix", label: "Matrix", icon: Grid2x2 },
  { id: "goals", label: "Goals", icon: Target },
  { id: "stats", label: "Weekly Review", icon: BarChart3 },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
];

function SortableNavRow({
  item,
  disabled,
  onToggle,
}: {
  item: (typeof CONTROLLABLE_NAV)[number];
  disabled: boolean;
  onToggle: () => void;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const Icon = item.icon;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors touch-none ${
        disabled ? "opacity-40" : ""
      } hover:bg-vault-bg`}
    >
      <span
        {...listeners}
        className="cursor-grab text-vault-text-muted hover:text-vault-text flex-shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </span>
      <Icon className="w-4 h-4 text-vault-text-muted flex-shrink-0" />
      <span className="flex-1 text-sm text-vault-text">{item.label}</span>
      <button
        onClick={onToggle}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
          disabled ? "bg-vault-border" : "bg-vault-accent"
        }`}
        title={disabled ? "Enable" : "Disable"}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
            disabled ? "translate-x-0.5" : "translate-x-4"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsView() {
  const { config, setConfig, models, llmConnected } = useAppStore();
  const { saveConfig, startWatching, changeVaultPath } = useVault();
  const [vaultChanging, setVaultChanging] = useState(false);
  const { theme, setTheme } = useTheme();
  const { checkConnection } = useLlm();

  const [form, setForm] = useState(config);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingStatusColor, setEditingStatusColor] = useState<TaskStatus | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const navSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const orderedNav = useMemo(() => {
    const order = form.nav_order ?? [];
    if (order.length === 0) return CONTROLLABLE_NAV;
    return [
      ...order.map((id) => CONTROLLABLE_NAV.find((i) => i.id === id)).filter(Boolean) as typeof CONTROLLABLE_NAV,
      ...CONTROLLABLE_NAV.filter((i) => !order.includes(i.id)),
    ];
  }, [form.nav_order]);

  const handleNavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedNav.findIndex((i) => i.id === active.id);
    const newIndex = orderedNav.findIndex((i) => i.id === over.id);
    const next = arrayMove(orderedNav, oldIndex, newIndex).map((i) => i.id);
    const updated = { ...form, nav_order: next };
    setForm(updated);
    setConfig(updated);
  }, [orderedNav, form, setConfig]);

  const handleNavToggle = useCallback((id: string) => {
    const disabled = new Set(form.nav_disabled ?? []);
    if (disabled.has(id)) disabled.delete(id);
    else disabled.add(id);
    const updated = { ...form, nav_disabled: [...disabled] };
    setForm(updated);
    setConfig(updated);
  }, [form, setConfig]);

  const [appVersion, setAppVersion] = useState<string>("");
  const [binaryChecksum, setBinaryChecksum] = useState<string>("");
  const [checksumCopied, setChecksumCopied] = useState(false);

  const [mcpTokenVisible, setMcpTokenVisible] = useState(false);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [mcpConfigCopied, setMcpConfigCopied] = useState(false);
  const [mcpTokenRegenerating, setMcpTokenRegenerating] = useState(false);
  const [mcpInfo, setMcpInfo] = useState<{ token: string; port: number; binary_path: string; enabled: boolean; http_enabled: boolean; vault_path: string } | null>(null);

  useEffect(() => {
    fetch("/api/version").then((r) => r.json()).then((d: { version: string }) => setAppVersion(d.version)).catch(() => {});
    api<string>("get_binary_checksum").then(setBinaryChecksum).catch(() => {});
  }, []);

  useEffect(() => {
    setForm(config);
  }, [config]);

  // Ensure status_colors always has defaults
  const statusColors: StatusColors = {
    ...DEFAULT_STATUS_COLORS,
    ...(form.status_colors || {}),
  };

  const handleCheckConnection = useCallback(async () => {
    setChecking(true);
    await checkConnection({
      base_url: resolveProviderUrl(form),
      provider: form.llm_provider ?? "lm_studio",
      api_key: form.api_key ?? "",
    });
    setChecking(false);
  }, [checkConnection, form]);

  const [newWatchFolder, setNewWatchFolder] = useState("");
  const handleAddWatchFolder = useCallback(() => {
    const path = newWatchFolder.trim();
    if (!path) return;
    setForm((prev) => ({
      ...prev,
      watched_folders: [...prev.watched_folders, path],
    }));
    setNewWatchFolder("");
  }, [newWatchFolder]);

  const handleRemoveWatchFolder = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      watched_folders: prev.watched_folders.filter((_, i) => i !== index),
    }));
  }, []);

  const [newVaultPath, setNewVaultPath] = useState("");
  const handleChangeVault = useCallback(async () => {
    const path = newVaultPath.trim();
    if (!path) return;
    setVaultChanging(true);
    try {
      const resolved = await changeVaultPath(path);
      setForm((prev) => ({ ...prev, vault_path: resolved }));
      setNewVaultPath("");
    } finally {
      setVaultChanging(false);
    }
  }, [changeVaultPath, newVaultPath]);

  const handleSave = useCallback(async () => {
    const toSave = { ...form, status_colors: statusColors };
    await saveConfig(toSave);
    setConfig(toSave);
    if (toSave.watched_folders.length > 0) await startWatching(toSave.watched_folders);
    if (
      toSave.lm_studio_url !== config.lm_studio_url ||
      toSave.llm_provider !== config.llm_provider ||
      toSave.api_key !== config.api_key ||
      toSave.api_base_url !== config.api_base_url
    ) await checkConnection();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [form, statusColors, saveConfig, setConfig, startWatching, checkConnection, config.lm_studio_url]);

  const handleSetStatusColor = (status: TaskStatus, color: string) => {
    setForm((prev) => ({
      ...prev,
      status_colors: { ...statusColors, [status]: color },
    }));
    setEditingStatusColor(null);
  };

  const handleMcpToggle = useCallback(async (enabled: boolean) => {
    const toSave = { ...form, mcp_enabled: enabled };
    setForm(toSave);
    await saveConfig(toSave);
    setConfig(toSave);
    try {
      if (enabled) {
        await api("start_mcp_server");
        const info = await api<{ token: string; port: number; binary_path: string; enabled: boolean; http_enabled: boolean; vault_path: string }>("get_mcp_info");
        setMcpInfo(info);
      } else {
        await api("stop_mcp_server");
        setMcpInfo(null);
      }
    } catch (e) {
      console.error("MCP toggle error:", e);
    }
  }, [form, saveConfig, setConfig]);

  const handleMcpHttpToggle = useCallback(async (httpEnabled: boolean) => {
    const toSave = { ...form, mcp_http_enabled: httpEnabled };
    setForm(toSave);
    await saveConfig(toSave);
    setConfig(toSave);
    try {
      if (httpEnabled) {
        await api("start_mcp_server");
        const info = await api<{ token: string; port: number; binary_path: string; enabled: boolean; http_enabled: boolean; vault_path: string }>("get_mcp_info");
        setMcpInfo(info);
      } else {
        await api("stop_mcp_server");
        setMcpInfo(null);
      }
    } catch (e) {
      console.error("MCP HTTP toggle error:", e);
    }
  }, [form, saveConfig, setConfig]);

  const handleCopyToken = useCallback(() => {
    const token = form.mcp_token ?? "";
    navigator.clipboard.writeText(token).then(() => {
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 2000);
    });
  }, [form.mcp_token]);

  const handleRegenerateToken = useCallback(async () => {
    setMcpTokenRegenerating(true);
    try {
      // Stop the server so the old token is no longer accepted.
      if (form.mcp_enabled) await api("stop_mcp_server");
      const newToken = await api<string>("regenerate_mcp_token");
      const updated = { ...form, mcp_token: newToken };
      setForm(updated);
      setConfig(updated);
      if (form.mcp_enabled) {
        await api("start_mcp_server");
        const info = await api<{ token: string; port: number; binary_path: string; enabled: boolean; http_enabled: boolean; vault_path: string }>("get_mcp_info");
        setMcpInfo(info);
      }
    } catch (e) {
      console.error("Failed to regenerate MCP token:", e);
    } finally {
      setMcpTokenRegenerating(false);
    }
  }, [form, setConfig]);

  const handleCopyClaudeConfig = useCallback(async () => {
    let info = mcpInfo;
    if (!info) {
      try {
        info = await api<{ token: string; port: number; binary_path: string; enabled: boolean; http_enabled: boolean; vault_path: string }>("get_mcp_info");
        setMcpInfo(info);
      } catch {
        return;
      }
    }
    const config = JSON.stringify({
      mcpServers: {
        vaultmind: {
          command: info.binary_path,
          args: ["--stdio", "--vault", info.vault_path],
        },
      },
    }, null, 2);
    navigator.clipboard.writeText(config).then(() => {
      setMcpConfigCopied(true);
      setTimeout(() => setMcpConfigCopied(false), 2000);
    });
  }, [mcpInfo]);

  const activeModel = models.find((m) => m.id === form.active_model);
  const activeModelName = activeModel
    ? activeModel.id.split("/").pop() || activeModel.id
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <h2 className="text-xl font-bold text-vault-text-bright">Settings</h2>

        {/* AI Provider */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <Brain className="w-4 h-4 text-vault-accent" />
            AI Provider
          </h3>

          <div className="card-base p-4 space-y-4">
            {/* Provider selector */}
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Provider
              </label>
              <select
                value={form.llm_provider ?? "lm_studio"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llm_provider: e.target.value as LlmProvider }))
                }
                className="input-base w-full"
              >
                <option value="lm_studio">LM Studio (local)</option>
                <option value="ollama">Ollama (local)</option>
                <option value="open_ai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="custom">Custom (OpenAI-compatible)</option>
              </select>
            </div>

            {/* Server URL — shown for LM Studio and Custom */}
            {(form.llm_provider === "lm_studio" || form.llm_provider === "custom" || !form.llm_provider) && (
              <div>
                <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                  {form.llm_provider === "custom" ? "Base URL" : "Server URL"}
                </label>
                <input
                  type="text"
                  value={form.lm_studio_url}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, lm_studio_url: e.target.value }))
                  }
                  placeholder={form.llm_provider === "custom" ? "https://your-api.example.com" : "http://localhost:1234"}
                  className="input-base w-full"
                />
              </div>
            )}

            {/* Ollama: read-only URL */}
            {form.llm_provider === "ollama" && (
              <div>
                <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                  Server URL
                </label>
                <input
                  type="text"
                  value="http://localhost:11434"
                  readOnly
                  className="input-base w-full opacity-60 cursor-default"
                />
              </div>
            )}

            {/* API Key — shown for external providers */}
            {(form.llm_provider === "open_ai" || form.llm_provider === "anthropic" || form.llm_provider === "custom") && (
              <div>
                <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type={apiKeyVisible ? "text" : "password"}
                    value={form.api_key ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, api_key: e.target.value }))
                    }
                    placeholder={
                      form.llm_provider === "open_ai" ? "sk-..." :
                      form.llm_provider === "anthropic" ? "sk-ant-..." :
                      "your-api-key"
                    }
                    className="input-base flex-1 font-mono text-xs"
                  />
                  <button
                    onClick={() => setApiKeyVisible((v) => !v)}
                    className="btn-ghost p-2"
                    title="Show / hide key"
                  >
                    {apiKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-vault-text-muted mt-1">
                  Stored locally in your vault config. Never sent to any server other than the provider.
                </p>
              </div>
            )}

            {/* Test connection */}
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCheckConnection}
                  disabled={checking}
                  className="btn-ghost flex items-center gap-1.5 text-xs"
                >
                  {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Test connection
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                {llmConnected ? (
                  <>
                    <Wifi className="w-3 h-3 text-vault-success" />
                    <span className="text-vault-success">Connected — {models.length} model(s) available</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-vault-critical" />
                    <span className="text-vault-critical">
                      {(form.llm_provider === "open_ai" || form.llm_provider === "anthropic")
                        ? "Connection failed. Check your API key."
                        : form.llm_provider === "custom"
                        ? "Connection failed. Check the URL and API key."
                        : form.llm_provider === "ollama"
                        ? "Not connected. Make sure Ollama is running."
                        : "Not connected. Make sure LM Studio is running."}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Active Model */}
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-2 block">
                Active Model
              </label>

              {activeModelName ? (
                <div className="flex items-center gap-3 bg-vault-bg rounded-lg px-4 py-3 border border-vault-border">
                  <Cpu className="w-5 h-5 text-vault-accent" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-vault-text-bright truncate">{activeModelName}</p>
                    <p className="text-[10px] text-vault-text-muted truncate">{activeModel?.id}</p>
                  </div>
                  <span className="text-[10px] bg-vault-success/15 text-vault-success px-2 py-0.5 rounded-full font-medium">
                    Active
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-vault-warning/5 rounded-lg px-4 py-3 border border-vault-warning/20">
                  <AlertCircle className="w-5 h-5 text-vault-warning" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-vault-warning">No model selected</p>
                    <p className="text-[10px] text-vault-text-muted">Test connection first, then select a model</p>
                  </div>
                </div>
              )}

              <select
                value={form.active_model}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, active_model: e.target.value }))
                }
                className="input-base w-full mt-2"
                disabled={models.length === 0}
              >
                <option value="">Select a model...</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>

              {models.length === 0 && llmConnected && (
                <div className="mt-3 p-3 bg-vault-warning/10 border border-vault-warning/20 rounded-lg">
                  <p className="text-xs text-vault-warning font-medium mb-1.5">No models available</p>
                  <p className="text-[11px] text-vault-text-muted">
                    {form.llm_provider === "lm_studio" && "Open LM Studio and load a model, then click Test above."}
                    {form.llm_provider === "ollama" && "Pull a model with: ollama pull llama3.2"}
                  </p>
                </div>
              )}
            </div>

            {/* Reranker Model — optional, any provider */}
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-2 block">
                Reranker Model
                <span className="ml-2 normal-case font-normal text-vault-text-muted">(optional)</span>
              </label>
              <p className="text-[11px] text-vault-text-muted mb-2">
                Used to re-rank search results. Leave blank to use the active model above.
                Accepts any model ID available in your provider (e.g. <code className="bg-vault-bg px-1 rounded">qwen3-reranker</code>).
              </p>
              <input
                type="text"
                value={form.reranker_model ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, reranker_model: e.target.value }))}
                placeholder="Leave blank to use active model"
                className="input-base w-full"
              />
            </div>

            {/* Embedding Model — only for local providers */}
            {(!form.llm_provider || form.llm_provider === "lm_studio" || form.llm_provider === "ollama") && (
              <div>
                <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-2 block">
                  Embedding Model
                </label>
                <p className="text-[11px] text-vault-text-muted mb-3">
                  Used for semantic search. Runs 100% locally — no data leaves your machine.
                </p>
                <div className="space-y-2">
                  {EMBEDDING_MODELS.map((em) => {
                    const selected = form.embedding_model === em.id;
                    return (
                      <button
                        key={em.id}
                        onClick={() => setForm((prev) => ({ ...prev, embedding_model: em.id }))}
                        className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                          selected
                            ? "border-vault-accent/50 bg-vault-accent/5"
                            : "border-vault-border bg-vault-bg hover:border-vault-text-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${selected ? "text-vault-accent" : "text-vault-text-bright"}`}>
                            {em.label}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] text-vault-text-muted">{em.size}</span>
                            <span className="text-[9px] bg-vault-success/10 text-vault-success px-1.5 py-0.5 rounded-full">local</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-vault-text-muted mt-0.5">{em.desc} · Context: {em.context}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-vault-text-muted mt-2">
                  Load the selected model in LM Studio under the <em>Embedding</em> tab before using semantic search.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Model Recommendations */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <Cpu className="w-4 h-4 text-vault-accent" />
            Model Recommendations
          </h3>
          <p className="text-xs text-vault-text-muted -mt-2">
            Based on your system RAM. Copy the search term and paste it into LM Studio's model browser, or use the CLI command.
          </p>
          <ModelRecommendations />
        </section>

        {/* Profile */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">Profile</h3>
          <div className="card-base p-4">
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Your First Name
            </label>
            <input
              type="text"
              value={form.user_name}
              onChange={(e) => setForm((prev) => ({ ...prev, user_name: e.target.value }))}
              placeholder="e.g. Lars"
              className="input-base w-full"
            />
            <p className="text-xs text-vault-text-muted mt-1">
              Used for the "Me" quick-assign shortcut and the "My Tasks" dashboard filter.
            </p>

            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block mt-4">
              Country (for public holidays)
            </label>
            <select
              value={form.country || "DE"}
              onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              className="input-base w-full"
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-vault-text-muted mt-1">
              Used by the AI planner to skip weekends and public holidays when scheduling tasks.
            </p>
          </div>
        </section>

        {/* Notifications */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">Notifications</h3>
          <div className="card-base p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifications_enabled !== false}
                onChange={(e) => setForm((prev) => ({ ...prev, notifications_enabled: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <div>
                <p className="text-sm text-vault-text">Due task notifications</p>
                <p className="text-xs text-vault-text-muted">
                  Show a bell indicator in the sidebar when tasks are overdue or due today.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Status Colors */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">
            Status Colors
          </h3>
          <div className="card-base p-4">
            <p className="text-xs text-vault-text-muted mb-4">
              Customize the color for each task status. Used on board columns, cards, and dashboard.
            </p>
            <div className="space-y-3">
              {(["todo", "in_progress", "review", "done", "blocked"] as TaskStatus[]).map((status) => {
                const color = statusColors[status];
                const isEditing = editingStatusColor === status;
                return (
                  <div key={status}>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditingStatusColor(isEditing ? null : status)}
                        className="w-7 h-7 rounded-lg border-2 border-vault-border hover:border-vault-text-muted transition-colors flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1">
                        <p className="text-sm text-vault-text-bright">{STATUS_LABELS[status]}</p>
                      </div>
                      <code className="text-[10px] font-mono text-vault-text-muted">{color}</code>
                    </div>

                    {isEditing && (
                      <div className="mt-2 ml-10 flex flex-wrap gap-1.5 p-2 bg-vault-bg rounded-lg border border-vault-border">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            onClick={() => handleSetStatusColor(status, c)}
                            className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                              color === c ? "border-vault-text-bright scale-110" : "border-transparent"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => handleSetStatusColor(status, e.target.value)}
                          className="w-6 h-6 rounded-md cursor-pointer border border-vault-border"
                          title="Custom color"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    status_colors: { ...DEFAULT_STATUS_COLORS },
                  }));
                }}
                className="text-[10px] text-vault-text-muted hover:text-vault-accent mt-2"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">Appearance</h3>
          <div className="card-base p-4">
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-3 block">
              Theme
            </label>
            <div className="flex gap-2">
              {([
                { id: "light" as Theme, label: "Light", icon: Sun },
                { id: "dark" as Theme, label: "Dark", icon: Moon },
                { id: "system" as Theme, label: "System", icon: Monitor },
              ]).map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
                      isActive
                        ? "bg-vault-accent/10 text-vault-accent border-vault-accent/30"
                        : "bg-vault-bg text-vault-text-muted border-vault-border hover:border-vault-text-muted"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Vault */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">Vault</h3>
          <div className="card-base p-4 space-y-3">
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide block">
              Vault Path
            </label>
            <p className="text-xs font-mono text-vault-text-muted">{form.vault_path}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newVaultPath}
                onChange={(e) => setNewVaultPath(e.target.value)}
                placeholder="Enter new vault path…"
                className="input-base flex-1 min-w-0"
              />
              <button
                onClick={handleChangeVault}
                disabled={vaultChanging || !newVaultPath.trim()}
                className="btn-secondary flex items-center gap-1.5 shrink-0"
              >
                {vaultChanging
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FolderPlus className="w-3.5 h-3.5" />}
                Change
              </button>
            </div>
            <p className="text-xs text-vault-text-muted">
              Enter a folder path to move your vault. Existing data is not deleted.
            </p>
          </div>
        </section>

        {/* Watched Folders */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">Watched Folders</h3>
          <div className="card-base p-4 space-y-3">
            <p className="text-xs text-vault-text-muted">
              Watch folders for new transcripts. New files are queued for AI extraction.
            </p>
            {form.watched_folders.map((folder, i) => (
              <div key={`${folder}-${i}`} className="flex items-center gap-2 bg-vault-bg rounded-lg px-3 py-2">
                <span className="text-sm text-vault-text truncate flex-1">{folder}</span>
                <button onClick={() => handleRemoveWatchFolder(i)} className="btn-ghost p-1 text-vault-critical">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newWatchFolder}
                onChange={(e) => setNewWatchFolder(e.target.value)}
                placeholder="Enter folder path…"
                className="input-base flex-1 min-w-0 text-xs"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddWatchFolder(); }}
              />
              <button onClick={handleAddWatchFolder} disabled={!newWatchFolder.trim()} className="btn-ghost flex items-center gap-1.5 text-xs shrink-0">
                <FolderPlus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </section>

        {/* Processing */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">Processing</h3>
          <div className="card-base p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_process}
                onChange={(e) => setForm((prev) => ({ ...prev, auto_process: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <div>
                <p className="text-sm text-vault-text">Auto-process new documents</p>
                <p className="text-xs text-vault-text-muted">Extract action items when new files appear in watched folders</p>
              </div>
            </label>
          </div>
        </section>

        {/* Navigation */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <PanelLeft className="w-4 h-4 text-vault-accent" />
            Navigation
          </h3>
          <div className="card-base p-3 space-y-1">
            <p className="text-xs text-vault-text-muted px-1 pb-2">
              Drag to reorder. Toggle to show or hide items in the sidebar. Settings is always visible.
            </p>
            <DndContext sensors={navSensors} collisionDetection={closestCenter} onDragEnd={handleNavDragEnd}>
              <SortableContext items={orderedNav.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {orderedNav.map((item) => (
                  <SortableNavRow
                    key={item.id}
                    item={item}
                    disabled={(form.nav_disabled ?? []).includes(item.id)}
                    onToggle={() => handleNavToggle(item.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <div className="flex items-center gap-3 px-3 py-2.5 opacity-30">
              <GripVertical className="w-4 h-4 text-vault-text-muted" />
              <Settings className="w-4 h-4 text-vault-text-muted" />
              <span className="flex-1 text-sm text-vault-text">Settings</span>
              <span className="text-[10px] text-vault-text-muted italic">pinned</span>
            </div>
          </div>
        </section>

        {/* App Updates */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-vault-accent" />
            App Version
          </h3>
          <div className="card-base p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-vault-text">Current version</p>
                <p className="text-xs text-vault-text-muted font-mono">{appVersion || "1.3.1"}</p>
              </div>
              <a
                href="https://github.com/lroettig/thoughtforge/releases"
                target="_blank"
                rel="noreferrer"
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Check GitHub
              </a>
            </div>
            {binaryChecksum && (
              <div className="flex items-center justify-between pt-1 border-t border-vault-border">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-vault-text-muted mb-0.5">SHA-256 checksum</p>
                  <p className="text-[11px] font-mono text-vault-text-muted break-all leading-relaxed">
                    {binaryChecksum}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(binaryChecksum).catch(() => {});
                    setChecksumCopied(true);
                    setTimeout(() => setChecksumCopied(false), 2000);
                  }}
                  className="btn-ghost p-1.5 ml-2 flex-shrink-0"
                  title="Copy checksum"
                >
                  {checksumCopied ? <Check className="w-3.5 h-3.5 text-vault-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* MCP Server */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <Server className="w-4 h-4 text-vault-accent" />
            MCP Server
          </h3>
          <div className="card-base p-4 space-y-4">
            <p className="text-xs text-vault-text-muted">
              Allow Claude and other AI clients to read and write your vault over the Model Context Protocol.
            </p>

            {/* Master toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-vault-text">Enable MCP</span>
              <div
                onClick={() => handleMcpToggle(!form.mcp_enabled)}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.mcp_enabled ? "bg-vault-accent" : "bg-vault-border"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${form.mcp_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>

            {form.mcp_enabled && (
              <div className="space-y-4 pt-1">

                {/* Token */}
                <div>
                  <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                    Bearer Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      type={mcpTokenVisible ? "text" : "password"}
                      value={form.mcp_token ?? ""}
                      className="input-base flex-1 font-mono text-xs"
                    />
                    <button onClick={() => setMcpTokenVisible((v) => !v)} className="btn-ghost p-2" title="Show / hide token">
                      {mcpTokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={handleCopyToken} className="btn-ghost flex items-center gap-1 text-xs px-2" title="Copy token">
                      {mcpCopied ? <Check className="w-3.5 h-3.5 text-vault-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={handleRegenerateToken}
                      disabled={mcpTokenRegenerating}
                      className="btn-ghost flex items-center gap-1 text-xs px-2 text-vault-warning hover:text-vault-warning"
                      title="Regenerate token — invalidates the current token immediately"
                    >
                      {mcpTokenRegenerating
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-vault-text-muted mt-1">
                    Rotating the token invalidates the current one — update any MCP client configs that use it.
                  </p>
                </div>

                {/* Claude Desktop stdio config */}
                <button onClick={handleCopyClaudeConfig} className="btn-secondary flex items-center gap-1.5 text-xs">
                  {mcpConfigCopied ? <Check className="w-3.5 h-3.5 text-vault-success" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Claude Desktop config
                </button>

                {/* HTTP server sub-toggle */}
                <div className="border-t border-vault-border pt-4 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm text-vault-text">Enable HTTP server</p>
                      <p className="text-[11px] text-vault-text-muted">
                        Exposes MCP over HTTP on port 7532. Disabled by default — only needed for non-stdio clients.
                      </p>
                    </div>
                    <div
                      onClick={() => handleMcpHttpToggle(!form.mcp_http_enabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ml-4 ${form.mcp_http_enabled ? "bg-vault-accent" : "bg-vault-border"}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${form.mcp_http_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </label>

                  {form.mcp_http_enabled && (
                    <div className="flex items-center gap-2 text-xs text-vault-text-muted">
                      <span className="w-2 h-2 rounded-full bg-vault-success inline-block" />
                      <span>HTTP server running on port 7532</span>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end pb-8">
          <button onClick={handleSave} className="btn-primary flex items-center gap-1.5">
            {saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Settings</>}
          </button>
        </div>
      </div>
    </div>
  );
}
