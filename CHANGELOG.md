# Changelog

All notable changes to ThoughtForge are documented here.

## [1.3.0-beta.1] — 2026-05-17

### Added
- **Space Chat** — each project space now has a Chat tab; ask questions about that space's notes and tasks with full context scoped to the space
- **Auto-index on save** — embedding index rebuilds automatically 5s after a note is saved; no manual "Index Notes" click needed for routine updates
- **Tags editing in note editor** — add/remove tags inline in the toolbar; press Enter or comma to add
- **Date editing in note editor** — date field is now a native date picker instead of read-only text
- **Two-phase action extraction** — LLM chat responses stream prose immediately; task actions are extracted in a separate focused call after streaming, improving reliability across models

### Fixed
- **Notes tab badge** now counts only non-meeting notes; Meetings tab shows its own count
- **Shared note/meeting search** — single filter input covers both Notes and Meetings tabs simultaneously
- **Stream listener leak** — Tauri event listeners are now cleaned up on component unmount; no longer accumulate across chat turns
- **Stale note flush** — tab-switch save now reads live note/space refs instead of stale closure values; no more silent data loss on rapid tab switching
- **Spinner unblocks immediately** after streaming ends; action cards appear asynchronously after extraction
- **`Date.now()` IDs replaced** with `crypto.randomUUID()` in chat session creation
- **Effect dependency arrays** corrected in space view (semantic search, index status, space load); all `eslint-disable` suppression comments removed
- **`handleSend`/`handleQuickSend` deduplicated** — shared `sendMessage` helper eliminates ~40 lines of duplicate streaming logic

---

## [1.2.1] — 2026-05-17

### Fixed
- **Note list search** — added text filter input to the Notes and Meetings sidebar; filters by title and content in real time
- **Semantic search errors** — "No models loaded" and "No index yet" now show clear, actionable messages instead of raw HTTP error JSON

---

## [1.2.0] — 2026-05-16

### Added
- **Eisenhower Matrix** — drag-and-drop 2×2 priority/urgency quadrant view
- **Goals view** — SMART goal tracking with progress indicators per space
- **Dark / Light theme** — system-aware theme with manual override in Settings
- **Navigation customisation** — reorder and hide sidebar items in Settings
- **SHA-256 build checksum** — displayed in Settings → App Updates for integrity verification
- **MCP skills folder** — `/skills` in the vault; MCP tools to list, create, fetch, and download skill files from remote URLs
- **dnd-kit drag-and-drop** — all six DnD surfaces migrated from HTML5 drag events to pointer-based dnd-kit (fixes drag in macOS WKWebView)
- **Space ordering** — alphabetical default with manual reorder persisted to localStorage

### Changed
- CLAUDE.md updated with Karpathy behavioral guidelines (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution)
- Settings page reorganised with Navigation and App Updates sections
- Sidebar spaces now sort alphabetically by default, with General always first

### Fixed
- Space drag-and-drop broken in Tauri WKWebView (migrated to dnd-kit)
- StatusBar null guard to avoid crash on empty task list

---

## [1.0.0] — 2026-05-01

### Added
- Local-first vault stored in `~/Documents/ThoughtForge/`
- Kanban board with Time / Status / Day / Calendar views
- Project spaces with notes, documents, goals, meetings, and knowledge tabs
- LM Studio integration for AI chat and semantic search
- MCP server (stdio + HTTP) for Claude Code integration
- Weekly Review stats view
- Archive view
- Notification centre
- File watcher with auto-extraction
- Tauri auto-updater

### Security
- Path traversal guard (`validate_id_component`) on all Rust commands
- SSRF guard (`validate_llm_url`) on all outbound HTTP
- Constant-time MCP token comparison
- DOMPurify on all markdown rendered in the frontend
- CSP tightened; no `fs:allow-*` capabilities in the frontend
