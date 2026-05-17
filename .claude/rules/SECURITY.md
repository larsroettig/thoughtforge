# Security Rules — Always Apply

These rules are non-negotiable. Apply them to every change, regardless of scope.

## Rust (*.rs)

1. **No `unsafe` without justification.** Document invariants with `# Safety` if unavoidable.
2. **No `unwrap()` / `expect()` on external input.** Use `?` and `map_err`. Panics = denial of service.
3. **Validate all IDs at command entry points.** Call `validate_id_component()` before any path join. Allowlist: `[a-zA-Z0-9_.-]`, no leading `.`, no `..`, no `\`.
4. **Canonicalize paths; check containment.** Use `canonicalize()` + `starts_with(base)`. Never trust user-provided paths directly.
5. **No sensitive data in error strings.** Error messages returned to the frontend must not leak tokens, config values, or internal paths beyond what the user already knows.
6. **SSRF guard on all outbound URLs.** Call `crate::llm::validate_llm_url()` before any `reqwest` call. Blocks non-localhost hosts, metadata endpoints, and non-http(s) schemes.
7. **Constant-time token comparison.** For any bearer token check, use the `constant_time_eq()` helper in `bin/mcp.rs` — never `==` on secret bytes.
8. **Checked arithmetic.** Use `checked_add` / `checked_mul` for any user-influenced size calculations.
9. **No banned crypto.** Never use MD5, SHA-1, RC4, DES, AES-ECB. Use SHA-256+ for hashing.

## TypeScript / React (*.ts, *.tsx)

1. **Never use `dangerouslySetInnerHTML` without DOMPurify.** Any markdown rendered with `marked` must be passed through `DOMPurify.sanitize()` first. No exceptions.
2. **No `eval()`, `new Function()`, or `innerHTML =` with untrusted data.**
3. **Use `crypto.randomUUID()` for IDs and nonces.** Never `Date.now()` or `Math.random()` for anything security-relevant.
4. **Tauri IPC only.** All file and network operations must go through `invoke()` to custom Rust commands. Do not import `@tauri-apps/plugin-fs` directly in frontend components.
5. **Do not log tokens or config secrets.** `console.log` / `console.error` must not receive `mcp_token`, `lm_studio_url` credentials, or similar values.
6. **All user values that reach file paths must be validated on the Rust side.** The TypeScript side sends data; the Rust side validates it before touching the filesystem.
7. **Strict equality only.** Use `===` / `!==`. Avoid `==` / `!=`.
8. **No dynamic `require()`.** Use static imports only.

## General

- Run `npm audit` and `cargo audit` before any release. Fix HIGH/CRITICAL findings.
- Keep `src-tauri/capabilities/main.json` minimal. Do not add `fs:allow-*` beyond what the frontend directly needs (currently none — all FS I/O goes through custom commands).
- `shell:allow-spawn` is only needed for the MCP sidecar. Do not add shell execution for other purposes.
