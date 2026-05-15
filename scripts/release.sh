#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.0
#
# Prerequisites:
#   - gh CLI authenticated (gh auth login)
#   - TAURI_SIGNING_PRIVATE_KEY env var set (for update signatures)
#   - TAURI_SIGNING_PRIVATE_KEY_PASSWORD env var set (can be empty string)

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  (e.g. 0.2.0)"
  exit 1
fi
TAG="v$VERSION"

# ── QA ───────────────────────────────────────────────────────────────────────
echo "Installing frontend deps..."
npm ci

echo "[1/3] TypeScript check..."
npx tsc --noEmit

echo "[2/3] Frontend tests..."
npm test -- --run

echo "[3/3] Rust tests..."
(cd src-tauri && cargo test)

echo "All QA checks passed."

# ── version bump ─────────────────────────────────────────────────────────────
echo "Bumping version to $VERSION..."

# package.json
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"

# tauri.conf.json
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  p.version = '$VERSION';
  fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(p, null, 2) + '\n');
"

# Cargo.toml
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

echo "Version bumped in package.json, tauri.conf.json, Cargo.toml"

# ── build ────────────────────────────────────────────────────────────────────
echo "Building Tauri app (this takes a few minutes)..."
npm run tauri build

# ── collect artifacts ────────────────────────────────────────────────────────
BUNDLE_DIR="src-tauri/target/release/bundle"
ARTIFACTS=()

while IFS= read -r -d '' f; do
  ARTIFACTS+=("$f")
done < <(find "$BUNDLE_DIR" \
  \( -name "*.dmg" \
  -o -name "*.app.tar.gz" \
  -o -name "*.app.tar.gz.sig" \
  -o -name "*.deb" \
  -o -name "*.rpm" \
  -o -name "*.AppImage" \
  -o -name "*.AppImage.sig" \
  -o -name "*.msi" \
  -o -name "*.msi.sig" \
  -o -name "latest.json" \
  \) -print0 2>/dev/null)

if [[ ${#ARTIFACTS[@]} -eq 0 ]]; then
  echo "No artifacts found in $BUNDLE_DIR"
  exit 1
fi

echo "Found artifacts:"
printf '  %s\n' "${ARTIFACTS[@]}"

# ── generate latest.json for updater ─────────────────────────────────────────
# tauri build --bundles updater would normally do this; if not present, skip.
LATEST_JSON="$BUNDLE_DIR/latest.json"
if [[ ! -f "$LATEST_JSON" ]]; then
  echo "No latest.json found — updater endpoint will not be updated this release."
fi

# ── commit + tag ─────────────────────────────────────────────────────────────
echo "Committing version bump..."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock 2>/dev/null || true
git commit -m "chore: bump to $TAG"
git tag "$TAG"
git push origin main --tags

# ── GitHub release ────────────────────────────────────────────────────────────
echo "Creating GitHub release $TAG..."
gh release create "$TAG" \
  --title "ThoughtForge $TAG" \
  --notes "See the commit history for changes." \
  "${ARTIFACTS[@]}"

echo ""
echo "Release $TAG published:"
echo "  https://github.com/larsroettig/thoughtforge/releases/tag/$TAG"
