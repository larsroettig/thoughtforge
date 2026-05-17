# Build & Test

## Development

```bash
npm run tauri dev        # full Tauri dev server (hot reload)
npm run dev              # Vite only (browser, no Tauri APIs)
```

## Type-check & Tests

```bash
npx tsc --noEmit         # TypeScript type check
npm test                 # Vitest unit tests
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

## Local app bundle (macOS)

```bash
# Clean stale temp DMG files (nullglob avoids zsh "no matches" error)
setopt nullglob 2>/dev/null; rm -f src-tauri/target/release/bundle/dmg/rw.*.dmg; true
# Build .app only (faster than full bundle)
npm run tauri build -- --bundles app
```

Output: `src-tauri/target/release/bundle/macos/ThoughtForge.app`

## Full release bundle (DMG + updater JSON)

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/dmg/ThoughtForge_*.dmg`

## Cargo compile only

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

## Notes

- `.cargo/config.toml` at the project root links Apple's Accelerate framework (required by turbovec/ndarray on macOS). Do not remove it.
- `npm run build` runs `tsc && vite build` — it's the frontend-only step that `tauri build` calls automatically.
- Do not bump the version number unless the user explicitly asks to release a new version.
