# QA scripts for the board project filter (beads-lite-1bo5.13.24.1/.2)
Cases: docs/qa/cases/board-project-filter.md. Scripts were run from `.work/scratch/<bead>/` of the QA worktree (paths inside are that worktree's).
- prep.mjs: copies ALL registered stores (no backup folder, no locks) to scratch.
- srv.mjs: starts the board the way production does, on scratch copies only (isolated HOME, wake disabled).
- run.mjs: broad run (projects, tasks, desk, stats, new task, visuals, slow 3G/offline).
- run3.mjs: targeted re-run (filters, desk search, new-task flows, stats vs rollup recount).
- b1b.mjs: desk Project chip after direct load vs in-app arrival; flow-stats key handling.
Run through the heavy key; reports land in `.work/out/<bead>/qa/`.
