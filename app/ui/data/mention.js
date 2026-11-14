/**
 * @mention data adapter (beads-lite-1bo5.6.59.13, UI side of .64).
 *
 * Server contract (server/features/mention.js, .64.1):
 *   mention-roles {}        -> { roles: string[], owner: true }
 *   mention-scan  {id}      -> { results: [{ comment, role, chip, verdict }] }
 *   mention-chips {id}      -> { chips:   [{ comment, role, chip, verdict }] }
 * chip: waiting | woke | seen | limit | paused.
 *
 * FIXTURE mode (no transport): nothing is sent anywhere; the adapter parses the
 * text itself (same rules: no mention in code fences, inline code or quotes,
 * unknown names are plain text, 3 roles per comment) and answers with the chip
 * a fixture state asks for, so every chip renders without a server.
 */

/** Known roles with the one-line Arabic name shown in the picker. */
export const ROLE_INFO = [
  { role: 'pm', ar: 'مدير المنتج', en: 'Product manager' },
  { role: 'cos', ar: 'رئيس الأركان', en: 'Chief of staff' },
  { role: 'swe', ar: 'مهندس البرمجيات', en: 'Software engineer' },
  { role: 'qa', ar: 'مهندس الجودة', en: 'QA engineer' },
  { role: 'ux', ar: 'مصمم التجربة', en: 'UX designer' },
  { role: 'sre', ar: 'مهندس البنية', en: 'Site reliability' },
  { role: 'sec', ar: 'مهندس الأمان', en: 'Security engineer' },
  { role: 'cto', ar: 'المدير التقني', en: 'CTO' },
  { role: 'legal', ar: 'المستشار القانوني', en: 'Legal' },
  { role: 'analytics', ar: 'محلل البيانات', en: 'Analytics' },
  { role: 'sup', ar: 'الدعم', en: 'Support' },
  { role: 'brand', ar: 'العلامة', en: 'Brand' },
  { role: 'content', ar: 'المحتوى', en: 'Content' },
  { role: 'viewer', ar: 'المشاهد', en: 'Viewer' },
  { role: 'director', ar: 'المخرج', en: 'Director' },
  { role: 'editor', ar: 'المونتير', en: 'Editor' },
  { role: 'designer', ar: 'المصمم', en: 'Designer' },
  { role: 'growth', ar: 'النمو', en: 'Growth' },
  { role: 'community', ar: 'المجتمع', en: 'Community' },
  { role: 'partnerships', ar: 'الشراكات', en: 'Partnerships' }
];
export const OWNER_INFO = { role: 'owner', ar: 'المالك', en: 'Owner' };
export const CHIPS = ['waiting', 'woke', 'seen', 'limit', 'paused'];
export const MAX_ROLES = 3;

/**
 * Text without fenced code, inline code and quote lines.
 *
 * @param {string} text
 */
export function stripQuoted(text) {
  const out = [];
  let fence = '';
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = '';
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    if (/^\s{0,3}>/.test(line)) continue;
    out.push(line.replace(/`+[^`]*`+/g, ' '));
  }
  return out.join('\n');
}

/**
 * Known roles named in a comment, in order, unique; owner flagged.
 *
 * @param {string} text
 * @returns {{ roles: string[], owner: boolean }}
 */
export function parseMentions(text) {
  const names = ROLE_INFO.map((r) => r.role);
  /** @type {string[]} */
  const roles = [];
  let owner = false;
  const re = /(^|[^\w@./:\\-])@([a-zA-Z]{2,12})(?![\w@-])(?!\.\w)/g;
  const clean = stripQuoted(text);
  let m;
  while ((m = re.exec(clean))) {
    const n = m[2].toLowerCase();
    if (n === 'owner') owner = true;
    else if (names.includes(n) && !roles.includes(n)) roles.push(n);
  }
  return { roles, owner };
}

/**
 * Is the caret inside code or a quote (then "@" opens no picker).
 *
 * @param {string} before text up to the caret
 */
export function inQuoted(before) {
  const lines = before.split(/\r?\n/);
  let fence = false;
  for (const l of lines.slice(0, -1)) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(l)) fence = !fence;
  }
  const cur = lines[lines.length - 1];
  if (fence || /^\s{0,3}(`{3,}|~{3,})/.test(cur)) return true;
  if (/^\s{0,3}>/.test(cur)) return true;
  return ((cur.match(/`/g) || []).length & 1) === 1;
}

/**
 * The "@xyz" token the caret is at the end of, or null.
 *
 * @param {string} text
 * @param {number} caret
 * @returns {{ start: number, query: string } | null}
 */
export function tokenAt(text, caret) {
  const before = text.slice(0, caret);
  const m = /(^|[\s(،,])@([a-zA-Z]{0,12})$/.exec(before);
  if (!m) return null;
  if (inQuoted(before)) return null;
  return { start: caret - m[2].length - 1, query: m[2].toLowerCase() };
}

/**
 * Picker rows for a query: roles whose name starts with it, then @owner.
 *
 * @param {string} query
 */
export function pickerItems(query) {
  const q = String(query || '').toLowerCase();
  const rows = [...ROLE_INFO, OWNER_INFO];
  const starts = rows.filter((r) => r.role.startsWith(q));
  return starts;
}

/**
 * @param {{ send?: (type: string, payload: any) => Promise<any>, fixtureChip?: string }} [o]
 *   send = the board's websocket send; no send = fixture mode
 */
export function createMentionApi(o = {}) {
  const { send } = o;
  /** @type {Map<string, any[]>} */
  const cache = new Map();
  return {
    fixture: !send,
    /** Picker list. */
    async roles() {
      if (send) {
        try {
          const r = await send('mention-roles', {});
          if (r && Array.isArray(r.roles)) {
            const known = new Set(r.roles);
            return [...ROLE_INFO.filter((x) => known.has(x.role)), OWNER_INFO];
          }
        } catch {
          // old server: the built-in list
        }
      }
      return [...ROLE_INFO, OWNER_INFO];
    },
    /**
     * After a comment was saved. Fixture mode needs the text.
     *
     * @param {string} id
     * @param {string} [text]
     */
    async scan(id, text = '') {
      if (!send) {
        const f = parseMentions(text);
        const chip = o.fixtureChip || 'waiting';
        const results = [
          ...(f.owner
            ? [{ comment: '', role: 'owner', chip: 'seen', verdict: 'bell' }]
            : []),
          ...f.roles.map((role, i) => ({
            comment: '',
            role,
            chip: i >= MAX_ROLES ? 'limit' : chip,
            verdict: i >= MAX_ROLES ? 'too-many-roles' : 'queued'
          }))
        ];
        cache.set(id, [...(cache.get(id) || []), ...results]);
        return results;
      }
      try {
        const r = await send('mention-scan', { id });
        const results = r && Array.isArray(r.results) ? r.results : [];
        if (results.length) {
          cache.set(id, [...(cache.get(id) || []), ...results]);
        }
        return results;
      } catch {
        return [];
      }
    },
    /** @param {string} id */
    async chips(id) {
      if (!send) return cache.get(id) || [];
      try {
        const r = await send('mention-chips', { id });
        const list = r && Array.isArray(r.chips) ? r.chips : [];
        cache.set(id, list);
        return list;
      } catch {
        return cache.get(id) || [];
      }
    },
    /** @param {string} id */
    cached: (id) => cache.get(id) || []
  };
}
