# Contract: board data (client side)

Status: client part implemented (T036/T036b). The server part is future work and
optional: the client degrades without it.

## Sources the board subscribes to (already in place)

`tab:all` (every non-closed issue), `tab:board:ready`, `tab:board:blocked`,
`tab:board:closed` (newest closed, shown 50 at a time). Issues may carry
`title_ar`, `assignee`, `priority`, `issue_type`, `labels`, `updated_at`, and
`card_*` metadata for decision beads.

## Per-project counts (workspace switcher, design 5.5)

The switcher shows, per project: name, bead count, and "N waiting"
(owner_decision).

Each entry of `workspaces[]` in the `list-workspaces` reply MAY carry:

```json
{
  "path": "C:\\Users\\x\\company",
  "database": "...",
  "counts": { "total": 1619, "owner_decision": 2 }
}
```

- `counts.total`: non-closed beads in that project. `counts.owner_decision`:
  beads in status `owner_decision`.
- One cheap count per project (a `COUNT(*)` grouped by status over that
  project's own database), computed only when `list-workspaces` is asked (app
  load, and when the switcher opens). No polling, no background work.
- Absent `counts` (today's server): the row shows "-". The CURRENT project
  always falls back to counting the loaded `tab:all` slice, so the owner's badge
  is right even without the server change.
- A project whose count failed omits `counts`; it never blocks the other rows
  (FR-015).

Fixture: `app/data/fixtures/list-workspaces.counts.json` (used by
`app/views/workspace-picker.test.js`).

Server change (NOT done, left for later): add `counts` in
`getAvailableWorkspaces()` in `server/ws.js`.

## Filters and search (client only)

State: `beads-ui.board-filter` in localStorage (`chip`: all|mine|p01, `type`,
`label`); the search text is not persisted. "Mine" = `assignee` equals
`beads-ui.me` (default `abdelrahman`). Matching runs over the loaded slice: id
substring, `title`, `title_ar`. No server call.
