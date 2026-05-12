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
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { useVault } from "@/hooks/useVault";
import { useLlm } from "@/hooks/useLlm";
import { useTheme, type Theme } from "@/hooks/useTheme";

export function SettingsView() {
  const { config, setConfig, models, llmConnected } = useAppStore();
  const { saveConfig, startWatching } = useVault();
  const { theme, setTheme } = useTheme();
  const { checkConnection } = useLlm();

  const [form, setForm] = useState(config);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const handleCheckConnection = useCallback(async () => {
    setChecking(true);
    await checkConnection();
    setChecking(false);
  }, [checkConnection]);

  const handleAddWatchFolder = useCallback(async () => {
    const folder = await open({
      directory: true,
      multiple: false,
    });
    if (folder) {
      const path = typeof folder === 'string' ? folder : folder;
      setForm((prev) => ({
        ...prev,
        watched_folders: [...prev.watched_folders, path as string],
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
    await saveConfig(form);
    setConfig(form);

    // Restart watchers
    if (form.watched_folders.length > 0) {
      await startWatching(form.watched_folders);
    }

    // Refresh LLM connection if URL changed
    if (form.lm_studio_url !== config.lm_studio_url) {
      await checkConnection();
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [form, saveConfig, setConfig, startWatching, checkConnection, config.lm_studio_url]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <h2 className="text-xl font-bold text-vault-text-bright">Settings</h2>

        {/* LM Studio Connection */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide flex items-center gap-2">
            <Brain className="w-4 h-4 text-vault-accent" />
            LM Studio Connection
          </h3>

          <div className="card-base p-4 space-y-4">
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
                  {checking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Test
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2 text-xs">
                {llmConnected ? (
                  <>
                    <Wifi className="w-3 h-3 text-vault-success" />
                    <span className="text-vault-success">
                      Connected - {models.length} model(s) available
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-vault-critical" />
                    <span className="text-vault-critical">
                      Not connected. Make sure LM Studio is running.
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Active Model
              </label>
              <select
                value={form.active_model}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, active_model: e.target.value }))
                }
                className="input-base w-full"
                disabled={models.length === 0}
              >
                <option value="">Select a model...</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
              {models.length === 0 && llmConnected && (
                <div className="mt-2 p-3 bg-vault-warning/10 border border-vault-warning/20 rounded-lg">
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
                    Then click "Test" above to refresh. Recommended: 7B+ models for chat, 32B+ for transcript extraction.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Profile */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">
            Profile
          </h3>

          <div className="card-base p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Your Name
              </label>
              <input
                type="text"
                value={form.user_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, user_name: e.target.value }))
                }
                placeholder="e.g. Lars"
                className="input-base w-full"
              />
              <p className="text-xs text-vault-text-muted mt-1">
                Used for "My Tasks" filter on the dashboard. Matches against task owners.
              </p>
            </div>
          </div>
        </section>

        {/* Vault Configuration */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">
            Vault
          </h3>

          <div className="card-base p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-vault-text-muted uppercase tracking-wide mb-1 block">
                Vault Path
              </label>
              <input
                type="text"
                value={form.vault_path}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vault_path: e.target.value }))
                }
                className="input-base w-full"
                disabled
              />
              <p className="text-xs text-vault-text-muted mt-1">
                All tasks, projects, and chats are stored here as markdown files.
              </p>
            </div>
          </div>
        </section>

        {/* Watched Folders */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">
            Watched Folders
          </h3>

          <div className="card-base p-4 space-y-3">
            <p className="text-xs text-vault-text-muted">
              The app watches these folders for new transcripts and documents. New
              files are automatically queued for processing.
            </p>

            {form.watched_folders.map((folder, i) => (
              <div
                key={`${folder}-${i}`}
                className="flex items-center gap-2 bg-vault-bg rounded-lg px-3 py-2"
              >
                <span className="text-sm text-vault-text truncate flex-1">
                  {folder}
                </span>
                <button
                  onClick={() => handleRemoveWatchFolder(i)}
                  className="btn-ghost p-1 text-vault-critical"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <button
              onClick={handleAddWatchFolder}
              className="btn-ghost flex items-center gap-1.5 text-xs w-full justify-center"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Add Watch Folder
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">
            Appearance
          </h3>

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

        {/* Processing */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-vault-text uppercase tracking-wide">
            Processing
          </h3>

          <div className="card-base p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_process}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    auto_process: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded border-vault-border bg-vault-bg text-vault-accent focus:ring-vault-accent/30"
              />
              <div>
                <p className="text-sm text-vault-text">
                  Auto-process new documents
                </p>
                <p className="text-xs text-vault-text-muted">
                  Automatically extract action items when new files appear in
                  watched folders
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            className="btn-primary flex items-center gap-1.5"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
