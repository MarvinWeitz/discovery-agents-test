#!/usr/bin/env bash
# Runs the deterministic part of the pipeline (no atlas rendering, no browser) with a given toolkit
# checkout, so base and head can be compared: run.sh <toolkit-dir> <app-dir> <out-dir> [curated.json]
set -euo pipefail
tk=$(cd "$1" && pwd); app=$2; out=$3; curated=${4:-}
node "$tk/bin/discover.js" "$app" "$out/run" | tail -n1
node "$tk/bin/atlas-facts.js" "$out/run" "$out/atlas-data.json" ${curated:+--base "$curated"} | tail -n1
node "$tk/bin/gen-tests.js" "$out/run" | tail -n1
