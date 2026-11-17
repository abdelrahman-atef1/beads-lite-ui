/**
 * Decides when to tell the user the live connection dropped.
 * Silent until the socket was open at least once, and then only after it has
 * been down `delayMs`. A first connect that fails (stale token after a
 * restart) is retried by the ws client without any message.
 *
 * @param {(msg: string, kind: 'error'|'success', ms: number) => void} toast
 * @param {{ delayMs?: number }} [opts]
 * @returns {(s: 'connecting'|'open'|'closed'|'reconnecting') => void}
 */
export function createConnectionNotice(toast, opts = {}) {
  const delayMs = opts.delayMs ?? 4000;
  let was_open = false;
  let shown = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return (s) => {
    if (s === 'open') {
      clear();
      if (shown) toast('Reconnected', 'success', 2200);
      shown = false;
      was_open = true;
    } else if ((s === 'closed' || s === 'reconnecting') && was_open) {
      if (timer || shown) return;
      timer = setTimeout(() => {
        timer = null;
        shown = true;
        toast('Connection lost. Reconnecting…', 'error', 4000);
      }, delayMs);
    }
  };
}
