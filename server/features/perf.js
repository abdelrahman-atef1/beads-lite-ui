/**
 * Slow-link first paint (beads-lite-1bo5.6.31). Everything here is built once,
 * kept in memory and revalidated by file mtime on the request that needs it:
 * no timers, no watcher, nothing runs when nobody is using the board.
 *
 * - Browser bundle: esbuild once (minified, no inline map), gzip + brotli
 *   precompressed, ETag, and a content-hashed URL (/main.<hash>.js, immutable).
 *   `/main.bundle.js` keeps working (service worker shell, older pages).
 *   A prebuilt app/main.bundle.js (npm pack) is used as is, never rebuilt.
 *   Screens behind import() are split into /chunks/<hash>.js (esbuild
 *   splitting, beads-lite-1bo5.6.59.19): the page loads the shell and the
 *   desk, a screen's chunk loads when it first opens. Chunk names are content
 *   hashes, so they are immutable; old ones stay in memory so an open page
 *   racing a rebuild still finds its chunk.
 * - One stylesheet: the css files index.html links are joined, in order, into
 *   /app.<hash>.css (one request instead of twelve; on HTTP/1.1 the extra
 *   requests queue the bundle behind them).
 * - Static css/js/svg/manifest: gzip/brotli once per file version + ETag.
 *   index.html points css at ?v=<content hash> so repeat visits skip the
 *   network (immutable); a bare URL still revalidates with a 304.
 * - Websocket frames: permessage-deflate options for server/ws.js.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);
const COMPRESSIBLE = /\.(css|js|mjs|svg|webmanifest|json|html)$/;
const CSS_LINK =
  /[ \t]*<link rel="stylesheet" href="\.\/((?:css\/)?[\w-]+\.css)" \/>\r?\n?/g;
const CHUNK_NAME = /^[\w-]+\.js$/;
// A static import of a split chunk in esbuild's minified output (from"./chunks/X.js",
// import"./X.js"); a dynamic import("...") has a parenthesis and does not match.
const STATIC_CHUNK = /(?:from|import)\s*"\.\/(?:chunks\/)?([\w-]+\.js)"/g;
const YEAR = 'public, max-age=31536000, immutable';

/**
 * ws `perMessageDeflate` options: small frames stay raw, the server keeps
 * its deflate window per socket (the five column snapshots share their field
 * names: 16 KB to 12.6 KB on the fixture), nothing is kept for the client
 * direction, at most 4 deflates at once.
 */
export const WS_DEFLATE = {
  threshold: 1024,
  zlibDeflateOptions: { level: 6 },
  serverNoContextTakeover: false,
  clientNoContextTakeover: true,
  concurrencyLimit: 4
};

/**
 * esbuild plugin (beads-lite-1bo5.6.59.19): the old board's view registry
 * (app/views/registry.js) stays in the main file, as it did before splitting.
 * Left alone, each of its ten import() calls becomes a chunk that shares code
 * with the entry, and the entry then imports about twenty more chunk files
 * statically: a phone on a slow link pays a round trip for each. Only the v3
 * screens opened from app/ui/boot.js are split. Remove with the legacy views.
 *
 * @type {import('esbuild').Plugin}
 */
export const inlineLegacyViews = {
  name: 'inline-legacy-views',
  setup(build) {
    build.onLoad({ filter: /[\\/]app[\\/]views[\\/]registry\.js$/ }, (args) => {
      let head = '';
      let n = 0;
      const body = fs
        .readFileSync(args.path, 'utf8')
        .replace(/import\('(\.[^']+)'\)/g, (_all, spec) => {
          n++;
          head += `import * as __view${n} from '${spec}';\n`;
          return `Promise.resolve(__view${n})`;
        });
      return {
        contents: head + body,
        loader: 'js',
        resolveDir: path.dirname(args.path)
      };
    });
  }
};

/**
 * @typedef {Object} Packed
 * @property {Buffer} raw
 * @property {Buffer} gz
 * @property {Buffer} br
 * @property {string} etag
 * @property {string} hash
 */

/** @param {Buffer} raw - @returns {Promise<Packed>} */
async function pack(raw) {
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  const [gz, br] = await Promise.all([
    gzip(raw, { level: 9 }),
    brotli(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length
      }
    })
  ]);
  return { raw, gz, br, etag: `"${hash}"`, hash };
}

/**
 * Pick the best encoding the client accepts.
 *
 * @param {import('express').Request} req
 * @param {Packed} p
 * @returns {{ body: Buffer, encoding: string | null }}
 */
export function negotiate(req, p) {
  const ae = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) return { body: p.br, encoding: 'br' };
  if (/\bgzip\b/.test(ae)) return { body: p.gz, encoding: 'gzip' };
  return { body: p.raw, encoding: null };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Packed} p
 * @param {string} type
 * @param {string} cache
 */
function sendPacked(req, res, p, type, cache) {
  res.setHeader('ETag', p.etag);
  res.setHeader('Cache-Control', cache);
  res.setHeader('Vary', 'Accept-Encoding');
  res.type(type);
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  const { body, encoding } = negotiate(req, p);
  if (encoding) res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', String(body.length));
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * @param {{ app_dir: string }} config
 */
export function createPerf(config) {
  const app_dir = config.app_dir;
  const built_file = path.join(app_dir, 'main.bundle.js');
  const chunks_dir = path.join(app_dir, 'chunks');

  /** @type {{ packed: Packed, inputs: Array<[string, number]> } | null} */
  let bundle = null;
  /** @type {Promise<Packed> | null} */
  let building = null;
  /** @type {Map<string, { mtime: number, size: number, packed: Packed }>} */
  const files = new Map();
  /** @type {Map<string, Packed>} chunk file name -> packed (never evicted: bounded by rebuilds) */
  const chunks = new Map();

  /** @param {string} name - @param {Buffer} raw */
  async function addChunk(name, raw) {
    if (!chunks.has(name)) chunks.set(name, await pack(raw));
  }

  /**
   * Names of every split chunk the entry loads statically (its imports, and theirs).
   *
   * @param {Packed} entry
   * @returns {string[]}
   */
  function staticChunkNames(entry) {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @param {Buffer} raw */
    const visit = (raw) => {
      for (const m of raw.toString('utf8').matchAll(STATIC_CHUNK)) {
        const n = m[1];
        if (seen.has(n)) continue;
        seen.add(n);
        const c = chunks.get(n);
        if (c) visit(c.raw);
      }
    };
    visit(entry.raw);
    return [...seen];
  }

  /** @param {Array<[string, number]>} inputs */
  function inputsFresh(inputs) {
    for (const [f, m] of inputs) {
      const st = fs.statSync(f, { throwIfNoEntry: false });
      if (!st || st.mtimeMs !== m) return false;
    }
    return true;
  }

  const stats = { builds: 0 };

  async function buildBundle() {
    stats.builds++;
    const st = fs.statSync(built_file, { throwIfNoEntry: false });
    if (st) {
      const packed = await pack(fs.readFileSync(built_file));
      if (fs.existsSync(chunks_dir)) {
        for (const f of fs.readdirSync(chunks_dir)) {
          if (CHUNK_NAME.test(f))
            await addChunk(f, fs.readFileSync(path.join(chunks_dir, f)));
        }
      }
      bundle = { packed, inputs: [[built_file, st.mtimeMs]] };
      return packed;
    }
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      entryPoints: [path.join(app_dir, 'main.js')],
      bundle: true,
      splitting: true,
      outdir: app_dir,
      entryNames: 'main.bundle',
      chunkNames: 'chunks/[hash]',
      plugins: [inlineLegacyViews],
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      sourcemap: false,
      minify: true,
      legalComments: 'none',
      metafile: true,
      write: false
    });
    const outs = result.outputFiles || [];
    const out = outs.find((o) => path.basename(o.path) === 'main.bundle.js');
    if (!out) throw new Error('no output');
    for (const o of outs) {
      if (o !== out && path.dirname(o.path) === chunks_dir)
        await addChunk(path.basename(o.path), Buffer.from(o.contents));
    }
    const inputs = /** @type {Array<[string, number]>} */ ([]);
    for (const rel of Object.keys(result.metafile.inputs)) {
      const abs = path.resolve(rel);
      const s = fs.statSync(abs, { throwIfNoEntry: false });
      if (s) inputs.push([abs, s.mtimeMs]);
    }
    const packed = await pack(Buffer.from(out.contents));
    bundle = { packed, inputs };
    return packed;
  }

  /** Current bundle; rebuilt once if a source file changed. */
  function getBundle() {
    if (bundle && inputsFresh(bundle.inputs))
      return Promise.resolve(bundle.packed);
    if (!building) {
      building = buildBundle().finally(() => {
        building = null;
      });
    }
    return building;
  }

  /**
   * Content-hash pack of a file under app_dir, recomputed only when its mtime
   * or size changes.
   *
   * @param {string} abs
   * @returns {Promise<Packed | null>}
   */
  async function getFile(abs) {
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (!st || !st.isFile()) return null;
    const hit = files.get(abs);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size)
      return hit.packed;
    const packed = await pack(fs.readFileSync(abs));
    files.set(abs, { mtime: st.mtimeMs, size: st.size, packed });
    return packed;
  }

  /** @type {import('express').RequestHandler} */
  async function bundleHandler(req, res, next) {
    try {
      const p = await getBundle();
      const named = /^\/main\.([0-9a-f]{12})\.js$/.exec(req.path);
      // Only the current hash is immutable; a stale name gets the current
      // bytes, revalidated (an old page racing a rebuild).
      const cache = named && named[1] === p.hash ? YEAR : 'no-cache';
      sendPacked(req, res, p, 'application/javascript; charset=utf-8', cache);
    } catch (err) {
      next(err);
    }
  }

  /** One split chunk: the name is its content hash, so it is immutable. */
  /** @type {import('express').RequestHandler} */
  async function chunkHandler(req, res, next) {
    try {
      await getBundle(); // makes sure the chunks of the current build exist
      const name = path.basename(req.path);
      const p = CHUNK_NAME.test(name) ? chunks.get(name) : undefined;
      if (!p) {
        next();
        return;
      }
      sendPacked(req, res, p, 'application/javascript; charset=utf-8', YEAR);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Compressed static files; goes before express.static.
   *
   * @type {import('express').RequestHandler}
   */
  async function staticHandler(req, res, next) {
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      !COMPRESSIBLE.test(req.path)
    ) {
      next();
      return;
    }
    if (
      req.path === '/index.html' ||
      req.path === '/sw.js' ||
      /\.test\.js$/.test(req.path)
    ) {
      next();
      return;
    }
    try {
      const abs = path.resolve(app_dir, '.' + decodeURIComponent(req.path));
      if (!abs.startsWith(path.resolve(app_dir) + path.sep)) {
        next();
        return;
      }
      const p = await getFile(abs);
      if (!p) {
        next();
        return;
      }
      const v = typeof req.query.v === 'string' ? req.query.v : '';
      const type = abs.endsWith('.webmanifest')
        ? 'application/manifest+json'
        : path.extname(abs);
      sendPacked(req, res, p, type, v === p.hash ? YEAR : 'no-cache');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Point the page at the hashed bundle and versioned css.
   *
   * @param {string} html
   * @returns {Promise<string>}
   */
  async function rewriteIndex(html) {
    let out = html;
    try {
      const p = await getBundle();
      out = out.replace('/main.bundle.js', `/main.${p.hash}.js`);
      // Preload what the entry imports statically, all at once: a phone fetches
      // them in one round instead of one level of imports at a time.
      const links = staticChunkNames(p)
        .map((n) => `<link rel="modulepreload" href="/chunks/${n}" />`)
        .join('\n    ');
      if (links) out = out.replace('</head>', `\n    ${links}\n  </head>`);
    } catch {
      /* keep the plain URL: /main.bundle.js will report the error */
    }
    const joined = await getCss(out);
    if (joined) {
      let first = true;
      out = out.replace(CSS_LINK, () => {
        if (!first) return '';
        first = false;
        return `<link rel="stylesheet" href="/app.${joined.hash}.css" />`;
      });
    }
    return out;
  }

  /** @type {{ sig: string, packed: Packed } | null} */
  let css = null;

  /**
   * The joined stylesheet for the links in `html` (default: index.html on disk).
   * Rebuilt only when one of the files changes.
   *
   * @param {string} [html]
   * @returns {Promise<Packed | null>}
   */
  async function getCss(html) {
    const src =
      html ?? fs.readFileSync(path.join(app_dir, 'index.html'), 'utf8');
    const names = [...src.matchAll(CSS_LINK)].map((m) => m[1]);
    if (names.length === 0) return null;
    let sig = '';
    for (const n of names) {
      const st = fs.statSync(path.join(app_dir, n), { throwIfNoEntry: false });
      if (!st) return null;
      sig += `${n}:${st.mtimeMs}:${st.size};`;
    }
    if (css && css.sig === sig) return css.packed;
    const parts = names.map((n) =>
      fs.readFileSync(path.join(app_dir, n), 'utf8')
    );
    const packed = await pack(
      Buffer.from(parts.join(String.fromCharCode(10)), 'utf8')
    );
    css = { sig, packed };
    return packed;
  }

  /** @type {import('express').RequestHandler} */
  async function cssHandler(req, res, next) {
    try {
      const p = await getCss();
      if (!p) {
        next();
        return;
      }
      const named = /^\/app\.([0-9a-f]{12})\.css$/.exec(req.path);
      sendPacked(
        req,
        res,
        p,
        'text/css; charset=utf-8',
        named && named[1] === p.hash ? YEAR : 'no-cache'
      );
    } catch (err) {
      next(err);
    }
  }

  /** Build the bundle now, off the request path (called once at start). */
  function warm() {
    void getBundle().catch(() => {});
  }

  return {
    stats,
    bundleHandler,
    chunkHandler,
    cssHandler,
    staticHandler,
    rewriteIndex,
    warm,
    getBundle
  };
}
