# VaultMind / ThoughtForge — Claude Code Instructions

## Project Overview

Tauri v2 desktop app (macOS-first). Rust backend + React 19 / TypeScript frontend.
Local-first: all data stored in `~/Documents/ThoughtForge/` (or user-configured vault path).

**Key directories:**
- `src/` — React frontend (TypeScript + Tailwind)
- `src-tauri/src/` — Rust backend (Tauri commands, LLM client, MCP server, search)
- `src-tauri/capabilities/` — Tauri permission declarations
- `scripts/fixtures/` — Demo data seeds

**Main modules:**
| File | Role |
|------|------|
| `src-tauri/src/vault.rs` | All file I/O: tasks, spaces, notes, config |
| `src-tauri/src/llm.rs` | LM Studio HTTP client + SSRF guard |
| `src-tauri/src/search.rs` | turbovec semantic search + embedding cache |
| `src-tauri/src/mcp.rs` | MCP sidecar lifecycle |
| `src-tauri/src/mcp_tools.rs` | MCP tool definitions |
| `src-tauri/src/bin/mcp.rs` | Standalone MCP binary (stdio + HTTP) |
| `src-tauri/src/watcher.rs` | File-system watcher (FD-safe) |
| `src/hooks/useVault.ts` | Frontend ↔ backend IPC via `invoke()` |
| `src/stores/appStore.ts` | Zustand global state |

---

## Reference Docs

Read these only when the task requires it — don't load all of them upfront.

| Topic | File |
|-------|------|
| Build commands, local test builds, release bundles | `.claude/rules/BUILD.md` |
| Security rules (Rust + TypeScript + general) | `.claude/rules/SECURITY.md` |
| Planning mode interview protocol | `.claude/rules/PLANNING.md` |
| Behavioral guidelines (Simplicity, Surgical Changes, etc.) | `.claude/rules/GUIDELINES.md` |

**Security rules in `.claude/rules/SECURITY.md` are non-negotiable — apply them to every change.**
