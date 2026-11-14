import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { flowRollup } from './flow.js';

const NOW = Date.now();
const doc = {
  built_at: '2026-11-14T10:00:00.000Z',
  heavy_recorded: false,
  beads: {
    a: {
      id: 'a',
      running: true,
      closed: null,
      role: 'swe',
      labels: ['x', 'exp:fast'],
      wake: { wakes: 1 }
    },
    b: {
      id: 'b',
      running: false,
      closed: NOW - 2 * 86_400_000,
      role: 'qa',
      labels: []
    },
    c: {
      id: 'c',
      running: false,
      closed: NOW - 90 * 86_400_000,
      role: 'qa',
      labels: []
    },
    d: {
      id: 'd',
      running: false,
      closed: NOW - 86_400_000,
      role: 'sre',
      labels: ['security']
    }
  }
};
let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
  process.env.FLOW_HOME = dir;
});
afterEach(() => {
  delete process.env.FLOW_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('flow-rollup', () => {
  test('missing file is an empty state, not an error', () => {
    expect(flowRollup({})).toEqual({
      present: false,
      built_at: null,
      heavy_recorded: false,
      rows: []
    });
  });
  test('broken file is an empty state', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), '{nope');
    expect(flowRollup({}).present).toBe(false);
  });
  test('default window: running plus closed within 30 days; labels cut to exp:, no wake', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), JSON.stringify(doc));
    const r = flowRollup({});
    expect(r.rows.map((x) => x.id).sort()).toEqual(['a', 'b', 'd']);
    const a = r.rows.find((x) => x.id === 'a');
    expect(a.labels).toEqual(['exp:fast']);
    expect(a.wake).toBeUndefined();
  });
  test('ids picks those beads; bad ids refused', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), JSON.stringify(doc));
    expect(flowRollup({ ids: ['c'] }).rows.map((x) => x.id)).toEqual(['c']);
    expect(() => flowRollup({ ids: ['../x'] })).toThrow();
    expect(() => flowRollup({ ids: 'a' })).toThrow();
  });
  test('phone door leaves desk beads out', () => {
    fs.writeFileSync(path.join(dir, 'rollup.json'), JSON.stringify(doc));
    const r = flowRollup({}, { ws: { door: 'phone' } });
    expect(r.rows.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});
