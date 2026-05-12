# VaultMind

A local-first AI planning assistant for macOS. Extracts action items from meeting transcripts, manages tasks on a kanban board, and uses a local LLM (via LM Studio) for smart planning -- all without sending data to the cloud.

> **Note:** The name "VaultMind" is a working title. See [Brand Status](#brand-status) below.

## Features

- **Dashboard** with smart filters (My Tasks, Overdue, Due Today, Blocked, etc.)
- **Kanban Board** with 3 views: Time-based, Status-based, and Day-by-day
- **AI Chat** for daily/weekly planning with task modification via confirmation flow
- **Document Processing** -- upload transcripts (.txt, .md, .pdf), auto-extract action items
- **Time Tracking** -- start/stop timer on tasks, hours logged to markdown
- **Watch Folders** -- monitor directories for new transcripts
- **Import** -- import from HTML kanban boards, JSON, or Markdown checklists
- **Quick Actions** -- right-click any task to change status, set due date, assign, archive, or delete
- **Archive** -- completed tasks move to a searchable archive
- **Light/Dark Theme** -- follows macOS system preference, or set manually
- **100% Local** -- no network calls except localhost LM Studio. No telemetry.

## Architecture

| Layer | Technology |
|-------|-----------|
| App framework | Tauri 2.x (Rust backend) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS (CSS variable themes) |
| State | Zustand |
| LLM | OpenAI-compatible API via LM Studio |
| Storage | Markdown files with YAML frontmatter |

### Storage

All data lives as plain markdown files in `~/Documents/VaultMind/`:

```
~/Documents/VaultMind/
  tasks/          # Individual task .md files
  projects/       # Project notes
  boards/         # Board configuration
  chats/          # Chat session logs
  uploads/        # Imported documents
  config.yaml     # App settings
```

### Task Schema

Each task is a markdown file with YAML frontmatter:

```yaml
---
id: "task_20260512_001"
title: "Review quarterly report"
status: todo
priority: high
urgency: this_week
project: marketing
owner: "Alice"
due: 2026-05-14
estimated_hours: 2
actual_hours: 0
archived: false
---

Additional notes here.
```

## Prerequisites

- **macOS** (Apple Silicon recommended)
- **Rust** (1.70+): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** (20+): `brew install node`
- **LM Studio** (for AI features): Download from [lmstudio.ai](https://lmstudio.ai)

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/vaultmind.git
cd vaultmind
npm install
```

### Development

```bash
npm run tauri dev
```

This starts Vite (hot-reload frontend) and compiles the Rust backend. The app opens automatically.

### Production Build

```bash
npm run tauri build
```

Produces:
- `src-tauri/target/release/bundle/macos/VaultMind.app`
- `src-tauri/target/release/bundle/dmg/VaultMind_0.1.0_aarch64.dmg`

### Install

```bash
cp -R src-tauri/target/release/bundle/macos/VaultMind.app /Applications/
```

## Configuration

On first launch, the app creates `~/Documents/VaultMind/` and a default `config.yaml`.

### LM Studio

1. Install and open [LM Studio](https://lmstudio.ai)
2. Load a model: `lms load qwen2.5-7b-instruct` (7B+ for chat, 32B+ for extraction)
3. In VaultMind Settings, verify the URL is `http://localhost:1234` and select your model

### Profile

Set your name in Settings > Profile. This powers the "My Tasks" dashboard filter.

### Watch Folders

Add folders (e.g., your Audio Hijack transcripts directory) in Settings > Watched Folders. New `.txt`, `.md`, and `.pdf` files trigger extraction.

## AI Chat & Planning

The chat connects to LM Studio and can **propose task modifications**:

1. Ask "plan my day" or "change priority of X to high"
2. The AI responds with a plan and **proposed changes**
3. A confirmation card appears: review each change
4. Click **Apply All** to write changes, or **Reject** to discard

The AI never writes to your vault without explicit confirmation.

### Slash Commands

| Command | Description |
|---------|-------------|
| `/plan-day` | Daily plan with priorities and time blocks |
| `/plan-week` | Day-by-day weekly breakdown |
| `/status` | Overview of all projects and blockers |
| `/blocked` | Show blocked or overdue items |
| `/extract` | Extract action items from pasted text |
| `/summarize` | Summarize a project |
| `/prioritize` | Suggest priority ordering |
| `/refine` | Break a task into subtasks |

## Testing

```bash
# TypeScript tests
npm test

# Rust tests
cd src-tauri && cargo test
```

## Brand Status

"VaultMind" is a **working title only**. Brand research found:

- `vaultmind.com` is an active AI security product
- 75+ GitHub repos use the name, including a local-first AI tool in the same space
- The name should be changed before any public release

The brain+vault logo concept is generic and not a concern on its own.

## License

MIT
