/**
 * Role id -> Arabic name, English title and icon, for the bead header chips.
 * A COPY of the Roles table in ~/company/knowledge/glossary.md (not read at
 * runtime). app/data/roles.test.js fails when a glossary role or Arabic name
 * is missing or differs. Emoji icons: 0 bytes of assets, work offline.
 */
export const ROLES = {
  cos: { ar: 'مارد وشوشني', en: 'CoS', icon: '🧭' },
  cto: { ar: 'شلبي', en: 'CTO', icon: '🏛️' },
  pm: { ar: 'سالي', en: 'PM', icon: '📋' },
  qa: { ar: 'عفني', en: 'QA', icon: '🧪' },
  sec: { ar: 'أستاذ أبو عنكبوت', en: 'SEC', icon: '🛡️' },
  sre: { ar: 'روز', en: 'SRE', icon: '⚙️' },
  sup: { ar: 'منفي', en: 'SUP', icon: '🎧' },
  swe: { ar: 'أندل', en: 'SWE', icon: '🛠️' },
  ux: { ar: 'بو', en: 'UX', icon: '🎨' },
  legal: { ar: 'المستشار القانوني', en: 'Legal', icon: '⚖️' },
  growth: { ar: 'شكري', en: 'Growth', icon: '📈' },
  partnerships: { ar: 'فتح الباب', en: 'Partnerships', icon: '🤝' },
  community: { ar: 'قسمتي', en: 'Community', icon: '💬' },
  analytics: { ar: 'مزلقان', en: 'Analytics', icon: '📊' }
};

const OWNERS = new Set(['abdelrahman', 'owner', 'abduu']);

/**
 * Display info for an actor string. Never throws; unknown actors show raw.
 *
 * @param {string} actor
 * @returns {{ id: string, name: string, icon: string, known: boolean }}
 */
export function actorInfo(actor) {
  const id = String(actor || '').trim();
  const key = id.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ROLES, key)) {
    const r = /** @type {Record<string, {ar:string,en:string,icon:string}>} */ (
      ROLES
    )[key];
    return { id: key, name: `${r.ar} (${r.en})`, icon: r.icon, known: true };
  }
  if (OWNERS.has(key)) {
    return { id: key, name: 'المالك', icon: '👤', known: true };
  }
  return { id, name: id, icon: '🔹', known: false };
}
