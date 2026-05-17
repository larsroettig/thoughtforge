# Contributing to ThoughtForge

Thanks for your interest in contributing. This document covers how to get started, the development workflow, and the standards we apply.

## Getting started

**Prerequisites:**
- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 20+
- [Tauri CLI](https://tauri.app/start/prerequisites/) prerequisites for your OS
- [LM Studio](https://lmstudio.ai/) (optional, for testing AI features)

```bash
git clone https://github.com/larsroettig/thoughtforge.git
cd thoughtforge
npm install
npm run tauri dev
```

## Project layout

```
src/                  React 19 frontend (TypeScript + Tailwind)
src-tauri/src/        Rust backend (Tauri commands, LLM, search, MCP)
src-tauri/src/bin/    Standalone MCP binary
.github/workflows/    CI workflows
docs/                 Jekyll documentation site
scripts/fixtures/     Demo data seeds
```

Key files: `src-tauri/src/vault.rs` (all file I/O), `src-tauri/src/llm.rs` (LM Studio client), `src-tauri/src/search.rs` (vector search), `src/hooks/useVault.ts` (frontend IPC).

## Development workflow

1. Fork and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run checks before opening a PR:

```bash
# Type-check frontend
npx tsc --noEmit

# Rust lint
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Frontend tests
npm test

# Dependency audit
cargo audit --manifest-path src-tauri/Cargo.toml
npm audit
```

4. Open a pull request against `main`

## Security rules

All contributions must follow the security rules in [`.claude/rules/SECURITY.md`](.claude/rules/SECURITY.md). Key points:

- **No `unwrap()`/`expect()` on external input** in Rust — use `?` and `map_err`
- **Validate all IDs** with `validate_id_component()` before any path join
- **Canonicalize paths** and verify containment with `starts_with(base)`
- **No `dangerouslySetInnerHTML`** without `DOMPurify.sanitize()` in React
- **All file/network ops** go through `invoke()` — never import `@tauri-apps/plugin-fs` directly

## Reporting vulnerabilities

See [SECURITY.md](SECURITY.md). Do not open public issues for security bugs.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add calendar view to kanban board
fix: prevent stale note flush on rapid edits
docs: update MCP server setup guide
chore: bump tauri-plugin-updater to 2.5
```

## Code style

- **Rust**: `cargo fmt` before committing; no `unwrap()` on external input; document `# Safety` on any `unsafe` block
- **TypeScript**: strict mode enabled; `===` only; no `eval()` or `innerHTML =`
- **CSS**: Tailwind utility classes; dark-mode variants for every colour

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
