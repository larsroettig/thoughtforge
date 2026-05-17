# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x (latest) | :white_check_mark: |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/larsroettig/thoughtforge/security/advisories/new) or by emailing **lroettig@adobe.com**.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected versions

You'll receive an acknowledgement within 48 hours. If confirmed, a patch will be released as soon as possible and you'll be credited in the release notes (unless you prefer anonymity).

## Security Design

ThoughtForge is local-first by design:

- **No network calls** except to `localhost` — the SSRF guard in `src-tauri/src/llm.rs` blocks all non-localhost hosts at the Rust layer
- **No telemetry** — the app cannot phone home
- **Path traversal protection** — all file IDs are validated with an allowlist (`[a-zA-Z0-9_.-]`) before any filesystem operation
- **MCP bearer token** — compared using constant-time equality to prevent timing attacks
- **Content Security Policy** — restricts script, style, and connection sources in the WebView
