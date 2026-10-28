import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve runtime configuration for the server.
 * Notes:
 * - `app_dir` is resolved relative to the installed package location.
 * - `root_dir` represents the directory where the process was invoked
 * (i.e., the current working directory) so DB resolution follows the
 * caller's context rather than the install location.
 *
 * The phone door (ADR 0001 section 2) listens on loopback only, on
 * PHONE_PORT (default 3001); PHONE_PORT=0 or "off" turns it off. There is no
 * phone host setting: it is always 127.0.0.1, `tailscale serve` is the only
 * way in.
 *
 * @returns {{ host: string, port: number, app_dir: string, root_dir: string, url: string, phone_host: string, phone_port: number }}
 */
export function getConfig() {
  const this_file = fileURLToPath(new URL(import.meta.url));
  const server_dir = path.dirname(this_file);
  const package_root = path.resolve(server_dir, '..');
  // Always reflect the directory from which the process was started
  const root_dir = process.cwd();

  let port_value = Number.parseInt(process.env.PORT || '', 10);
  if (!Number.isFinite(port_value)) {
    port_value = 3000;
  }

  const phone_env = (process.env.PHONE_PORT || '').trim().toLowerCase();
  let phone_port = Number.parseInt(phone_env, 10);
  if (phone_env === 'off' || phone_port === 0) {
    phone_port = 0;
  } else if (!Number.isInteger(phone_port) || phone_port > 65535) {
    phone_port = 3001;
  }

  const host_env = process.env.HOST;
  const host_value = host_env && host_env.length > 0 ? host_env : '127.0.0.1';

  return {
    host: host_value,
    port: port_value,
    app_dir: path.resolve(package_root, 'app'),
    root_dir,
    phone_host: '127.0.0.1',
    phone_port,
    url: `http://${host_value}:${port_value}`
  };
}
