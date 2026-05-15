import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

export function StatusBar() {
  const { config, llmConnected, models, isProcessing } = useAppStore();

  const activeModelName = config.active_model
    ? config.active_model.split("/").pop() || config.active_model
    : "No model selected";

  return (
    <div className="h-8 bg-vault-surface border-t border-vault-border px-4 flex items-center justify-between text-xs text-vault-text-muted">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {llmConnected ? (
            <Wifi className="w-3 h-3 text-vault-success" />
          ) : (
            <WifiOff className="w-3 h-3 text-vault-critical" />
          )}
          <span>
            LM Studio{" "}
            {llmConnected ? (
              <span className="text-vault-success">connected</span>
            ) : (
              <span className="text-vault-critical">disconnected</span>
            )}
          </span>
        </div>

        {llmConnected && (
          <span>
            Model: <span className="text-vault-text">{activeModelName}</span>
          </span>
        )}

        {isProcessing && (
          <div className="flex items-center gap-1 text-vault-accent">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span>
          Models loaded: <span className="text-vault-text">{(models ?? []).length}</span>
        </span>
        <span className="text-vault-border">|</span>
        <span>{config.vault_path || "Vault not set"}</span>
      </div>
    </div>
  );
}
