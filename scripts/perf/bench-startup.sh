#!/usr/bin/env bash
# Cold-start benchmark: launches the built app N times with a fresh profile and prints the
# median of every metric collected by startup-probe.js (one warm-up run is discarded).
#
# Usage:   scripts/perf/bench-startup.sh [runs] [extra electron flags]
# Example: scripts/perf/bench-startup.sh 7
#          scripts/perf/bench-startup.sh 7 --host-resolver-rules="MAP * ~NOTFOUND"   # simulate offline
# Linux:   prefix with `xvfb-run -a` when there is no display.
set -euo pipefail
cd "$(dirname "$0")/../.."
RUNS=${1:-5}; shift || true
EXTRA_FLAGS=()
if [[ "$(uname)" == "Linux" ]]; then EXTRA_FLAGS+=(--no-sandbox); fi

run_once() {
  local profile; profile=$(mktemp -d)
  npx electron "${EXTRA_FLAGS[@]}" --user-data-dir="$profile" -r ./scripts/perf/startup-probe.js "$@" . 2>/dev/null | grep '^PROBE ' | sed 's/^PROBE //'
  rm -rf "$profile"
}

run_once "$@" >/dev/null
for _ in $(seq 1 "$RUNS"); do run_once "$@"; done | node -e '
  const rows = require("fs").readFileSync(0, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const median = {};
  for (const key of keys) {
    const values = rows.map((row) => row[key]).filter((value) => typeof value === "number").sort((a, b) => a - b);
    median[key] = values[Math.floor(values.length / 2)];
  }
  console.log(JSON.stringify({ runs: rows.length, ...median }, null, 2));
'
