#!/bin/bash
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-19/tools/e2e/board-v3-wave6
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-19/.work/out/beads-lite-1bo5.6.59/qa-wave6
rm -f $O/S3.jsonl $O/S3b.jsonl $O/search-notes.txt $O/smoke-notes.txt $O/run-s.done
for s in search smoke; do
  SPEC=$s.spec.mjs npx playwright test -c playwright.config.mjs > $O/$s.log 2>&1
  echo "$s exit $?" >> $O/run-s.done
done
