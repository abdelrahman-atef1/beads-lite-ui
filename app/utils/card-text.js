/** Wording shared by the card panel and the Decisions screen (company-1bo5.6.9). */
import { t } from './i18n.js';

/**
 * Wake line. state: delivered | queued | queued-no-listener | none.
 *
 * @param {{ state?: string } | null | undefined} w
 * @param {string} [just] result of the wake emit just now
 */
export function wakeLabel(w, just) {
  if (just === 'failed') return t('cd_wake_failed');
  switch (w?.state) {
    case 'delivered':
      return t('cd_wake_delivered');
    case 'queued':
      return t('cd_wake_queued');
    case 'queued-no-listener':
      return t('cd_wake_nolisten');
    default:
      return '';
  }
}

/** @param {string} code */
export function errorText(code) {
  switch (code) {
    case 'changed':
      return t('cd_err_changed');
    case 'already-handled':
    case 'not-open':
      return t('cd_err_already');
    case 'secret-refused':
      return t('cd_err_secret');
    case 'empty':
      return t('cd_err_empty');
    case 'too-long':
      return t('cd_err_long');
    case 'round-cap':
      return t('cd_err_cap');
    case 'record-pending':
    case 'move-pending':
      return t('cd_err_pending');
    default:
      return t('cd_err_generic');
  }
}
