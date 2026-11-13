import { html } from 'lit-html';

/**
 * Chips never wrap (nowrap + ellipsis in css). tone: neutral|amber|teal|blue|red|green.
 *
 * @param {{ label: any, tone?: string, mono?: boolean, title?: string }} o
 */
export function chip(o) {
  return html`<span
    class="u3-chip u3-chip--${o.tone || 'neutral'}${o.mono ? ' u3-mono' : ''}"
    title=${o.title ?? ''}
    >${o.label}</span
  >`;
}
