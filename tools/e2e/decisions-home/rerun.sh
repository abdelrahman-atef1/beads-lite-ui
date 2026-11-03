#!/usr/bin/env bash
# run without reseeding (dbs untouched since the last seed); warms the feed cache first so the cold-start race (F1) does not mask the other cases
set -u
W=$1; S=$W/.work/scratch/6.26; OUT=$W/.work/out/beads-lite-1bo5.6.26/qa; PORT=3947
: "${BD_BIN:?}"
node "$W/tools/e2e/decisions-home/server.mjs" "$W" "$S" $PORT
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$PORT/ && break; sleep 1; done
export QA_SCRATCH=$S QA_OUT=$OUT QA_URL=http://127.0.0.1:$PORT
cp "$S/probe.mjs" "$W/probe-qa.mjs"; node "$W/probe-qa.mjs" > "$OUT/warmup.log" 2>&1; rm -f "$W/probe-qa.mjs"
cd "$W" && npx playwright test -c tools/e2e/decisions-home/playwright.config.mjs > "$OUT/run.log" 2>&1
echo "exit $?" >> "$OUT/run.log"
taskkill //PID "$(cat "$S/server.pid")" //T //F >/dev/null 2>&1
