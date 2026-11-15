#!/bin/bash
# QA wave 6b: sequential unattended run (call through heavy-key). Report dir: .work/out/beads-lite-1bo5.6.59/qa-wave6b
cd /e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-22/tools/e2e/board-v3-wave6
export BD_ACTOR=qa
O=/e/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-22/.work/out/beads-lite-1bo5.6.59/qa-wave6b
rm -f $O/run-all.done $O/S3.jsonl
s=$(date +%s)
node coldload.mjs 5 > $O/coldload.log 2>&1; echo "coldload exit $? $(( $(date +%s)-s ))s" >> $O/run-all.done
TAG=-wait WAIT=2500 SPEC=smoke.spec.mjs npx playwright test -g "S-3 lazy" -c playwright.config.mjs > $O/s3-wait.log 2>&1; echo "s3-wait exit $? $(( $(date +%s)-s ))s" >> $O/run-all.done
cp $O/S3.jsonl $O/S3-wait.jsonl; rm -f $O/S3.jsonl
TAG=-nowait WAIT=0 SPEC=smoke.spec.mjs npx playwright test -g "S-3 lazy" -c playwright.config.mjs > $O/s3-nowait.log 2>&1; echo "s3-nowait exit $? $(( $(date +%s)-s ))s" >> $O/run-all.done
cp $O/S3.jsonl $O/S3-nowait.jsonl
TAG=-s1b SPEC=smoke.spec.mjs npx playwright test -g "S-1b" -c playwright.config.mjs > $O/s1b.log 2>&1; echo "s1b exit $? $(( $(date +%s)-s ))s" >> $O/run-all.done
rm -f $O/search-notes.txt
SPEC=search.spec.mjs npx playwright test -c playwright.config.mjs > $O/search.log 2>&1; echo "search exit $? $(( $(date +%s)-s ))s" >> $O/run-all.done
echo finished >> $O/run-all.done
