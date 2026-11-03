#!/usr/bin/env bash
# F1 browser cold start on a fresh server (rerun1b)
set -u
W=$1; S=$W/.work/scratch/6.26; OUT=$W/.work/out/beads-lite-1bo5.6.26/qa/rerun1; PORT=3947
export QA_SCRATCH=$S QA_OUT=$OUT QA_URL=http://127.0.0.1:$PORT
[ -f "$S/server.pid" ] && taskkill //PID "$(cat "$S/server.pid")" //T //F >/dev/null 2>&1
node "$W/tools/e2e/decisions-home/server.mjs" "$W" "$S" $PORT
for i in $(seq 1 90); do curl -s -o /dev/null $QA_URL/ && break; sleep 1; done
( cd "$W" && node tools/e2e/decisions-home/cold.mjs > "$OUT/F1-cold-browser.log" 2>&1 )
taskkill //PID "$(cat "$S/server.pid")" //T //F >/dev/null 2>&1; rm -f "$S/server.pid"
echo done > "$OUT/COLD-DONE"
