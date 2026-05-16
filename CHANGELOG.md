# Changelog

All notable changes to ThoughtForge are documented here.

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
