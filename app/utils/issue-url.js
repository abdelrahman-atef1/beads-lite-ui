/**
 * Build a canonical issue hash that retains the view.
 *
 * @param {'issues'|'epics'|'board'|'decisions'} view
 * @param {string} id
 */
export function issueHashFor(view, id) {
  const v =
    view === 'epics' || view === 'board' || view === 'decisions'
      ? view
      : 'issues';
  return `#/${v}?issue=${encodeURIComponent(id)}`;
}
