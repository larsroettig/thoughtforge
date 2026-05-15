import { useState } from "react";
import { Copy, Check, Cpu, AlertTriangle, Zap } from "lucide-react";
import { useSystemInfo } from "@/hooks/useSystemInfo";
import { useAppStore } from "@/stores/appStore";

interface ModelSpec {
  label: string;       // display name
  searchTerm: string;  // what to type in LM Studio model browser
  size: string;        // approximate download size
  context: string;     // context window
  contextShort?: boolean; // warn if context is short
}

interface Tier {
  id: string;
  badge: string;
  badgeColor: string;
  ramRange: string;
  chat: ModelSpec;
  note: string;
}

const EMBED: ModelSpec = {
  label: "nomic-embed-text-v1.5",
  searchTerm: "nomic embed text 1.5",
  size: "274 MB",
  context: "8k",
};

const TIERS: Tier[] = [
  {
    id: "entry",
    badge: "Entry",
    badgeColor: "text-vault-text-muted bg-vault-bg",
    ramRange: "< 8 GB",
    chat: {
      label: "Llama 3.2 3B Instruct",
      searchTerm: "llama 3.2 3b instruct",
      size: "~2.0 GB",
      context: "128k",
    },
    note: "Functional but limited reasoning. Use for simple task extraction.",
  },
  {
    id: "standard",
    badge: "Standard",
    badgeColor: "text-vault-text bg-vault-card",
    ramRange: "8–16 GB",
    chat: {
      label: "Llama 3.1 8B Instruct",
      searchTerm: "llama 3.1 8b instruct",
      size: "~5.0 GB",
      context: "128k",
    },
    note: "Good balance of speed and quality for daily planning use.",
  },
  {
    id: "recommended",
    badge: "Recommended",
    badgeColor: "text-vault-accent bg-vault-accent/10",
    ramRange: "16–32 GB",
    chat: {
      label: "Qwen 2.5 14B Instruct",
      searchTerm: "qwen2.5 14b instruct",
      size: "~9.0 GB",
      context: "128k",
    },
    note: "Strong reasoning and reliable task extraction. Best everyday choice.",
  },
  {
    id: "high",
    badge: "High Performance",
    badgeColor: "text-vault-warning bg-vault-warning/10",
    ramRange: "32–64 GB",
    chat: {
      label: "DeepSeek-R1 Distill 32B",
      searchTerm: "deepseek r1 distill qwen 32b",
      size: "~20 GB",
      context: "32k",
      contextShort: true,
    },
    note: "Excellent reasoning. Context window is 32k — enough for ~20 notes.",
  },
  {
    id: "maximum",
    badge: "Maximum",
    badgeColor: "text-vault-success bg-vault-success/10",
    ramRange: "64 GB+",
    chat: {
      label: "Llama 3.3 70B Instruct",
      searchTerm: "llama 3.3 70b instruct",
      size: "~40 GB",
      context: "128k",
    },
    note: "Near state-of-the-art local quality. Slower generation.",
  },
];

function getTierIndex(ramGb: number, isAppleSilicon: boolean): number {
  // Apple Silicon unified memory is ~30 % more effective for inference
  const effective = isAppleSilicon ? Math.floor(ramGb * 1.3) : ramGb;
  if (effective < 8)  return 0;
  if (effective < 16) return 1;
  if (effective < 32) return 2;
  if (effective < 64) return 3;
  return 4;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="btn-ghost p-1 flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="w-3 h-3 text-vault-success" />
        : <Copy className="w-3 h-3 text-vault-text-muted" />}
    </button>
  );
}

function ModelCard({ spec, label }: { spec: ModelSpec; label: string }) {
  return (
    <div className="bg-vault-bg rounded-lg border border-vault-border p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-vault-text-muted uppercase tracking-wide">{label}</span>
        {spec.contextShort && (
          <span className="flex items-center gap-0.5 text-[9px] text-vault-warning bg-vault-warning/10 px-1.5 py-0.5 rounded-full">
            <AlertTriangle className="w-2.5 h-2.5" />
            32k context
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-vault-text-bright truncate">{spec.label}</span>
        <span className="text-[10px] text-vault-text-muted flex-shrink-0">{spec.size}</span>
      </div>

      <div className="flex items-center gap-1 bg-vault-surface rounded px-2 py-1">
        <span className="text-[10px] font-mono text-vault-accent flex-1 truncate">{spec.searchTerm}</span>
        <CopyButton text={spec.searchTerm} />
      </div>

      <div className="flex items-center gap-1 bg-vault-surface rounded px-2 py-1">
        <span className="text-[10px] font-mono text-vault-text-muted flex-1 truncate">
          lms load {spec.searchTerm}
        </span>
        <CopyButton text={`lms load ${spec.searchTerm}`} />
      </div>

      <p className="text-[10px] text-vault-text-muted">
        Context: {spec.context}
        {!spec.contextShort && " — fits entire conversation history"}
      </p>
    </div>
  );
}

const RAM_OPTIONS = [4, 8, 16, 32, 64, 96, 128];

function getModelContext(modelId: string): string | null {
  const id = modelId.toLowerCase();
  for (const tier of TIERS) {
    if (id.includes(tier.chat.searchTerm.split(" ")[0])) {
      return tier.chat.context;
    }
  }
  if (id.includes("deepseek") && (id.includes("r1") || id.includes("32b"))) return "32k";
  if (id.includes("gemma-2") || id.includes("gemma2")) return "8k";
  if (id.includes("128k")) return "128k";
  if (id.includes("llama") || id.includes("qwen") || id.includes("mistral") || id.includes("phi")) return "128k";
  return null;
}

export function ModelRecommendations() {
  const sysInfo = useSystemInfo();
  const { config } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const [manualRam, setManualRam] = useState<number | null>(null);

  const detectedRam = sysInfo?.total_ram_gb ?? 0;
  const isAppleSilicon = sysInfo?.cpu_arch === "aarch64";
  const ramGb = manualRam ?? (detectedRam > 0 ? detectedRam : null);

  if (ramGb === null) {
    return (
      <div className="card-base p-4 space-y-3">
        <p className="text-xs text-vault-text-muted">Could not detect RAM automatically. Select your total RAM:</p>
        <div className="flex flex-wrap gap-2">
          {RAM_OPTIONS.map((gb) => (
            <button
              key={gb}
              onClick={() => setManualRam(gb)}
              className="btn-secondary text-xs px-3 py-1"
            >
              {gb} GB
            </button>
          ))}
        </div>
      </div>
    );
  }

  const tierIdx = getTierIndex(ramGb, isAppleSilicon);
  const recommended = TIERS[tierIdx];
  const visibleTiers = showAll ? TIERS : [recommended];

  return (
    <div className="space-y-4">
      {/* System banner */}
      <div className="flex items-center gap-3 bg-vault-bg rounded-lg px-4 py-3 border border-vault-border">
        <Cpu className="w-5 h-5 text-vault-accent flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-vault-text-bright">
            {ramGb} GB RAM
            {isAppleSilicon && " · Apple Silicon"}
            {manualRam !== null && <span className="text-vault-text-muted font-normal text-xs"> (manual)</span>}
          </p>
          <p className="text-[10px] text-vault-text-muted">
            {isAppleSilicon
              ? "Unified memory — effective capacity ~30 % higher than listed RAM"
              : "System RAM available for model loading"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${recommended.badgeColor}`}>
            {recommended.badge}
          </span>
          <button
            onClick={() => setManualRam(null)}
            className="text-[9px] text-vault-text-muted hover:text-vault-accent"
          >
            change
          </button>
        </div>
      </div>

      {/* Context window explainer — dynamic when a model is selected */}
      <div className="flex items-start gap-2 text-xs text-vault-text-muted bg-vault-bg/50 rounded-lg px-3 py-2 border border-vault-border">
        <Zap className="w-3.5 h-3.5 text-vault-accent flex-shrink-0 mt-0.5" />
        {config.active_model ? (() => {
          const ctx = getModelContext(config.active_model);
          const name = config.active_model.split("/").pop() || config.active_model;
          return (
            <p>
              <strong className="text-vault-text">{name}</strong>{" "}
              {ctx
                ? <>has a <strong className="text-vault-text">{ctx}</strong> context window{ctx === "32k" ? " — fits ~20 notes at once" : " — fits your entire note history"}.</>
                : "context window unknown — check the model page."}{" "}
              For semantic search the limit doesn't matter — notes are embedded in chunks, not passed raw to the model.
            </p>
          );
        })() : (
          <p>
            <strong className="text-vault-text">Context windows:</strong>{" "}
            Most 7B–14B models support 128k tokens (~100 notes). DeepSeek-R1 32B is capped at 32k.
            For semantic search the limit doesn't matter — notes are embedded in chunks, not passed raw to the model.
          </p>
        )}
      </div>

      {/* Model cards */}
      {visibleTiers.map((tier) => {
        const isMatch = tier.id === recommended.id;
        return (
          <div
            key={tier.id}
            className={`card-base p-4 space-y-3 ${isMatch ? "border-vault-accent/40" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tier.badgeColor}`}>
                {tier.badge}
              </span>
              <span className="text-[10px] text-vault-text-muted">{tier.ramRange}</span>
              {isMatch && !showAll && (
                <span className="text-[10px] text-vault-accent ml-auto">✓ matches your system</span>
              )}
            </div>

            <p className="text-[10px] text-vault-text-muted">{tier.note}</p>

            <div className="grid grid-cols-2 gap-3">
              <ModelCard spec={tier.chat} label="Chat model" />
              <ModelCard spec={EMBED} label="Embedding model (for semantic search)" />
            </div>
          </div>
        );
      })}

      <button
        onClick={() => setShowAll((v) => !v)}
        className="text-[10px] text-vault-accent hover:underline w-full text-center"
      >
        {showAll ? "Show recommended only" : "Show all tiers"}
      </button>
    </div>
  );
}
