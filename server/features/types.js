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
  'notify-event'
];
