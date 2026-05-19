class Thoughtforge < Formula
  desc "Local-first AI planning assistant — runs as a local web server"
  homepage "https://github.com/lroettig/thoughtforge"
  version "1.3.1"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/lroettig/thoughtforge/releases/download/v#{version}/thoughtforge-v#{version}-aarch64.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
    on_intel do
      url "https://github.com/lroettig/thoughtforge/releases/download/v#{version}/thoughtforge-v#{version}-x86_64.tar.gz"
      sha256 "REPLACE_WITH_X86_64_SHA256"
    end
  end

  def install
    bin.install "thoughtforge"
    bin.install "vaultmind-mcp"
    # Install the React SPA where the binary expects to find it:
    # <exe-dir>/../share/thoughtforge/ resolves to this path.
    (share/"thoughtforge").install Dir["dist/."]
  end

  def caveats
    <<~EOS
      ThoughtForge is installed. To start:
        thoughtforge

      Opens http://127.0.0.1:7432 in your browser automatically.
      Stop with Ctrl-C.

      To update the SHA256 in this formula after a new release, get the
      value from the .sha256 files attached to the GitHub release.
    EOS
  end

  test do
    fork { exec bin/"thoughtforge" }
    sleep 2
    assert_match "version", shell_output("curl -sf http://127.0.0.1:7432/api/version")
  end
end
