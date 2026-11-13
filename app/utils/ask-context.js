/**
 * Which project the open task belongs to, for the ask-Claude box. main.js sets
 * it from the active workspace; the lazily loaded view reads it. Own module so
 * the view does not import main.js.
 */

let project = '';

/**
 * @param {string} workspace_path - workspace path -> the project key the server uses
 */
export function setAskProject(workspace_path) {
  const parts = String(workspace_path || '')
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/);
  project = (parts.pop() || '').toLowerCase();
}

/** @returns {string} */
export function getAskProject() {
  return project;
}
