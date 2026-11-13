/**
 * The live behaviours the redesign must not break (beads-lite-1bo5.6.59.1).
 * One row = one behaviour + the test files that prove it. `match` narrows to
 * test names inside those files (regex on the full test name). docs/live-
 * behaviour.md lists the same ids; test/live-doc.test.js keeps them equal.
 * `pending` = the row cannot pass on board-v2 yet (named reason).
 */
export const ROWS = [
  {
    id: 'LB01',
    what: 'Card state: waiting / asked / answered / none, with sha; a card with a secret is hidden',
    files: ['server/features/cards.test.js'],
    match: /card-state/
  },
  {
    id: 'LB02',
    what: 'Card answer (option or text): one CLI record, one wake, refusals leave no wake',
    files: ['server/features/cards.test.js'],
    match: /card-answer \/ card-ask/
  },
  {
    id: 'LB03',
    what: 'Card ask before answering: thread, round, wake kind asked',
    files: [
      'server/features/cards.test.js',
      'server/features/cards.inline.real.test.js'
    ],
    match: /ask|asked|thread|question/i
  },
  {
    id: 'LB04',
    what: 'Wake state: queued / listening / delivered / none',
    files: ['server/features/cards.test.js'],
    match: /wakeState|pending with|claimed or done|no event/
  },
  {
    id: 'LB05',
    what: 'Card CLI end to end (real card core, test home)',
    files: [
      'server/features/cards.real.test.js',
      'server/features/cards.inline.real.test.js'
    ],
    match: /./
  },
  {
    id: 'LB06',
    what: 'Decisions feed: valid cards only, priority order, cached, pushed on change',
    files: ['server/features/decisions-feed.test.js'],
    match: /./
  },
  {
    id: 'LB07',
    what: 'Every feature socket type the UI sends is registered with the right mutating flag',
    files: ['test/live-wire.test.js'],
    match: /LB07/
  },
  {
    id: 'LB08',
    what: 'A socket without the board token, or from a foreign origin, never connects',
    files: ['test/live-wire.test.js', 'server/guard.test.js'],
    match: /LB08|upgrade|token|origin/i
  },
  {
    id: 'LB09',
    what: 'Card handlers answer on the real socket with bad_input, not a crash',
    files: ['test/live-wire.test.js'],
    match: /LB09/
  },
  {
    id: 'LB10',
    what: 'Outputs list: per-bead and per-project outputs, rollup cap, bad input refused',
    files: ['server/features/outputs.test.js'],
    match: /./
  },
  {
    id: 'LB11',
    what: 'Outputs open: local image and report attachment served with safe headers, uniform 404',
    files: ['server/features/local-img.test.js', 'test/report.test.js'],
    match: /./
  },
  {
    id: 'LB12',
    what: 'Releases list and reader: newest first, paging, filters, read-only git',
    files: ['server/features/releases.test.js'],
    match: /./
  },
  {
    id: 'LB13',
    what: 'Notifier: decision and release events fire once, mute, mark-read, restart digest',
    files: ['server/features/notifier.test.js'],
    match: /./
  },
  {
    id: 'LB14',
    what: 'Push subscribe / list / remove, send rules (one per project per 2 min)',
    files: ['server/features/push.test.js'],
    match: /./
  },
  {
    id: 'LB15',
    what: 'Service worker: shell list and push handling',
    files: [
      'server/sw.test.js',
      'server/sw.push.test.js',
      'app/push-client.test.js'
    ],
    match: /./
  },
  {
    id: 'LB16',
    what: 'Page: index with this launch token, hashed css and bundle, sw.js, manifest, healthz',
    files: ['test/live-http.test.js', 'server/features/perf.test.js'],
    match: /LB16|first paint/i
  },
  {
    id: 'LB17',
    what: 'Foreign Host or Origin gets 403 on the page and the API; phone door needs the owner identity',
    files: ['test/live-http.test.js', 'server/phone.test.js'],
    match: /LB17|identity|door/i
  },
  {
    id: 'LB18',
    what: 'Frame headers on every response (frame-ancestors / X-Frame-Options)',
    files: ['test/live-http.test.js'],
    match: /LB18/,
    pending: '.62 (not on board-v2 a1bf92c)'
  },
  {
    id: 'LB19',
    what: 'Deep links open the right thing: #/issues?issue=<id>&at=<target>, #/decisions, #/board, #/releases',
    files: [
      'app/router.test.js',
      'app/main.deep-link.test.js',
      'app/utils/anchor.test.js',
      'app/views/detail.anchor.test.js'
    ],
    match: /./
  }
];
