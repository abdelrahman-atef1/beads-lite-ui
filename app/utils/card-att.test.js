import { render } from 'lit-html';
import { describe, expect, test } from 'vitest';
import { attStrip, cleanAtt } from './card-att.js';

const OK = 'company/2026-11/0123456789abcdef.png';
const words = { label: 'Images', open: 'Open', link: 'Link' };

describe('cleanAtt', () => {
  test('keeps valid /att/ items, drops anything else, caps at 6', () => {
    const list = [
      { a: OK, n: 'one' },
      { a: 'https://evil.example/x.png' },
      { a: '../../etc/passwd' },
      { a: 'company/2026-11/0123456789abcdef.gif' },
      { a: 'data:image/png;base64,AAAA' },
      { n: 'no image' },
      ...Array.from({ length: 8 }, () => ({ a: OK }))
    ];
    const out = cleanAtt(list);
    expect(out).toHaveLength(6);
    expect(out[0]).toEqual({ src: '/att/' + OK, n: 'one', h: '' });
    expect(cleanAtt(JSON.stringify(list))).toHaveLength(6);
  });

  test('bad input gives an empty list; caption one line, 40 chars', () => {
    expect(cleanAtt('not json')).toEqual([]);
    expect(cleanAtt(undefined)).toEqual([]);
    expect(cleanAtt({})).toEqual([]);
    const n = cleanAtt([{ a: OK, n: 'a\nb' + 'x'.repeat(80) }])[0].n;
    expect(n).not.toMatch(/\n/);
    expect(n).toHaveLength(40);
  });

  test('link h: https on a tailnet or artifact host only', () => {
    const h = (/** @type {string} */ u) => cleanAtt([{ a: OK, h: u }])[0].h;
    expect(h('https://pc.tail8a4e50.ts.net/x')).toBe(
      'https://pc.tail8a4e50.ts.net/x'
    );
    expect(h('http://pc.tail8a4e50.ts.net/x')).toBe('');
    expect(h('https://evil.example/x')).toBe('');
    expect(h('javascript:alert(1)')).toBe('');
    expect(h('https://u:p@pc.ts.net/')).toBe('');
  });
});

describe('attStrip', () => {
  test('renders thumbnails that open full size; nothing for none', () => {
    const el = document.createElement('div');
    render(attStrip([], words), el);
    expect(el.querySelector('.att-strip')).toBeNull();
    render(attStrip(cleanAtt([{ a: OK, n: 'cap' }]), words), el);
    const a = /** @type {HTMLAnchorElement} */ (
      el.querySelector('a.att-strip__thumb')
    );
    expect(a.getAttribute('href')).toBe('/att/' + OK);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/att/' + OK);
    expect(el.querySelector('.att-strip__cap')?.textContent).toBe('cap');
  });

  test('phone width: tap opens an in-page lightbox, tap closes it', () => {
    /** @type {any} */ (window).matchMedia = () => ({ matches: true });
    const el = document.createElement('div');
    document.body.append(el);
    render(attStrip(cleanAtt([{ a: OK }]), words), el);
    /** @type {HTMLElement} */ (el.querySelector('a.att-strip__thumb')).click();
    const box = /** @type {HTMLElement} */ (
      document.querySelector('.att-lightbox')
    );
    expect(box.querySelector('img')?.getAttribute('src')).toBe('/att/' + OK);
    box.click();
    expect(document.querySelector('.att-lightbox')).toBeNull();
    delete (/** @type {any} */ (window).matchMedia);
  });
});

describe('clips on a card (beads-lite-1bo5.13.21)', () => {
  const MP3 = 'company/2026-11/0123456789abcdef.mp3';
  const MP4 = 'company/2026-11/fedcba9876543210.mp4';
  test('cleanAtt keeps clips with kind and a valid start second; images unchanged', () => {
    const got = cleanAtt([
      { a: OK, n: 'img', t: 5 },
      { a: MP3, n: 'ear', t: 16 },
      { a: MP4, n: 'eye', t: -3 },
      { a: 'company/2026-11/0123456789abcdef.exe' }
    ]);
    expect(got).toEqual([
      { src: '/att/' + OK, n: 'img', h: '' },
      { src: '/att/' + MP3, n: 'ear', h: '', kind: 'audio', t: 16 },
      { src: '/att/' + MP4, n: 'eye', h: '', kind: 'video' }
    ]);
  });
  test('attStrip draws native audio/video controls starting at t', () => {
    const d = document.createElement('div');
    render(
      attStrip(
        cleanAtt([
          { a: MP3, n: 'a', t: 16 },
          { a: MP4, n: 'v' }
        ]),
        words
      ),
      d
    );
    const au = d.querySelector('audio');
    const vi = d.querySelector('video');
    expect(au.hasAttribute('controls')).toBe(true);
    expect(au.getAttribute('src')).toBe('/att/' + MP3 + '#t=16');
    expect(vi.hasAttribute('controls')).toBe(true);
    expect(vi.getAttribute('src')).toBe('/att/' + MP4);
    expect(d.querySelector('img')).toBeNull();
  });
});
