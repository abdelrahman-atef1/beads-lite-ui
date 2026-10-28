import { describe, expect, test } from 'vitest';
import {
  createHashRouter,
  isHomeHash,
  parseHash,
  parseView
} from './router.js';
import { createStore } from './state.js';

describe('router', () => {
  test('parseHash extracts id', () => {
    expect(parseHash('#/issues?issue=UI-5')).toBe('UI-5');
    expect(parseHash('#/issue/UI-5')).toBe('UI-5');
    expect(parseHash('#/anything')).toBeNull();
  });

  test('router updates store and gotoIssue updates hash', () => {
    document.body.innerHTML = '<div></div>';
    const store = createStore();
    const router = createHashRouter(store);
    router.start();

    window.location.hash = '#/issue/UI-10';
    // Trigger handler synchronously
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(store.getState().selected_id).toBe('UI-10');

    router.gotoIssue('UI-11');
    expect(window.location.hash).toBe('#/issues?issue=UI-11');
    router.stop();
  });

  test('home (empty hash) is the Decisions view', () => {
    expect(isHomeHash('')).toBe(true);
    expect(isHomeHash('#/')).toBe(true);
    expect(isHomeHash('#/board')).toBe(false);
    const store = createStore({ view: 'board' });
    window.location.hash = '';
    const router = createHashRouter(store);
    router.start();
    expect(store.getState().view).toBe('decisions');
    router.stop();
  });

  test('parseView resolves from hash and defaults to issues', () => {
    expect(parseView('#/issues')).toBe('issues');
    expect(parseView('#/epics')).toBe('epics');
    expect(parseView('#/board')).toBe('board');
    expect(parseView('')).toBe('issues');
    expect(parseView('#/unknown')).toBe('issues');
  });
});
