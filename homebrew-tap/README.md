# homebrew-thoughtforge

Homebrew tap for [ThoughtForge](https://github.com/lroettig/thoughtforge).

## Install

```sh
brew tap lroettig/thoughtforge
brew install thoughtforge
thoughtforge   # opens http://127.0.0.1:7432
```

## Releasing a new version

1. Build and publish the GitHub release (CI creates the tarballs automatically).
2. Get the SHA256 values from the `.sha256` files attached to the release.
3. Update `Formula/thoughtforge.rb`:
   - bump `version`
   - replace both `sha256` values

Then commit and push to this tap repo. Users running `brew upgrade thoughtforge` will get the new version.
