#!/bin/bash
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/tools/e2e/board-v3-wave5
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/out/beads-lite-1bo5.6.59/qa-wave5
: > $O/bulk4-notes.txt; : > $O/time-notes.txt
for s in bulk4 time bulk bmatrix; do
  echo "== $s start $(date +%T)" >> $O/run-all.log
  SPEC=$s.spec.mjs npx playwright test -c playwright.config.mjs > $O/run-$s.log 2>&1
  echo "== $s exit $? $(date +%T)" >> $O/run-all.log
done
echo DONE >> $O/run-all.log
