/**
 * @import { Express, Request, Response } from 'express'
 */
import express from 'express';
import { mountFeatureRoutes } from './features/index.js';
import { prewarmCounts } from './workspace-counts.js';
import fs from 'node:fs';
import path from 'node:path';
import { getBoardToken, isAllowedHost, isAllowedOrigin } from './guard.js';
import {
  getAvailableWorkspaces,
  registerWorkspace
} from './registry-watcher.js';

/**
 * Create and configure the Express application.
 *
 * @param {{ host: string, port: number, app_dir: string, root_dir: string }} config - Server configuration.
 * @returns {Express} Configured Express app instance.
 */
export function createApp(config) {
  const app = express();

  // Basic hardening and config
  app.disable('x-powered-by');

  // D8: refuse unknown Host (DNS rebinding) and any request whose Origin is
  // not this board's own origin. Requests with no Origin (curl, the CLI) pass.
  app.use((req, res, next) => {
    const host = req.headers.host;
    const origin = req.headers.origin;
    if (
      !isAllowedHost(host) ||
      (origin !== undefined && !isAllowedOrigin(origin, host))
    ) {
      res.status(403).type('text/plain').send('Forbidden');
      return;
    }
    next();
  });

  // Health endpoint
  /**
   * @param {Request} _req
   * @param {Response} res
   */
  app.get('/healthz', (_req, res) => {
    res.type('application/json');
    res.status(200).send({ ok: true });
  });

  // Enable JSON body parsing for API endpoints
  app.use(express.json());

  // Register workspace endpoint - allows CLI to register workspaces dynamically
  // when the server is already running
  /**
   * @param {Request} req
   * @param {Response} res
   */
  app.post('/api/register-workspace', (req, res) => {
    const { path: workspace_path, database } = req.body || {};
    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid path' });
      return;
    }
    if (!database || typeof database !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid database' });
      return;
    }
    registerWorkspace({ path: workspace_path, database });
    prewarmCounts(workspace_path);
    res.status(200).json({ ok: true, registered: workspace_path });
  });

  // List all known workspaces (file-based registry + in-memory)
  app.get('/api/workspaces', (_req, res) => {
    const workspaces = getAvailableWorkspaces();
    res.status(200).json({ ok: true, workspaces });
  });

  mountFeatureRoutes(app, config);

  if (
    !fs.statSync(path.resolve(config.app_dir, 'main.bundle.js'), {
      throwIfNoEntry: false
    })
  ) {
    /**
     * On-demand bundle for the browser using esbuild.
     *
     * @param {Request} _req
     * @param {Response} res
     */
    app.get('/main.bundle.js', async (_req, res) => {
      try {
        const esbuild = await import('esbuild');
        const entry = path.join(config.app_dir, 'main.js');
        const result = await esbuild.build({
          entryPoints: [entry],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2020',
          sourcemap: 'inline',
          minify: false,
          write: false
        });
        const out = result.outputFiles && result.outputFiles[0];
        if (!out) {
          res.status(500).type('text/plain').send('Bundle failed: no output');
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(out.text);
      } catch (err) {
        res
          .status(500)
          .type('text/plain')
          .send('Bundle error: ' + (err && /** @type {any} */ (err).message));
      }
    });
  }

  // Page with the per-launch token injected (D8); before static so it wins.
  /**
   * @param {Request} _req
   * @param {Response} res
   */
  const sendIndex = (_req, res) => {
    const html = fs
      .readFileSync(path.join(config.app_dir, 'index.html'), 'utf8')
      .replace('__BOARD_TOKEN__', getBoardToken());
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(html);
  };
  app.get(['/', '/index.html'], sendIndex);

  // Static assets from /app
  app.use(express.static(config.app_dir));

  return app;
}
