#!/usr/bin/env bash
# Installs the Opengrep CLI (LGPL-2.1, open-source fork of Semgrep CE) from its GitHub releases into
# ~/.local/bin, for the rules addon (addons/rules/opengrep). Version: $OPENGREP_VERSION (a release tag such
# as v1.2.3), the latest release when empty. Never fails the job: without Opengrep the rules addon uses
# its own detect() functions.
set -u
dir="$HOME/.local/bin"; mkdir -p "$dir"
case "$(uname -m)" in x86_64) asset=opengrep_manylinux_x86 ;; aarch64|arm64) asset=opengrep_manylinux_aarch64 ;; *) echo "::warning::no Opengrep build for $(uname -m)"; exit 0 ;; esac
if gh release download ${OPENGREP_VERSION:-} --repo opengrep/opengrep --pattern "$asset" --dir /tmp/opengrep --clobber; then
  install -m 755 "/tmp/opengrep/$asset" "$dir/opengrep"
  echo "$dir" >> "$GITHUB_PATH"
  "$dir/opengrep" --version
else
  echo "::warning::Opengrep could not be downloaded; the rules addon falls back to its own detect()."
fi
exit 0
