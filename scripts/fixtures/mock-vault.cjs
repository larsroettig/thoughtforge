// Static mock vault data for screenshot automation.
// Story: AI/ML researcher workspace with 3 project spaces.

const today = "2026-05-15";
const tasks = [
  // ── Q1: Urgent + Important (overdue/today + critical/high) ──────────
  {
    id: "task_001", title: "Fix data pipeline OOM crash blocking experiments",
    status: "blocked", priority: "critical", urgency: "overdue", project: "research",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-10", due: "2026-05-12", estimated_hours: 4, actual_hours: 1.0,
    blocked_by: [], subtasks: [], notes: "Crashes on batch size > 512. Likely a memory leak in the DataLoader.", archived: false, time_only: false,
  },
  {
    id: "task_002", title: "Submit ICLR 2026 camera-ready paper",
    status: "in_progress", priority: "critical", urgency: "today", project: "writing",
    owner: "alex", collaborators: ["maya"], source: "ICLR 2026 notification", source_quote: "",
    created: "2026-05-14", due: today, estimated_hours: 6, actual_hours: 3,
    blocked_by: [], subtasks: ["Fix figure 3", "Update bibliography"], notes: "Deadline is 23:59 AoE. Final formatting pass needed.", archived: false, time_only: false,
  },
  {
    id: "task_003", title: "Debug CUDA kernel regression in training loop",
    status: "todo", priority: "high", urgency: "today", project: "infrastructure",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-14", due: today, estimated_hours: 3, actual_hours: 0,
    blocked_by: ["task_001"], subtasks: [], notes: "Regression introduced in commit a3f9b2c. Bisect to find root cause.", archived: false, time_only: false,
  },

  // ── Q2: Not Urgent + Important (this_week/next_2weeks + critical/high) ──
  {
    id: "task_004", title: "Design sparse attention mechanism variant",
    status: "in_progress", priority: "high", urgency: "this_week", project: "research",
    owner: "alex", collaborators: ["priya"], source: "", source_quote: "",
    created: "2026-05-12", due: "2026-05-20", estimated_hours: 12, actual_hours: 4,
    blocked_by: [], subtasks: ["Literature review", "Prototype in PyTorch", "Benchmark vs dense"], notes: "Based on Longformer but with learned sparsity patterns.", archived: false, time_only: false,
  },
  {
    id: "task_005", title: "Write related work section for NeurIPS submission",
    status: "in_progress", priority: "critical", urgency: "this_week", project: "writing",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-11", due: "2026-05-19", estimated_hours: 8, actual_hours: 2,
    blocked_by: [], subtasks: [], notes: "Focus on efficient transformers and sparse attention. ~1500 words.", archived: false, time_only: false,
  },
  {
    id: "task_006", title: "Review open PRs on lab GitHub repository",
    status: "todo", priority: "high", urgency: "next_2weeks", project: "research",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-10", due: "2026-05-26", estimated_hours: 2, actual_hours: 0,
    blocked_by: [], subtasks: [], notes: "5 PRs open: 3 from PhD students, 2 from collaborators.", archived: false, time_only: false,
  },
  {
    id: "task_007", title: "Prepare NeurIPS 2026 submission outline",
    status: "todo", priority: "high", urgency: "next_2weeks", project: "writing",
    owner: "alex", collaborators: ["maya", "priya"], source: "", source_quote: "",
    created: "2026-05-08", due: "2026-05-28", estimated_hours: 4, actual_hours: 0,
    blocked_by: [], subtasks: ["Define contribution", "Sketch experiments", "Assign sections"], notes: "Abstract deadline June 1. Outline must be finalized before that.", archived: false, time_only: false,
  },

  // ── Q3: Urgent + Not Important (today + medium/low) ─────────────────
  {
    id: "task_008", title: "Reply to Reviewer #3 rebuttal questions",
    status: "todo", priority: "medium", urgency: "today", project: "writing",
    owner: "alex", collaborators: [], source: "ICLR reviewer portal", source_quote: "The authors should clarify the computational cost of their method.",
    created: "2026-05-14", due: today, estimated_hours: 1, actual_hours: 0,
    blocked_by: [], subtasks: [], notes: "", archived: false, time_only: false,
  },
  {
    id: "task_009", title: "Update README for open-source toolkit release",
    status: "todo", priority: "low", urgency: "today", project: "infrastructure",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-13", due: today, estimated_hours: 1, actual_hours: 0,
    blocked_by: [], subtasks: [], notes: "Add installation instructions and quickstart example.", archived: false, time_only: false,
  },

  // ── Q4: Not Urgent + Not Important (ongoing + low/medium) ───────────
  {
    id: "task_010", title: "Organize Zotero reference library",
    status: "todo", priority: "low", urgency: "ongoing", project: "research",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-04-20", due: "", estimated_hours: 2, actual_hours: 0,
    blocked_by: [], subtasks: [], notes: "", archived: false, time_only: false,
  },
  {
    id: "task_011", title: "Read tangentially related NLP papers",
    status: "todo", priority: "medium", urgency: "ongoing", project: "research",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-04-15", due: "", estimated_hours: 4, actual_hours: 0,
    blocked_by: [], subtasks: [], notes: "Backlog: 12 papers in 'to-read' folder.", archived: false, time_only: false,
  },
  {
    id: "task_012", title: "Archive old experiment log files from H100 cluster",
    status: "todo", priority: "low", urgency: "ongoing", project: "infrastructure",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-04-10", due: "", estimated_hours: 1, actual_hours: 0,
    blocked_by: [], subtasks: [], notes: "", archived: false, time_only: false,
  },

  // ── In Progress (Kanban variety) ────────────────────────────────────
  {
    id: "task_013", title: "Implement gradient checkpointing to reduce VRAM usage",
    status: "in_progress", priority: "high", urgency: "this_week", project: "research",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-12", due: "2026-05-20", estimated_hours: 5, actual_hours: 2,
    blocked_by: [], subtasks: [], notes: "Using torch.utils.checkpoint. Targeting 40% VRAM reduction.", archived: false, time_only: false,
  },
  {
    id: "task_014", title: "Write experiment reproducibility guide for lab wiki",
    status: "in_progress", priority: "medium", urgency: "this_week", project: "writing",
    owner: "maya", collaborators: [], source: "", source_quote: "",
    created: "2026-05-10", due: "2026-05-18", estimated_hours: 3, actual_hours: 1,
    blocked_by: [], subtasks: [], notes: "", archived: false, time_only: false,
  },

  // ── Review ───────────────────────────────────────────────────────────
  {
    id: "task_016", title: "Ablation study: compare 4 attention variants",
    status: "review", priority: "high", urgency: "this_week", project: "research",
    owner: "priya", collaborators: ["alex"], source: "", source_quote: "",
    created: "2026-05-08", due: "2026-05-15", estimated_hours: 8, actual_hours: 9,
    blocked_by: [], subtasks: [], notes: "Results are in. Sparse-learned outperforms all baselines by 2.1% avg.", archived: false, time_only: false,
  },
  {
    id: "task_017", title: "Draft introduction section — NeurIPS paper",
    status: "review", priority: "medium", urgency: "next_2weeks", project: "writing",
    owner: "maya", collaborators: ["alex"], source: "", source_quote: "",
    created: "2026-05-07", due: "2026-05-22", estimated_hours: 4, actual_hours: 5,
    blocked_by: [], subtasks: [], notes: "First draft complete. Needs another pass.", archived: false, time_only: false,
  },

  // ── Done ─────────────────────────────────────────────────────────────
  {
    id: "task_018", title: "Train baseline model on WikiText-103",
    status: "done", priority: "high", urgency: "this_week", project: "research",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-12", due: "2026-05-14", estimated_hours: 6, actual_hours: 7.5,
    blocked_by: [], subtasks: [], notes: "Final PPL: 18.3. Saved checkpoint at /checkpoints/baseline-v1.", archived: false, time_only: false,
  },
  {
    id: "task_019", title: "Preprocess and validate CommonCrawl dataset subset",
    status: "done", priority: "high", urgency: "this_week", project: "research",
    owner: "priya", collaborators: ["alex"], source: "", source_quote: "",
    created: "2026-05-10", due: "2026-05-13", estimated_hours: 10, actual_hours: 12,
    blocked_by: [], subtasks: [], notes: "5.2B tokens after deduplication. Quality filters applied.", archived: false, time_only: false,
  },
  {
    id: "task_020", title: "Containerize inference pipeline with Docker",
    status: "done", priority: "medium", urgency: "this_week", project: "infrastructure",
    owner: "alex", collaborators: [], source: "", source_quote: "",
    created: "2026-05-11", due: "2026-05-14", estimated_hours: 4, actual_hours: 3.5,
    blocked_by: [], subtasks: [], notes: "Published to registry: ghcr.io/lab/inference:v1.2", archived: false, time_only: false,
  },
];

const goals = {
  writing: [
    {
      id: "goal_001", title: "Publish ICLR 2026 paper",
      metric: "paper accepted", target: "acceptance notification",
      current: "camera-ready submitted",
      difficulty: "stretch", space: "writing", due: "2026-01-31",
      status: "active", linked_tasks: ["task_002", "task_005"],
      notes: "Conditional accept — need strong camera-ready.", created: "2026-01-15",
    },
  ],
  research: [
    {
      id: "goal_002", title: "Reach 90% F1 on WinoGrad benchmark",
      metric: "F1 score", target: "0.90", current: "0.82",
      difficulty: "moderate", space: "research", due: "2026-06-30",
      status: "active", linked_tasks: ["task_001", "task_004", "task_016"],
      notes: "Need to fix data pipeline first, then run full eval.", created: "2026-03-01",
    },
  ],
  infrastructure: [
    {
      id: "goal_003", title: "Release open-source toolkit v1.0",
      metric: "GitHub stars", target: "500", current: "47",
      difficulty: "easy", space: "infrastructure", due: "2026-07-31",
      status: "active", linked_tasks: ["task_009", "task_020"],
      notes: "Toolkit includes tokenizer, dataloader, and eval harness.", created: "2026-02-10",
    },
  ],
};

const spaces = [
  {
    id: "general", name: "General", color: "#6c5ce7",
    description: "Daily notes, fleeting thoughts, and personal tasks",
    created: "2026-01-01", archived: false, documents: [], timeEntries: [],
    goals: [],
  },
  {
    id: "research", name: "Research", color: "#bc8cff",
    description: "ML experiments, paper work, and benchmarking",
    created: "2026-01-01", archived: false, documents: [], timeEntries: [],
    goals: goals.research,
  },
  {
    id: "writing", name: "Writing", color: "#58a6ff",
    description: "Papers, documentation, and technical writing",
    created: "2026-01-01", archived: false, documents: [], timeEntries: [],
    goals: goals.writing,
  },
  {
    id: "infrastructure", name: "Infrastructure", color: "#f0883e",
    description: "Compute, MLOps, and tooling",
    created: "2026-01-01", archived: false, documents: [], timeEntries: [],
    goals: goals.infrastructure,
  },
];

const notes = {
  research: [
    {
      id: "note_001", title: "Run #47 — sparse attention results",
      type: "daily", date: "2026-05-14",
      content: "Run #47 with sparse-learned attention (k=64) shows +3.2% on WinoGrad dev set vs dense baseline. Training loss converged faster — ~18% fewer steps to same validation PPL. Next: run full eval on 3 held-out benchmarks.",
      tags: ["experiments", "attention", "results"],
    },
    {
      id: "note_002", title: "Lab meeting — Q2 GPU budget approved",
      type: "meeting", date: "2026-05-12",
      content: "Attendees: Alex, Maya, Priya, Prof. Kim\n\n**Budget**: 4× H100 80GB nodes approved through August. Cluster access starts May 20.\n\n**Action items**:\n- Alex: fix OOM pipeline before cluster access\n- Priya: finalize ablation study by May 17\n- Maya: submit reproducibility guide to wiki",
      tags: ["meeting", "lab", "compute"],
    },
    {
      id: "note_003", title: "Architecture idea — sparse routing with learned gates",
      type: "note", date: "2026-05-10",
      content: "Key insight: instead of fixed sparsity patterns (Longformer, BigBird), learn a gating function per head that decides which tokens to attend to. The gate is a small 2-layer MLP conditioned on the query.\n\nPotential issues:\n- Training instability (gate collapse)\n- Discrete routing → need Gumbel-softmax or straight-through estimator\n\nReference: Mixture of Experts literature for inspiration.",
      tags: ["architecture", "ideas", "attention"],
    },
  ],
  writing: [],
  infrastructure: [],
};

const config = {
  vault_path: "/Users/demo/Documents/ThoughtForge",
  lm_studio_url: "http://localhost:1234",
  active_model: "meta-llama-3.1-8b-instruct",
  embedding_model: "nomic-embed-text-v1.5",
  watched_folders: [],
  auto_process: true,
  theme: "dark",
  user_name: "Alex",
  country: "US",
  notifications_enabled: true,
  mcp_enabled: false,
  mcp_token: "",
  weekly_hours_target: 38,
  status_colors: {
    todo: "#8b949e",
    in_progress: "#d29922",
    review: "#58a6ff",
    done: "#3fb950",
    blocked: "#f85149",
  },
};

module.exports = { mockVault: { tasks, spaces, notes, config } };
