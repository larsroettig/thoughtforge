---
name: thoughtforge
description: Manage tasks, project spaces, and notes in ThoughtForge. Search notes with hybrid BM25 + vector search. Use when users ask about their tasks, projects, meetings, daily notes, or want to find something in their knowledge base.
license: MIT
compatibility: Requires ThoughtForge running locally. Install via `brew tap lroettig/thoughtforge && brew install thoughtforge`.
metadata:
  author: Lars Roettig
  version: "1.3.1"
allowed-tools: Bash(thoughtforge:*)
---

# ThoughtForge CLI

ThoughtForge is a local-first AI planning assistant. It stores tasks, project spaces, and notes in `~/Documents/ThoughtForge/`. The `thoughtforge` binary doubles as a CLI for agentic workflows.

## Status Check

```bash
thoughtforge status
```

Returns vault path, space count, active task count, and LLM configuration as JSON.

```bash
thoughtforge --version
```

## List Spaces

```bash
thoughtforge spaces
```

Returns all project spaces as a JSON array with id, name, color, and creation date.

## Tasks

### List all active tasks

```bash
thoughtforge tasks
```

Human-readable table. For machine consumption:

```bash
thoughtforge tasks --json
```

### Filter by space or status

```bash
thoughtforge tasks --space general
thoughtforge tasks --status in_progress
thoughtforge tasks --space ai-team --status todo --json
```

Valid statuses: `todo` | `in_progress` | `review` | `done` | `blocked`

### Find a specific task

```bash
thoughtforge tasks --json | jq '.[] | select(.title | test("deploy"; "i"))'
thoughtforge tasks --status in_progress --json | jq '.[].title'
```

## Notes

### List notes in a space

```bash
thoughtforge notes general
thoughtforge notes ai-team --type meeting
thoughtforge notes general --type daily
```

Valid types: `daily` | `meeting` | `note`

Returns JSON array with id, title, type, date, content, and tags.

### Read a specific note

```bash
thoughtforge notes general --json | jq '.[] | select(.title | test("standup"; "i")) | .content'
```

## Search

Hybrid search combines BM25 keyword matching with vector semantic search via Reciprocal Rank Fusion. Requires an embedding model loaded in LM Studio or Ollama.

### Search notes in a space

```bash
thoughtforge search general "quarterly planning"
thoughtforge search ai-team "decision made last week" --limit 5
```

### Machine-readable output

```bash
thoughtforge search general "API design" --json
```

Returns array of `{ note_id, title, date, note_type, preview, score }`.

### Search workflow for agents

1. List spaces to find the right collection:
   ```bash
   thoughtforge spaces | jq '.[].id'
   ```

2. Search for relevant notes:
   ```bash
   thoughtforge search <space-id> "<query>" --json
   ```

3. Retrieve full content if the preview isn't enough:
   ```bash
   thoughtforge notes <space-id> --json | jq '.[] | select(.id == "<note_id>") | .content'
   ```

## Index

Build or refresh the search index for a space (needed before first search):

```bash
thoughtforge index general
thoughtforge index ai-team
```

Requires an embedding model. Returns `{ indexed, total, status }`.

## Retrieval Workflow

1. **Check status** — confirm vault is initialized and see what's there.
2. **List spaces** — find the relevant collection.
3. **Search** — use a focused query; 3–8 discriminative words work best.
4. **Read notes** — fetch full content for any result worth citing.
5. **Filter tasks** — combine `--space` and `--status` for precise views.

## Common Patterns

```bash
# What's blocking me today?
thoughtforge tasks --status blocked --json | jq '.[].title'

# Recent meeting notes
thoughtforge notes general --type meeting --json | jq 'sort_by(.date) | reverse | .[:5] | .[].title'

# Find anything about a topic across a space
thoughtforge search ai-team "LLM evaluation criteria" --limit 10

# Task count by status
thoughtforge tasks --json | jq 'group_by(.status) | map({status: .[0].status, count: length})'
```

## API (HTTP)

When the server is running on `http://127.0.0.1:7432`, the same data is accessible via REST:

```bash
curl -s -X POST http://127.0.0.1:7432/api/read_tasks \
  -H "Content-Type: application/json" -d '{}' | jq '.'

curl -s -X POST http://127.0.0.1:7432/api/search_space_notes \
  -H "Content-Type: application/json" \
  -d '{"space_id":"general","query":"quarterly goals","limit":5}' | jq '.'
```

## Server Flags

```bash
thoughtforge                   # start server + open browser (default)
thoughtforge --http            # start server, no browser (API / headless mode)
thoughtforge --http --port 8080  # custom port
thoughtforge --daemon          # fork to background, no browser (prints PID and exits)
```

`--http`, `--daemon`, and `--port` work with or without the explicit `serve` subcommand.

## Setup

```bash
brew tap lroettig/thoughtforge
brew install thoughtforge
thoughtforge            # opens http://127.0.0.1:7432 in browser
thoughtforge --daemon   # runs in background; access at http://127.0.0.1:7432
```

Or for development:

```bash
bun run build
cargo run --manifest-path src-tauri/Cargo.toml
```

## Pitfalls

- **Search requires indexing.** Run `thoughtforge index <space>` before first search and after adding many new notes.
- **Embedding model needed.** Semantic search requires an embedding model in LM Studio (e.g. `nomic-embed-text`) or Ollama.
- **Space ids use hyphens.** `ai-team` not `ai team`. Use `thoughtforge spaces | jq '.[].id'` to see exact ids.
- **`done` tasks are excluded from `tasks_active` in status** but visible in `thoughtforge tasks --json`.
