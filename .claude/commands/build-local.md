---
description: Build a local ThoughtForge .app bundle for testing on this machine. Use this whenever the user asks to "build a local test version", "test the app locally", "build local", or similar.
---

Build a local test version of ThoughtForge.

Steps:
1. Clean up any stale temp DMG files that would block the build (use nullglob to avoid zsh "no matches" error):
   ```
   setopt nullglob 2>/dev/null; rm -f src-tauri/target/release/bundle/dmg/rw.*.dmg; true
   ```
2. Run the build in the background (it takes 2-5 minutes):
   ```
   npm run tauri build -- --bundles app
   ```
3. Tell the user the build is running in the background and the output path:
   `src-tauri/target/release/bundle/macos/ThoughtForge.app`
4. When the build finishes, report success or show the last 20 lines of output if it failed.

Do not bump the version number unless the user explicitly asks to release a new version.
