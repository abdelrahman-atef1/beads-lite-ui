/**
 * Board model: which column an issue belongs to, how its title is shown, and
 * whether a decision may be answered here. Pure functions, no DOM, so the
 * rules in design/README.md can be tested directly.
 */

/**
 * Column definitions in reading order. The owner's column is first.
 * `glyph` + colour + label together say the status (never colour alone).
 *
 * @type {ReadonlyArray<{ id: string, status: string, glyph: string, color: string, en: string, ar: string }>}
 */
export const COLUMNS = [
  {
    id: 'owner',
    status: 'owner_decision',
    glyph: '!',
    color: 's-owner',
    en: 'Owner decision',
    ar: 'بانتظار قرارك'
  },
  {
    id: 'progress',
    status: 'in_progress',
    glyph: '▶',
    color: 's-progress',
    en: 'In progress',
    ar: 'قيد التنفيذ'
  },
  {
    id: 'test',
    status: 'waiting_for_test',
    glyph: '✓',
    color: 's-test',
    en: 'Waiting for test',
    ar: 'بانتظار الاختبار'
  },
  {
    id: 'merge',
    status: 'waiting_for_merge',
    glyph: '⇄',
    color: 's-merge',
    en: 'Waiting for merge',
    ar: 'بانتظار الدمج'
  },
  {
    id: 'ready',
    status: 'open',
    glyph: '○',
    color: 's-ready',
    en: 'Ready',
    ar: 'جاهز'
  },
  {
    id: 'blocked',
    status: 'blocked',
    glyph: '■',
    color: 's-blocked',
    en: 'Blocked',
    ar: 'معطّل'
  }
];

export const OTHER_COLUMN = {
  id: 'other',
  status: '',
  glyph: '•',
  color: 's-closed',
  en: 'Other',
  ar: 'أخرى'
};

export const CLOSED_COLUMN = {
  id: 'closed',
  status: 'closed',
  glyph: '✔',
  color: 's-closed',
  en: 'Closed',
  ar: 'مغلقة'
};

/**
 * Labels that make a decision "never by phone / desk": answered in the chat at
 * the PC only (knowledge/decision-card.md, R18). The web board shows no buttons.
 */
export const DESK_LABELS = [
  'owner-pc-only',
  'security',
  'spend',
  'secret',
  'publish',
  'deploy',
  'film-gate',
  'film-approval',
  'hearing',
  'rights-clear',
  'publishable'
];

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number,
 *   assignee?: string, labels?: string[], metadata?: Record<string, unknown>,
 *   created_at?: number, updated_at?: number, closed_at?: number|null,
 *   title_ar?: string }} BoardIssue
 */

/**
 * Split issues into the board columns.
 *
 * - `all` is every non-closed issue (any status string, custom ones too).
 * - `ready_ids` is `bd ready` membership; `blocked_ids` is `bd blocked`
 *   (dependency-blocked, whose own status is `open`).
 * - Statuses outside the seven land in "Other" (appended at the end).
 *
 * @param {BoardIssue[]} all
 * @param {Set<string>} ready_ids
 * @param {Set<string>} blocked_ids
 * @returns {{ columns: Record<string, BoardIssue[]>, other: BoardIssue[] }}
 */
export function splitColumns(all, ready_ids, blocked_ids) {
  /** @type {Record<string, BoardIssue[]>} */
  const columns = {};
  for (const c of COLUMNS) {
    columns[c.id] = [];
  }
  /** @type {BoardIssue[]} */
  const other = [];
  for (const it of all) {
    const st = String(it.status || 'open');
    if (st === 'closed') {
      continue;
    }
    if (st === 'open') {
      if (blocked_ids.has(it.id)) {
        columns.blocked.push(it);
      } else if (ready_ids.has(it.id)) {
        columns.ready.push(it);
      } else {
        other.push(it);
      }
      continue;
    }
    const col = COLUMNS.find((c) => c.status === st);
    if (col) {
      columns[col.id].push(it);
    } else {
      other.push(it);
    }
  }
  return { columns, other };
}

/**
 * Metadata value as a trimmed string, or ''.
 *
 * @param {BoardIssue} it
 * @param {string} key
 * @returns {string}
 */
export function meta(it, key) {
  const m = it.metadata;
  if (m && typeof m === 'object') {
    const v = /** @type {Record<string, unknown>} */ (m)[key];
    if (typeof v === 'string') {
      return v.trim();
    }
  }
  return '';
}

/**
 * Whether the card is a desk (PC-only) decision.
 *
 * @param {BoardIssue} it
 * @returns {boolean}
 */
export function isDesk(it) {
  if (meta(it, 'card_class') === 'desk') {
    return true;
  }
  const labels = Array.isArray(it.labels) ? it.labels : [];
  return labels.some((l) => DESK_LABELS.includes(l));
}

/**
 * Title shown on a card: Arabic first when `title_ar` exists (never on a desk
 * card, which uses the neutral `card_title`), English as a secondary line.
 *
 * @param {BoardIssue} it
 * @returns {{ primary: string, secondary: string }}
 */
export function displayTitle(it) {
  const en = String(it.title || '').trim() || '(no title)';
  if (isDesk(it)) {
    const neutral = meta(it, 'card_title');
    return { primary: neutral || en, secondary: '' };
  }
  const ar = String(it.title_ar || '').trim() || meta(it, 'title_ar');
  if (ar && ar !== en) {
    return { primary: ar, secondary: en };
  }
  return { primary: en, secondary: '' };
}

/**
 * Parse `card_opts` (JSON list of `{l, n?, rec?}`), tolerant of bad data.
 *
 * @param {BoardIssue} it
 * @returns {Array<{ l: string, n: string, rec: boolean }>}
 */
export function cardOptions(it) {
  const raw = meta(it, 'card_opts');
  if (!raw) {
    return [];
  }
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr
      .filter((o) => o && typeof o.l === 'string' && o.l.trim())
      .slice(0, 4)
      .map((o) => ({
        l: String(o.l).trim().slice(0, 40),
        n: typeof o.n === 'string' ? o.n.trim().slice(0, 100) : '',
        rec: o.rec === true
      }));
  } catch {
    return [];
  }
}

/**
 * Short age label from an epoch-ms timestamp: 20m, 3h, 2d.
 *
 * @param {number|undefined} ts
 * @param {number} [now]
 * @returns {string}
 */
export function ageLabel(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || !ts) {
    return '';
  }
  const mins = Math.max(
    0,
    Math.floor((now - /** @type {number} */ (ts)) / 60000)
  );
  if (mins < 60) {
    return `${mins}m`;
  }
  if (mins < 60 * 48) {
    return `${Math.floor(mins / 60)}h`;
  }
  return `${Math.floor(mins / 1440)}d`;
}
