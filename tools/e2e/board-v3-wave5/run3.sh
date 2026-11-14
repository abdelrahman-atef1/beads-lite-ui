#!/bin/bash
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/tools/e2e/board-v3-wave5
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/out/beads-lite-1bo5.6.59/qa-wave5
: > $O/wave5-notes.txt; rm -f $O/run4.done
TAG=-r4 SPEC=wave5.spec.mjs npx playwright test -c playwright.config.mjs -g "L-3|X-1/2" > $O/run4-wave5.log 2>&1
echo "exit $?" > $O/run4.done
