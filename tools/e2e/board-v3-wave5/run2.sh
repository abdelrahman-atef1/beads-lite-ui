#!/bin/bash
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/tools/e2e/board-v3-wave5
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/out/beads-lite-1bo5.6.59/qa-wave5
: > $O/run2.log; : > $O/wave5-notes.txt
for s in wave5 bulk4 time; do
  echo "== $s start $(date +%T)" >> $O/run2.log
  TAG=-r2 SPEC=$s.spec.mjs npx playwright test -c playwright.config.mjs > $O/run2-$s.log 2>&1
  echo "== $s exit $? $(date +%T)" >> $O/run2.log
done
echo "== bulk B-1 repeat $(date +%T)" >> $O/run2.log
TAG=-b1rep SPEC=bulk.spec.mjs npx playwright test -c playwright.config.mjs -g "B-1 " --repeat-each=4 > $O/run2-bulkb1.log 2>&1
echo "== bulk B-1 exit $? $(date +%T)" >> $O/run2.log
echo DONE >> $O/run2.log
