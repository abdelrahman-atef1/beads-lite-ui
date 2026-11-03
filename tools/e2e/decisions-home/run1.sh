#!/usr/bin/env bash
# rerun1 @ de875e8: reseed, cold-start cases first on fresh servers (F1), then full playwright + degrade (F2, F3). usage: run1.sh <worktree>; needs BD_BIN
set -u
W=$1; S=$W/.work/scratch/6.26; OUT=$W/.work/out/beads-lite-1bo5.6.26/qa/rerun1; PORT=3947
: "${BD_BIN:?}"
mkdir -p "$OUT"
stop(){ [ -f "$S/server.pid" ] && taskkill //PID "$(cat "$S/server.pid")" //T //F >/dev/null 2>&1; rm -f "$S/server.pid"; }
stop
for d in wsA wsB wsC; do [ -d "${S:?}/$d" ] && rm -rf "${S:?}/${d:?}"; done
mkdir -p "$S/wsC" && cp -r E:/Projects/beads-lite/.beads "$S/wsC/.beads" && rm -f "$S"/wsC/.beads/*.lock
sed -i '/additional:/,/beads-planning/d' "$S/wsC/.beads/config.yaml"
(cd "$S/wsC" && git init -q .)
node "$W/tools/e2e/decisions-home/seed.mjs" "$S" > "$OUT/seed.log" 2>&1
export QA_SCRATCH=$S QA_OUT=$OUT QA_URL=http://127.0.0.1:$PORT
wait_up(){ for i in $(seq 1 60); do curl -s -o /dev/null $QA_URL/ && return; sleep 1; done; }
# F1a: two list-decisions-all calls 1.5 s apart on a fresh server
node "$W/tools/e2e/decisions-home/server.mjs" "$W" "$S" $PORT; wait_up
cp "$S/probe2.mjs" "$W/probe2-qa.mjs"; node "$W/probe2-qa.mjs" > "$OUT/F1-probe2.log" 2>&1; rm -f "$W/probe2-qa.mjs"
stop; sleep 2
# F1b: browser, fresh server, watch 30 s
node "$W/tools/e2e/decisions-home/server.mjs" "$W" "$S" $PORT; wait_up
( cd "$W" && node tools/e2e/decisions-home/cold.mjs > "$OUT/F1-cold-browser.log" 2>&1 )
# rest: same server, warm now
cp "$S/probe.mjs" "$W/probe-qa.mjs"; node "$W/probe-qa.mjs" > "$OUT/warmup.log" 2>&1; rm -f "$W/probe-qa.mjs"
cd "$W" && npx playwright test -c tools/e2e/decisions-home/playwright.config.mjs > "$OUT/run.log" 2>&1
echo "exit $?" >> "$OUT/run.log"
stop
# D14/D15 degrade (F3 check)
node tools/e2e/decisions-home/degrade.mjs "$W" "$S" "$OUT" > "$OUT/degrade.log" 2>&1
echo "done" > "$OUT/DONE"
