/**
 * Release records (`OUTPUT v1 <kind>\n{json}`, written by
 * ~/company/scripts/outputs/output.mjs) shown as a short line instead of raw
 * text. Display only: the server re-validates records for the Releases screen;
 * here every value is a text node and links pass safeHref at the call site.
 */
const KINDS = new Set([
  'deploy',
  'artifact',
  'build',
  'doc',
  'pr',
  'link',
  'file'
]);
const HEAD_RE = /^OUTPUT v1 ([a-z]{2,16})\n/;

/**
 * @param {string} text
 * @returns {{ kind: string, ref: string, label: string, commit: string } | null}
 */
export function parseOutputRecord(text) {
  const m = HEAD_RE.exec(String(text));
  if (!m || String(text).length > 2000) return null;
  /** @type {any} */
  let o;
  try {
    o = JSON.parse(String(text).slice(m[0].length));
  } catch {
    return null;
  }
  if (!o || typeof o.label !== 'string' || !o.label || o.label.length > 200) {
    return null;
  }
  return {
    kind: KINDS.has(m[1]) ? m[1] : 'link',
    ref: typeof o.ref === 'string' ? o.ref.slice(0, 600) : '',
    label: o.label,
    commit:
      typeof o.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(o.commit)
        ? o.commit
        : ''
  };
}
