import { html } from 'lit-html';

/** @type {Array<(ctx: any) => any>} */
const extensions = [];

/**
 * SEAM (task 13 owns mention): extra controls inside the comment composer.
 *
 * @param {(ctx: any) => any} fn
 */
export function registerComposerExtension(fn) {
  extensions.push(fn);
}

/** @param {any} ctx */
export function renderComposerExtras(ctx) {
  return html`${extensions.map((fn) => fn(ctx))}`;
}
