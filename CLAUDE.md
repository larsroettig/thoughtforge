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

## Behavioral Guidelines

These rules bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Every changed line must trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan before coding:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

**Working if:** fewer unnecessary diff changes, no rewrites due to overcomplication, clarifying questions come before implementation.

---

## Planning Mode — Interview First

**CRITICAL: Before entering plan mode or writing any implementation plan, you MUST interview the user.**

Follow this protocol every time you are about to plan a non-trivial task:

1. **Explore first.** Before asking a question that the codebase can answer, read the relevant code. Never ask "how does X work?" when you can grep for it yourself.

2. **Interview relentlessly.** Walk down the design tree, resolving dependencies between decisions one branch at a time. Do not batch all questions upfront — ask one focused question, get an answer, then ask the next one that depends on it.

3. **Recommend, don't just ask.** For each question, state your recommended answer and the reasoning behind it. Let the user redirect or confirm.

4. **Cover these branches in order:**
   - Scope: What exactly changes, what is explicitly out of scope?
   - Data model: New fields, migrations, backward-compatibility?
   - Backend: Which Tauri commands, new or modified? Validation rules?
   - Frontend: Which components, new or modified? State changes?
   - Security: Does this touch file paths, network, IDs, HTML rendering, or tokens?
   - Testing: What's the test plan? Can it be verified in the UI?
   - Rollout: Reversible? Migration path for existing data?

5. **Do not start implementation** until you have explicit agreement on the plan from the user.

---

## Security Rules — Always Apply

### Rust (*.rs)

1. **No `unsafe` without justification.** Document invariants with `# Safety` if unavoidable.
2. **No `unwrap()` / `expect()` on external input.** Use `?` and `map_err`. Panics = denial of service.
3. **Validate all IDs at command entry points.** Call `validate_id_component()` before any path join. Allowlist: `[a-zA-Z0-9_.-]`, no leading `.`, no `..`, no `\`.
4. **Canonicalize paths; check containment.** Use `canonicalize()` + `starts_with(base)`. Never trust user-provided paths directly.
5. **No sensitive data in error strings.** Error messages returned to the frontend must not leak tokens, config values, or internal paths beyond what the user already knows.
6. **SSRF guard on all outbound URLs.** Call `crate::llm::validate_llm_url()` before any `reqwest` call. Blocks non-localhost hosts, metadata endpoints, and non-http(s) schemes.
7. **Constant-time token comparison.** For any bearer token check, use the `constant_time_eq()` helper in `bin/mcp.rs` — never `==` on secret bytes.
8. **Checked arithmetic.** Use `checked_add` / `checked_mul` for any user-influenced size calculations.
9. **No banned crypto.** Never use MD5, SHA-1, RC4, DES, AES-ECB. Use SHA-256+ for hashing.

### TypeScript / React (*.ts, *.tsx)

1. **Never use `dangerouslySetInnerHTML` without DOMPurify.** Any markdown rendered with `marked` must be passed through `DOMPurify.sanitize()` first. No exceptions.
2. **No `eval()`, `new Function()`, or `innerHTML =` with untrusted data.**
3. **Use `crypto.randomUUID()` for IDs and nonces.** Never `Date.now()` or `Math.random()` for anything security-relevant.
4. **Tauri IPC only.** All file and network operations must go through `invoke()` to custom Rust commands. Do not import `@tauri-apps/plugin-fs` directly in frontend components.
5. **Do not log tokens or config secrets.** `console.log` / `console.error` must not receive `mcp_token`, `lm_studio_url` credentials, or similar values.
6. **All user values that reach file paths must be validated on the Rust side.** The TypeScript side sends data; the Rust side validates it before touching the filesystem.
7. **Strict equality only.** Use `===` / `!==`. Avoid `==` / `!=`.
8. **No dynamic `require()`.** Use static imports only.

### General

- Run `npm audit` and `cargo audit` before any release. Fix HIGH/CRITICAL findings.
- Keep `src-tauri/capabilities/main.json` minimal. Do not add `fs:allow-*` beyond what the frontend directly needs (currently none — all FS I/O goes through custom commands).
- `shell:allow-spawn` is only needed for the MCP sidecar. Do not add shell execution for other purposes.

---

## Build & Test

```bash
# Rust
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml

# TypeScript
npx tsc --noEmit
npm test

# Full Tauri dev
npm run tauri dev
```

`.cargo/config.toml` at the project root links Apple's Accelerate framework (needed by turbovec/ndarray on macOS).
