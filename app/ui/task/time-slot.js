import { html } from 'lit-html';
import '../views/time-section.js';

/**
 * SEAM (task 12 owns the body): the Time section of the task page. One
 * <u3-time-slot> element; it fetches the rollup row of the task once and draws
 * time beside the quality counters. Missing rollup = an empty-state line.
 *
 * @param {any} issue
 * @param {any} ctx
 */
export function renderTimeSlot(issue, ctx) {
  return html`<u3-time-slot .ctx=${ctx} .issue=${issue}></u3-time-slot>`;
}
