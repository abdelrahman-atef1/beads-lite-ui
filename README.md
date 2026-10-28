# beads-lite-ui

A fork of [mantoni/beads-ui](https://github.com/mantoni/beads-ui) (the local web board for the `bd` CLI), changed to run on top of our [beads-lite](https://github.com/abdelrahman-atef1/beads-lite) `bd` and to work from a phone.

Why: upstream's board shells out to `bd` for every refresh, which was slow and queued behind other processes on our machine (about 1,600 beads in the biggest project, many agents at once). Our board (a) reads through a small shared data layer, 4 `bd` calls per refresh and one refresh in flight at a time; (b) rejects pages from other origins (Host allowlist, Origin check, per-launch token on the socket); (c) is being redesigned ("board v2") for a phone screen, Arabic/RTL and owner decisions (cards, reports, notifications).

## Branches (read this first)

| Branch | What it is |
|---|---|
| `main` | Upstream `mantoni/beads-ui` **0.12.6** exactly as cloned, plus this README. Kept so the diff against upstream stays visible. |
| `swe/board-v2` | **Our current line.** Upstream 0.12.6 plus the faster data layer, socket hardening and the board v2 shell. Build from this one. |
| `swe/*`, `ux/*`, `qa/*`, `sre/*`, `cto/*` | Task branches, merged into `swe/board-v2` by the CTO. |

The full upstream README (features, `bdui` CLI, env vars) is kept as [`README.upstream.md`](README.upstream.md).

## Install and run on the owner's PC

The board is a built copy in a folder outside this repo, started at logon by the company script `scripts/start-beads-ui.sh` (in the private company repo; scheduled task `CompanyBeadsUI`).

```
# from a swe/board-v2 checkout (Node 22+)
npm install
bash scripts/install-board.sh <abs dest>     # builds the frontend, copies app/ server/ bin/ to <dest>
bash <company>/scripts/start-beads-ui.sh     # starts it on 127.0.0.1:3000, registers every project with .beads
```

- The board talks to `bd` through `BD_BIN`, which the script points at the installed beads-lite shim (the same `bd.exe` every other caller uses; see the [beads-lite runbook](https://github.com/abdelrahman-atef1/beads-lite/blob/lite-integration/docs/runbooks/cutover.md)).
- It listens on `127.0.0.1` only. For the phone, the design publishes a second listener tailnet-only with Tailscale serve (never Funnel): [ADR 0006](https://github.com/abdelrahman-atef1/beads-lite/blob/lite-integration/docs/decisions/0006-board-decision-cards-and-wake.md), [ADR 0007](https://github.com/abdelrahman-atef1/beads-lite/blob/lite-integration/docs/decisions/0007-board-notifications-and-outputs.md) (notifications and outputs).
- `BDUI_PORT` picks another port to try a build beside the live board.

**Roll back:** start with `BDUI_ROLLBACK=1` (the script then runs the original npm `beads-ui` install instead of this fork). Nothing in the bead data changes, the board only reads and writes through `bd`.

## Docs

- Design for board v2 (tokens, mockup, three directions): [`design/`](https://github.com/abdelrahman-atef1/beads-lite-ui/tree/swe/board-v2/design) and [`docs/design`](https://github.com/abdelrahman-atef1/beads-lite-ui/tree/swe/board-v2/docs/design).
- Architecture and protocol (inherited from upstream): [`docs/architecture.md`](https://github.com/abdelrahman-atef1/beads-lite-ui/blob/swe/board-v2/docs/architecture.md), [`docs/adr`](https://github.com/abdelrahman-atef1/beads-lite-ui/tree/swe/board-v2/docs/adr).
- Product decisions live in the beads-lite repo: [`docs/decisions`](https://github.com/abdelrahman-atef1/beads-lite/tree/lite-integration/docs/decisions) (ADRs 0006 and 0007 are the board).
- The `bd` it runs on: [beads-lite](https://github.com/abdelrahman-atef1/beads-lite) and its [spec](https://github.com/abdelrahman-atef1/beads-lite/tree/lite-integration/specs/001-fast-compact-tracker).

## Relation to other projects

- **Upstream** [mantoni/beads-ui](https://github.com/mantoni/beads-ui) (MIT, Copyright (c) 2025 Maximilian Antoni): where the code comes from. We have not sent changes back.
- **[beads-lite](https://github.com/abdelrahman-atef1/beads-lite)**: our fork of the `bd` CLI; this board is its companion. Not related to [dcosson/beads-lite](https://github.com/dcosson/beads-lite), a different project with the same name ([ADR 0005](https://github.com/abdelrahman-atef1/beads-lite/blob/lite-integration/docs/decisions/0005-prior-art-dcosson-beads-lite.md)).

## Licence

MIT. [`LICENSE`](LICENSE) is upstream's, unchanged (Copyright (c) 2025 Maximilian Antoni). We add no separate licence for our changes.

Not a product and not supported for others: it is the board of one small company, published so the fork is auditable.
