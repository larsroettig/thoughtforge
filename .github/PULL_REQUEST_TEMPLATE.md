## Summary

<!-- What does this PR do and why? Link the issue it closes if applicable. -->
<!-- Closes #... -->

## Changes

<!-- List the key changes. Be specific — "updated X to do Y" beats "improved performance". -->

-
-

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs / tests only
- [ ] Dependency update

## Test plan

<!-- How did you verify this works? Include steps to test the golden path and any edge cases. -->

1.
2.

## Security checklist

- [ ] No `unwrap()`/`expect()` on external input in Rust
- [ ] Path inputs validated with `validate_id_component()` before filesystem use
- [ ] No `dangerouslySetInnerHTML` without `DOMPurify.sanitize()` in React
- [ ] All file/network ops go through `invoke()` — no direct `@tauri-apps/plugin-fs` imports
- [ ] No tokens, secrets, or internal paths in error messages or logs

## Screenshots (if UI changes)

<!-- Before / after screenshots help reviewers a lot. -->
