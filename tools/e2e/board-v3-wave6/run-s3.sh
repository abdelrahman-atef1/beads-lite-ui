#!/bin/bash
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-22/tools/e2e/board-v3-wave6
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-22/.work/out/beads-lite-1bo5.6.59/qa-wave6b
rm -f $O/S3.jsonl $O/S3b.jsonl
TAG=-lazy SPEC=smoke.spec.mjs npx playwright test -c playwright.config.mjs -g "S-3" > $O/smoke-lazy.log 2>&1
echo "lazy exit $?" > $O/run-s3.done
