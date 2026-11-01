#!/usr/bin/env bash
# Installs the Opengrep CLI (LGPL-2.1, open-source fork of Semgrep CE) from its GitHub releases into
# ~/.local/bin, for the rules addon (addons/rules/opengrep). Version: $OPENGREP_VERSION (a release tag such
# as v1.2.3), the latest release when empty. Never fails the job: without Opengrep the rules addon uses
# its own detect() functions.
set -u
dir="$HOME/.local/bin"; mkdir -p "$dir"
case "$(uname -m)" in x86_64) asset=opengrep_manylinux_x86 ;; aarch64|arm64) asset=opengrep_manylinux_aarch64 ;; *) echo "::warning::no Opengrep build for $(uname -m)"; exit 0 ;; esac
# gh needs a github.com token; on GitHub Enterprise runners (no such token) the public release URL instead
fetch() {
  if [ -n "${GH_TOKEN:-}" ] && GH_HOST=github.com gh release download ${OPENGREP_VERSION:-} --repo opengrep/opengrep --pattern "$asset" --dir /tmp/opengrep --clobber; then return 0; fi
  mkdir -p /tmp/opengrep
  if [ -n "${OPENGREP_VERSION:-}" ]; then u="https://github.com/opengrep/opengrep/releases/download/$OPENGREP_VERSION/$asset"; else u="https://github.com/opengrep/opengrep/releases/latest/download/$asset"; fi
  curl -fsSL --retry 3 -o "/tmp/opengrep/$asset" "$u"
}
if fetch; then
  install -m 755 "/tmp/opengrep/$asset" "$dir/opengrep"
  echo "$dir" >> "$GITHUB_PATH"
  "$dir/opengrep" --version
else
  echo "::warning::Opengrep could not be downloaded; the rules addon falls back to its own detect()."
fi
exit 0
