#!/usr/bin/env bash
# beads-lite-1bo5.6.26 QA: reseed scratch dbs (copies / throwaway), start board on a spare port, run, stop.
# usage: run.sh <worktree> ; needs BD_BIN (full path of bd.exe)
set -u
W=$1; S=$W/.work/scratch/6.26; OUT=$W/.work/out/beads-lite-1bo5.6.26/qa; PORT=3947
: "${BD_BIN:?}"
mkdir -p "$OUT"
if [ -f "$S/server.pid" ]; then taskkill //PID "$(cat "$S/server.pid")" //T //F >/dev/null 2>&1; fi
for d in wsA wsB wsC; do [ -d "${S:?}/$d" ] && rm -rf "${S:?}/${d:?}"; done
mkdir -p "$S/wsC" && cp -r E:/Projects/beads-lite/.beads "$S/wsC/.beads" && rm -f "$S"/wsC/.beads/*.lock
sed -i '/additional:/,/beads-planning/d' "$S/wsC/.beads/config.yaml"
(cd "$S/wsC" && git init -q .)
node "$W/tools/e2e/decisions-home/seed.mjs" "$S" > "$OUT/seed.log" 2>&1
node "$W/tools/e2e/decisions-home/server.mjs" "$W" "$S" $PORT
sleep 4
export QA_SCRATCH=$S QA_OUT=$OUT QA_URL=http://127.0.0.1:$PORT
cp "$S/probe.mjs" "$W/probe-qa.mjs"; node "$W/probe-qa.mjs" > "$OUT/warmup.log" 2>&1; rm -f "$W/probe-qa.mjs"
cd "$W" && npx playwright test -c tools/e2e/decisions-home/playwright.config.mjs > "$OUT/run.log" 2>&1
echo "exit $?" >> "$OUT/run.log"
taskkill //PID "$(cat "$S/server.pid")" //T //F >/dev/null 2>&1
