# beads-lite-ui redesign: design spec

Owner, 2026-10-25: «لا اصلاً محتاجة اعادة تصميم لان تصميمها سيء جداً اعملها تصميم عملي ومودرن على ستيتش».
Author: بو (UX). Status: spec + reference mockup done; **Stitch step NOT done** (see section 1).

## 1. Stitch status (honest)

The UX helper session had no Stitch MCP tools (ToolSearch for "stitch" returned nothing; no Stitch entry in `~/.claude.json` or settings). So there are **no Stitch links**. What exists instead:
- `mockup.html` + `tokens.css`: a hand-built, runnable reference (light/dark, LTR/RTL, desktop/phone) rendered at 1440x900 and 390x844 into `screens/`.
- Next step for whoever has Stitch (a main session with the Stitch MCP): generate the 6 screens in section 5 one at a time (`modelId GEMINI_3_5_FLASH_LITE`, project `designSystem` from `tokens.css`, prompt "use ONLY the copy given; add no other text", check `deviceType`), and list the links here. Per lessons-app, Stitch output is look-and-feel only: this file and `tokens.css` stay the source of truth.

Open the mockup: `design/mockup.html?screen=board|decisions|detail|states&theme=light|dark&dir=ltr|rtl[&ws=1]`; phone: `design/phone-frame.html?<same query>`.

## 2. What is wrong today (rendered 127.0.0.1:3000/#/board, 1440x900, dark)

- Seven equal columns overflow 1440 and need a horizontal scrollbar; the owner's column (Owner decision) is the 4th, hidden by scanning order, not by need.
- While loading, every column shows a "0" badge and empty space: looks like "nothing waiting", which is false (Doherty: be honest with a skeleton).
- Workspace picker shows a raw path (`C:\Users\abduu\company`); no per-project count of things waiting on the owner.
- Text-only status badges with colour as the only difference; English title only (no `title_ar`); tab bar of Issues/Epics/Board gives no scent for "what needs me".

## 3. Design principles (lenses)

1. **Owner-first scan**: the owner opens this to answer decisions and see movement. "Waiting on you" is the first column, has a warm outline, and also a top-level destination with a count badge (Time-to-first-value).
2. **Arabic first**: when `title_ar` exists it is the card title (`dir="auto"`, 15px/600, line-height 1.35, max 2 lines); the English title is a 12px secondary line (`direction:ltr`). Ids are always `direction:ltr; unicode-bidi:isolate` mono. Never an Arabic letter touching a Latin letter/digit (lessons-app rule).
3. **Colour is never alone**: each status has colour + glyph + label (glyphs: ! owner, play progress, check test, arrows merge, circle ready, square blocked, tick closed).
4. **Logical properties only** (`margin-inline-*`, `inset-inline-*`, `border-inline-*`): RTL is a mirror, not a second stylesheet. Column order mirrors in RTL (Owner decision at the right, first read).
5. **Payload**: no webfonts, no images, no icon font (inline SVG, <= 12 icons), no framework added. Reuse lit-html/vanilla. The mockup is 14 KB.
6. **Bounded**: columns render a slice (see FR-011): Closed is a collapsed rail with count and "show recent 50 / show 50 more".

## 4. Tokens (`tokens.css`, ready to merge into `app/styles.css`)

- Surfaces: `--bg --surface --surface-2 --border`; text: `--text --text-2 --text-3` (contrast >= 4.5:1 on surface, light and dark); accent `--accent` (focus ring, primary button, selection).
- Status pairs (fg + tinted bg), light and dark: `--s-owner --s-progress --s-test --s-merge --s-ready --s-blocked --s-closed` (+ `-bg`). Priority `--p0..--p4`.
- Space `--sp-1..6` (4/8/12/16/24/32); radius `--radius-s/m/l` 6/10/14; type `--fs-xs..xl` 12/13/15/18/24, weights 400/600 only; `--lh-body 1.6` (Arabic), `--lh-tight 1.35`.
- Font stack: Segoe UI, Noto Sans Arabic, Noto Sans, Tahoma, system-ui (all local).
- Sizes: `--col-w minmax(200px,1fr)`, `--rail-w 56px`, `--tap 44px` (phone min target; desktop controls 36px).
- Theme: `data-theme="light|dark"` on `<html>`; default follows `prefers-color-scheme`, toggle stored in localStorage (as today). `prefers-reduced-motion` kills the skeleton shimmer.
- Direction: `<html dir>` follows a stored choice, default `auto` from the UI language (ar/en toggle in the Theme menu). The app keeps working in LTR English.

## 5. Screens (all in `screens/`, rendered by me at real viewports)

| Screen | File | Viewport |
|---|---|---|
| Board, light, LTR | `board-light-ltr-1440.png` | 1440x900 |
| Board, dark, RTL | `board-dark-rtl-1440.png` | 1440x900 |
| Board, phone, RTL | `board-light-rtl-390.png` | 390x844 (in 500px frame) |
| Owner-decision queue, dark LTR / phone RTL / phone dark | `decisions-dark-ltr-1440.png`, `decisions-light-rtl-390.png`, `decisions-dark-ltr-390.png` | 1440 / 390 |
| Issue detail, light RTL | `detail-light-rtl-1440.png` | 1440x900 |
| Workspace switcher open | `workspace-dark-ltr-1440.png` | 1440x900 |
| States sheet (loading, empty, error, offline, not found, bounded closed) | `states-light-ltr-1440.png` | 1440x900 |

### 5.1 Shell
Desktop: 56px left rail (inline-start): Board, Decisions (badge = owner_decision count), List, Theme. Top bar: workspace button, search (focus with `/`), primary "New". Phone (<= 720px): rail becomes a 60px bottom tab bar (same four items, 44px targets, thumb zone), search becomes an icon button, "New" becomes "+".
Replaces Issues/Epics/Board tabs: "List" keeps the old Issues table; Epics becomes a filter chip (`type: epic`) on List and Board. Deep links `#/issues?issue=<id>` unchanged: they open Detail (dialog over the board on desktop, full page on phone); the router file `app/router.js` is untouched by this design.

### 5.2 Board
Columns, in reading order: Owner decision (`owner_decision`), In progress, Waiting for test, Waiting for merge, Ready (`open` + no blocker, today's "TODO"), Blocked, then Closed rail. At 1440 all six open columns plus the rail fit without scrolling; below that the board scrolls horizontally, phone snaps one column (86vw) at a time.
Card (`.card`): row 1 title (`title_ar` else title), row 2 English title (only when `title_ar` exists), row 3 meta: id (full, own line on cards), priority `P0-P4` coloured, a tag (`tap` / `PC only` / `blocked`), age (relative: 20m, 3h, 2d), assignee initials chip. Whole card is the link. Count per column in the header, tabular numerals.
Filter chips row: All / Mine / P0-P1 / Type / Label (single-select quick chips; Type and Label open a menu). State is kept in the URL hash query so it survives refresh.
Drag and drop: not in v1 (status change lives in Detail; accidental drags on a phone cost trust). Forgiveness: any status change from Detail shows a 6 s "Undo" toast.

### 5.3 Owner-decision queue (the owner's main door)
List of decision cards, oldest first, one per `owner_decision` bead, reading `card_*` per `~/company/knowledge/decision-card.md`:
- Head: priority, id, "asked 2h ago", then title: `title_ar` (tap/type, ar), else `card_title`, else bead title. `desk` cards show `card_title` only.
- Body: `card_q` (18px/600), "what changes for you" = `card_effect`, `card_show` in a tinted box when present, "frozen" line = `card_blocks` in owner colour.
- Options = `card_opts` as buttons, the `rec:true` one is the primary-filled button with "recommended". Tapping an option opens an inline "Confirm: <label> / Back" (two taps, nothing written before Confirm), then writes a record comment and returns the bead to `card_back`. Type class: one text field + Send. A dashed "Explain more" button opens the bead.
- **Never-by-phone / desk classes** (labels `owner-pc-only, security, spend, secret, publish, deploy, film-*` or `card_class=desk`): no buttons at all, a red strip "PC only: answer in the chat session at your PC". The UI must disable answering these on any device, since the rule is "never by phone"; the board cannot know the device, so it never offers buttons on them.
- Empty: check glyph, "Nothing waiting on you", hint that new ones appear in the tab badge. The badge never shows a stale "0" while loading (see states).

### 5.4 Issue detail
Two columns on desktop (content | properties), one column on phone with properties collapsed under the title as chips. Title block: back link, id, `title_ar` as H1 (24/600), English as subtitle. Sections: Description (first 600 chars, "Show all"), Comments (latest 5 of N, "Load older"; author, relative time; composer pinned at the bottom of the section), Properties (status with glyph, priority, assignee, project, labels, blocks/blocked-by as id links, updated). Edits (status, assignee, priority) are inline selects, saved on change with Undo toast. Matches SC-006: nothing is rendered that was not requested (no 246 KB comment dump).
Open states: if the bead is a decision, the decision card (5.3) renders above Description.

### 5.5 Workspace switcher
Popover from the top-bar button: one row per project: colour dot, name (not path), bead count, and a "N ⚑" count of owner_decision waiting there. Keyboard: arrows + Enter, `Esc` closes. Selection persists in localStorage as today. A project load never blocks another (FR-015): rows show counts from a single cheap count call, or "-" if not loaded.

### 5.6 Search and filter
`/` focuses search; `Esc` clears. Matches id prefix, `title`, `title_ar` (client-side over the already-loaded slice, filter on 120 ms debounce so typing never waits on the server); when nothing matches in the slice a row "Search all of company" calls the server (one request, only on the explicit action). Results replace the board columns in place (matching cards stay in their columns; non-matches dim to 0 and columns with 0 collapse to a one-line header). Chips as 5.2.

## 6. States (every screen)

| State | Behaviour |
|---|---|
| Loading | Column headers and counts stay; counts show "-" (never 0); each column shows 2-3 skeleton cards (68px, shimmer, off under reduced-motion). First paint target 2 s (SC-002). |
| Empty column | one muted line "Nothing here" (ar: "لا شيء هنا"); Owner decision column empty = positive state ("Nothing waiting on you"). |
| Empty workspace (0 beads) | centred text + "Create the first bead" button. |
| Error (tracker unreachable) | banner under the top bar in `--s-blocked`: message, "showing data from 12:04", auto-retry every 5 s with back-off, "Retry now" button; last good data stays visible (Degrade, never break). |
| Offline / socket lost | neutral banner "Live updates paused. Reconnecting..."; reads from last data; write buttons are disabled with the tooltip "Needs a connection" (owner answers are never queued silently). |
| Not found (deep link) | "<id> was not found. It may live in another workspace." + "Search all workspaces" button. |
| Closed slice | rail shows count; expanded shows 50 most recent + "Show 50 more". |
| Quota/limit | not applicable: all local; no paid quota exists. |

## 7. Accessibility
Focus ring 2px `--focus`, offset 2px, on every control; targets >= 36px desktop, 44px phone; columns are `section` with `aria-label`; badge has text; status glyphs `aria-hidden` next to the text label; live region (`aria-live=polite`) announces "N new decisions"; Arabic `lang="ar"` on text runs when UI is English; reduced-motion honoured; contrast >= 4.5:1 body, 3:1 for glyph fills (verify with an automated check in the build).

## 8. Implementation handoff (swe)
Suggested order, each its own bead, behaviour unchanged:
1. Merge `tokens.css` into `app/styles.css` replacing the colour/spacing variables (keep old names as aliases for one release); dark via `data-theme` as today.
2. Shell: rail + tab bar + top bar replacing `app/views/nav.js` tabs; keep `router.js` routes and `#/issues?issue=` deep links (existing `main.deep-link.test.js` must pass).
3. Board columns + card + closed rail + skeleton (`app/views/board.js`; tests `board*.test.js` updated, new: Arabic title preference, count never 0 while loading).
4. Decisions view reading `card_*` metadata; options write via the existing comment/update API; PC-only strip. Needs the tracker to expose metadata in list results (cto: confirm in beads-lite API, one extra field set).
5. Detail, workspace popover (needs per-project owner_decision count: cto), search.
Acceptance: render each screen at 1440x900 and 390x844, light and dark, LTR and RTL, match `screens/`; qa checks the states table; Lighthouse-style contrast check passes.

## 9. Left out / risks
- No drag and drop, no swimlanes, no custom columns UI (statuses beyond the seven fall into a "Other" column header appended at the end, not designed here).
- No Stitch yet (section 1); icon glyphs in the mockup are text characters and render inconsistently (the search glyph shows oddly in Arabic): production uses inline SVG.
- Per-project owner count and decision metadata in list results are API asks for the cto; if refused, the badge falls back to counting the loaded slice (Degrade).
- Decision answering from the web board is itself a new write path for `card_*` beads; sec should look at it before it ships (it must honour the never-by-phone classes).
