import fs from 'node:fs';
fs.appendFileSync('E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-22/.work/scratch/qa6b/wake-calls.log', JSON.stringify(process.argv.slice(2)) + '\n');
