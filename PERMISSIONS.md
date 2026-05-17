# ThoughtForge — Tauri Permissions Reference

This document explains every permission declared in
`src-tauri/capabilities/main.json`, why it is needed, and what is
explicitly **not** granted.

## Granted permissions

### Core IPC

| Permission | Purpose |
|---|---|
| `core:default` | Tauri runtime internals required by every app |
| `core:event:default` | Base event system |
| `core:event:allow-listen` | Frontend subscribes to backend events (e.g. file-watcher changes, LLM stream chunks) |
| `core:event:allow-emit` | Frontend emits events to the Rust side |
| `core:event:allow-emit-to` | Targeted event delivery to specific windows |

### Filesystem — `fs:default` (`$HOME/**`)

The vault lives in `~/Documents/ThoughtForge/` by default (user-configurable).
The `$HOME/**` scope is required so the user can choose any subdirectory of
their home folder as the vault root.

**The frontend never touches the filesystem directly.**
All reads and writes go through custom Tauri commands in `src-tauri/src/vault.rs`
which enforce:

- `validate_id_component()` — allowlist `[a-zA-Z0-9_.-]`, no `..`, no leading `.`
- `canonicalize()` + `starts_with(base)` — every resolved path must stay inside the vault root

`@tauri-apps/plugin-fs` is intentionally **not** exposed to the frontend.

### Dialog

| Permission | Used by | Why |
|---|---|---|
| `dialog:default` | Plugin base | Required by the plugin |
| `dialog:allow-open` | Settings vault-path picker, document upload | Native file-picker dialog — user-initiated only |
| `dialog:allow-save` | Export flows | Native save dialog — user-initiated only |

### Shell

| Permission | Used by | Why |
|---|---|---|
| `shell:default` | Plugin base | Required by the plugin |
| `shell:allow-open` | In-app links | Opens URLs in the user's default browser (`open` command) |
| `shell:allow-spawn` | `src-tauri/src/mcp.rs:start_mcp_server` | Spawns the MCP sidecar binary — the only binary ever spawned is the bundled `mcp` executable; no user-supplied paths are passed to `spawn` |

`shell:allow-kill` is **not** granted — the MCP sidecar is stopped via its own
shutdown logic, not by killing the process from the outside.

### Notifications

| Permission | Purpose |
|---|---|
| `notification:default` | Plugin base |
| `notification:allow-is-permission-granted` | Check OS notification permission before prompting |
| `notification:allow-request-permission` | Request OS notification permission (user-prompted) |
| `notification:allow-notify` | Send desktop notifications for task reminders and app alerts |

### Autostart

| Permission | Purpose |
|---|---|
| `autostart:default` | Plugin base |
| `autostart:allow-enable` | Enable "Launch at Login" — only triggered from the Settings toggle |
| `autostart:allow-disable` | Disable "Launch at Login" |
| `autostart:allow-is-enabled` | Read current autostart state to reflect it in Settings |

The user has full control; the app never enables autostart without
an explicit Settings action.

### Updater

| Permission | Purpose |
|---|---|
| `updater:default` | Plugin base |
| `updater:allow-check` | Check GitHub Releases for a newer version |
| `updater:allow-download-and-install` | Download and apply the signed update bundle |

Updates are fetched exclusively from
`https://github.com/larsroettig/thoughtforge/releases/latest/download/latest.json`
and verified against the minisign public key in `tauri.conf.json`.

### Process

| Permission | Purpose |
|---|---|
| `process:default` | Plugin base |
| `process:allow-restart` | Restart the app after configuration changes that require a fresh start |

---

## What is NOT granted

| Capability | Reason omitted |
|---|---|
| `fs:allow-*` (direct plugin access) | All FS I/O goes through validated Rust commands |
| `clipboard:*` | App has no copy/paste integration |
| `global-shortcut:*` | No global keyboard shortcuts |
| `http:*` | All network calls go through Rust (`reqwest` with SSRF guard) |
| `env:*` | No need to read environment variables from the frontend |
| `shell:allow-kill` | MCP sidecar shut down gracefully; kill not needed |
| Any `window:*` manipulation | App manages its own single window only |

---

## Network policy

All outbound network traffic is restricted at the Rust layer by
`crate::llm::validate_llm_url()` in `src-tauri/src/llm.rs`:

- **Allowed:** `localhost`, `127.0.0.1`, `::1` (LM Studio)
- **Blocked:** all non-localhost hosts, RFC-1918 private ranges, cloud metadata
  endpoints (`169.254.169.254`, `metadata.google.internal`, etc.)
- **Schemes:** `http` and `https` only

The Content Security Policy in `tauri.conf.json` mirrors this:

```
connect-src 'self' http://localhost:* http://127.0.0.1:*
```

No telemetry. The app cannot phone home.
