#!/bin/bash
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/tools/e2e/board-v3-wave5
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/out/beads-lite-1bo5.6.59/qa-wave5
: > $O/wave5-notes.txt; rm -f $O/run6.done
TAG=-r6 SPEC=wave5.spec.mjs npx playwright test -c playwright.config.mjs -g "X-2c" > $O/run6-wave5.log 2>&1
echo "exit $?" > $O/run6.done
