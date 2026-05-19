# Build & Test

## Development

```bash
# Terminal 1 — Rust server (serves on :7432)
cargo run --manifest-path src-tauri/Cargo.toml

# Terminal 2 — Vite HMR (proxies /api to :7432)
bun run dev
```

## Type-check & Tests

```bash
bunx tsc --noEmit                                   # TypeScript type check
bun test                                            # Vitest unit tests
cargo test --manifest-path src-tauri/Cargo.toml    # Rust tests
```

## Build (critical order — rust-embed requires dist/ first)

```bash
bun run build                                      # 1. compile frontend → dist/
cargo build --manifest-path src-tauri/Cargo.toml  # 2. embed dist/ into binary
```

## Release build (optimised)

```bash
bun run build
cargo build --release --manifest-path src-tauri/Cargo.toml
```

## Notes

- **Build order matters.** `cargo build` uses rust-embed to bake `dist/` into the binary at compile time. Always run `bun run build` first.
- `build.rs` emits `cargo:rerun-if-changed=../dist` so Cargo automatically rebuilds when `dist/` changes.
- `.cargo/config.toml` links Apple's Accelerate framework (required by turbovec on macOS). Do not remove it.
- Do not bump the version number unless the user explicitly asks to release a new version.
