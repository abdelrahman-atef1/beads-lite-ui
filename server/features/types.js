/**
 * Message types owned by server/features/*.js. Each feature task appends its
 * own types here (one line per type); app/protocol.js and app/ws.js accept
 * them, so nobody edits those shared files again. Pure data: bundled client-side.
 *
 * @type {string[]}
 */
export const FEATURE_MESSAGE_TYPES = [
  // notifier (company-1bo5.6.14)
  'notify-list',
  'notify-mark-read',
  'notify-set',
  'notify-mute',
  'notify-event',
  // web push (company-1bo5.6.16)
  'push-key',
  'push-subscribe',
  'push-unsubscribe',
  'push-list',
  'push-remove',
  // decisions feed (company-1bo5.6.26)
  'list-decisions-all',
  'decisions-all',
  // decision card: answer, ask, thread, wake state (company-1bo5.6.9)
  'card-state',
  'card-answer',
  'card-ask',
  // outputs panel (beads-lite-1bo5.6.18)
  'outputs-get',
  'outputs-project'
];
