import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { check as checkUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { useLlm } from "@/hooks/useLlm";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { ModelRecommendations } from "./ModelRecommendations";
import { DEFAULT_STATUS_COLORS, STATUS_LABELS } from "@/types";
import type { TaskStatus, StatusColors } from "@/types";
import { SUPPORTED_COUNTRIES } from "@/lib/holidays";

const COLOR_PRESETS = [
  "#8b949e", "#6c5ce7", "#58a6ff", "#79c0ff", "#3498db",
  "#d29922", "#f0883e", "#e67e22", "#f39c12",
  "#3fb950", "#27ae60", "#56d364",
  "#f85149", "#e74c3c", "#db61a2",
  "#bc8cff", "#9b59b6",
];

export function SettingsView() {
  const { config, setConfig, models, llmConnected } = useAppStore();
  const { saveConfig, startWatching } = useVault();
  const { theme, setTheme } = useTheme();
  const { checkConnection } = useLlm();

  const [form, setForm] = useState(config);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingStatusColor, setEditingStatusColor] = useState<TaskStatus | null>(null);

  const [appVersion, setAppVersion] = useState<string>("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "up-to-date" | "downloading" | "done">("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setUpdateChecking(true);
    setUpdateStatus("idle");
    setPendingUpdate(null);
    try {
      const update = await checkUpdate();
      if (update?.available) {
        setPendingUpdate(update);
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch {
      setUpdateStatus("up-to-date");
    } finally {
      setUpdateChecking(false);
    }
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (!pendingUpdate) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    let downloaded = 0;
    let total = 0;
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        setDownloadProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0);
      }
      if (event.event === "Finished") setUpdateStatus("done");
    });
    await relaunch();
  }, [pendingUpdate]);

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
    await checkConnection();
    setChecking(false);
  }, [checkConnection]);

  const handleAddWatchFolder = useCallback(async () => {
    const folder = await open({ directory: true, multiple: false });
    if (folder) {
      setForm((prev) => ({
        ...prev,
        watched_folders: [...prev.watched_folders, String(folder)],
      }));
    }
  }, []);

  const handleRemoveWatchFolder = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      watched_folders: prev.watched_folders.filter((_, i) => i !== index),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    const toSave = { ...form, status_colors: statusColors };
    await saveConfig(toSave);
    setConfig(toSave);
    if (toSave.watched_folders.length > 0) await startWatching(toSave.watched_folders);
    if (toSave.lm_studio_url !== config.lm_studio_url) await checkConnection();
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

  const activeModel = models.find((m) => m.id === form.active_model);
  const activeModelName = activeModel
    ? activeModel.id.split("/").pop() || activeModel.id
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <h2 className="text-xl font-bold text-vault-text-bright">Settings</h2>

        {/* LM Studio Connection */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <Brain className="w-4 h-4 text-vault-accent" />
            LM Studio
          </h3>

          <div className="card-base p-4 space-y-4">
            {/* Connection URL */}
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Server URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.lm_studio_url}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, lm_studio_url: e.target.value }))
                  }
                  placeholder="http://localhost:1234"
                  className="input-base flex-1"
                />
                <button
                  onClick={handleCheckConnection}
                  disabled={checking}
                  className="btn-ghost flex items-center gap-1.5 text-xs"
                >
                  {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Test
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs">
                {llmConnected ? (
                  <>
                    <Wifi className="w-3 h-3 text-vault-success" />
                    <span className="text-vault-success">Connected - {models.length} model(s) available</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-vault-critical" />
                    <span className="text-vault-critical">Not connected. Make sure LM Studio is running.</span>
                  </>
                )}
              </div>
            </div>

            {/* Active Model -- prominent display */}
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
                    Loaded
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-vault-warning/5 rounded-lg px-4 py-3 border border-vault-warning/20">
                  <AlertCircle className="w-5 h-5 text-vault-warning" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-vault-warning">No model selected</p>
                    <p className="text-[10px] text-vault-text-muted">Select a model below or load one in LM Studio</p>
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
                  <p className="text-xs text-vault-warning font-medium mb-1.5">
                    No models loaded in LM Studio
                  </p>
                  <p className="text-[11px] text-vault-text-muted leading-relaxed">
                    Open LM Studio and load a model, or run in terminal:
                  </p>
                  <code className="block mt-1.5 text-[11px] bg-vault-bg rounded px-2 py-1 text-vault-accent font-mono">
                    lms load qwen2.5-7b-instruct
                  </code>
                  <p className="text-[10px] text-vault-text-muted mt-1.5">
                    Then click "Test" above to refresh. Recommended: 7B+ for chat, 32B+ for extraction.
                  </p>
                </div>
              )}

              {!llmConnected && (
                <div className="mt-3 p-3 bg-vault-critical/10 border border-vault-critical/20 rounded-lg">
                  <p className="text-xs text-vault-critical font-medium mb-1">
                    LM Studio not running
                  </p>
                  <p className="text-[11px] text-vault-text-muted">
                    Download and start LM Studio from{" "}
                    <span className="text-vault-accent">lmstudio.ai</span>, then click "Test" above.
                  </p>
                </div>
              )}
            </div>
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
              Your Name
            </label>
            <input
              type="text"
              value={form.user_name}
              onChange={(e) => setForm((prev) => ({ ...prev, user_name: e.target.value }))}
              placeholder="e.g. Lars"
              className="input-base w-full"
            />
            <p className="text-xs text-vault-text-muted mt-1">
              Used for "My Tasks" dashboard filter. Matches against task owners.
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
          <div className="card-base p-4">
            <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
              Vault Path
            </label>
            <input type="text" value={form.vault_path} className="input-base w-full" disabled />
            <p className="text-xs text-vault-text-muted mt-1">All data stored here as markdown files.</p>
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
            <button onClick={handleAddWatchFolder} className="btn-ghost flex items-center gap-1.5 text-xs w-full justify-center">
              <FolderPlus className="w-3.5 h-3.5" /> Add Watch Folder
            </button>
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

        {/* App Updates */}
        <section className="card-base p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-vault-accent" />
            <h2 className="settings-section-title">APP UPDATES</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-vault-text">Current version</p>
              <p className="text-xs text-vault-text-muted font-mono">{appVersion || "0.1.0"}</p>
            </div>

            {updateStatus === "up-to-date" && (
              <span className="flex items-center gap-1 text-xs text-vault-success">
                <Check className="w-3.5 h-3.5" /> Up to date
              </span>
            )}
          </div>

          {pendingUpdate ? (
            <div className="bg-vault-accent/10 border border-vault-accent/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-vault-accent" />
                <p className="text-sm font-semibold text-vault-accent">
                  Version {pendingUpdate.version} available
                </p>
              </div>
              {updateStatus === "downloading" ? (
                <div className="space-y-1">
                  <div className="h-1.5 bg-vault-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-vault-accent transition-all"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-vault-text-muted">{downloadProgress}% — installing…</p>
                </div>
              ) : (
                <button
                  onClick={handleInstallUpdate}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Install &amp; Relaunch
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleCheckUpdate}
              disabled={updateChecking}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              {updateChecking
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Check for Updates</>}
            </button>
          )}
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
