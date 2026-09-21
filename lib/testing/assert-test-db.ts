/**
 * Guard for the integration-test harness.
 *
 * The integration suites delete fixture users/restaurants before and after every
 * suite (see __tests__/integration/setup-after-env.ts), so they must never run
 * against a shared or production database. This module is pure (no Prisma, no
 * I/O) so it can be used from jest globalSetup, from the jest workers, and from
 * scripts.
 *
 * Rules (all must hold for BOTH DATABASE_URL and DIRECT_URL):
 *   - the URL parses and uses the postgres/postgresql protocol;
 *   - the database name ends with "_test";
 *   - the host is loopback (localhost, 127.0.0.1, ::1), unless the maintainer
 *     explicitly confirmed a dedicated REMOTE test database by setting
 *     INTEGRATION_DB_CONFIRM to exactly "<host>:<port>/<database>";
 *   - both URLs point to the same host, port and database.
 * A missing DIRECT_URL is treated as equal to DATABASE_URL. NODE_ENV=production
 * is always refused.
 */

export interface DbTarget {
  host: string;
  port: string;
  database: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_PORT = '5432';
// Connection-string parameters that can silently redirect the connection to a
// different server than the one in the authority part of the URL.
const REDIRECTING_PARAMS = ['host', 'hostaddr', 'dbname', 'port'];

interface ParsedUrl extends DbTarget {
  secrets: string[];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseDbUrl(name: string, raw: string): ParsedUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    // Do not include the raw value (or the parser error, which echoes it).
    throw new Error(`${name} is not a valid URL (expected postgresql://user@host:port/database).`);
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${name} must use the postgresql:// or postgres:// protocol.`);
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    throw new Error(`${name} has no host.`);
  }

  const database = safeDecode(url.pathname.replace(/^\//, '').split('/')[0] ?? '');
  if (!database) {
    throw new Error(`${name} has no database name.`);
  }

  for (const param of REDIRECTING_PARAMS) {
    if (url.searchParams.has(param)) {
      throw new Error(
        `${name} contains the "${param}" query parameter, which can redirect the connection to another server. Remove it.`
      );
    }
  }

  const secrets = [url.password, safeDecode(url.password)].filter((s) => s.length > 0);
  return { host, port: url.port || DEFAULT_PORT, database, secrets };
}

function formatTarget(t: DbTarget): string {
  return `${t.host}:${t.port}/${t.database}`;
}

/**
 * Renders a database URL for logs: protocol, host, port and database only
 * (never the user, password or query string).
 */
export function redactDbUrl(url: string | undefined | null): string {
  if (typeof url !== 'string' || url.trim() === '') return '<unset>';
  try {
    const parsed = parseDbUrl('database URL', url);
    return `postgresql://${formatTarget(parsed)}`;
  } catch {
    return '<unparseable database URL>';
  }
}

/**
 * Throws unless the environment targets a dedicated integration-test database.
 * Returns the validated target. Error messages never contain the password.
 */
export function assertDedicatedTestDb(env: Record<string, string | undefined>): DbTarget {
  const secrets: string[] = [];
  const refuse = (message: string): never => {
    let safe = `Refusing to run integration tests: ${message}`;
    for (const secret of secrets) {
      safe = safe.split(secret).join('***');
    }
    throw new Error(safe);
  };

  if (env.NODE_ENV === 'production') {
    return refuse('NODE_ENV is "production".');
  }

  const rawDatabaseUrl = env.DATABASE_URL;
  if (rawDatabaseUrl === undefined || rawDatabaseUrl.trim() === '') {
    return refuse('DATABASE_URL is not set (see .env.test.example).');
  }
  // Collect potential secrets first so that parse errors are scrubbed too.
  for (const raw of [rawDatabaseUrl, env.DIRECT_URL]) {
    if (typeof raw === 'string') {
      const m = /^[a-z][a-z0-9+.-]*:\/\/[^:@/]*:([^@]+)@/i.exec(raw.trim());
      if (m && m[1]) secrets.push(m[1]);
    }
  }

  let primary: ParsedUrl;
  let direct: ParsedUrl;
  try {
    primary = parseDbUrl('DATABASE_URL', rawDatabaseUrl);
    // DIRECT_URL missing => same as DATABASE_URL. An empty string is refused as invalid.
    direct = env.DIRECT_URL === undefined ? primary : parseDbUrl('DIRECT_URL', env.DIRECT_URL);
  } catch (error) {
    return refuse((error as Error).message);
  }
  secrets.push(...primary.secrets, ...direct.secrets);

  const confirm = env.INTEGRATION_DB_CONFIRM;
  const checked: Array<[string, ParsedUrl]> = [
    ['DATABASE_URL', primary],
    ['DIRECT_URL', direct],
  ];
  for (const [name, target] of checked) {
    if (!target.database.endsWith('_test')) {
      return refuse(
        `${name} targets database "${target.database}" but the database name must end with "_test".`
      );
    }
    if (!LOOPBACK_HOSTS.has(target.host)) {
      const expected = formatTarget(target);
      if (confirm === undefined || confirm === '') {
        return refuse(
          `${name} targets remote host "${target.host}", but only loopback hosts (localhost, 127.0.0.1, ::1) are allowed by default. ` +
            `If "${expected}" is a dedicated, disposable remote test database, set INTEGRATION_DB_CONFIRM=${expected} to allow it.`
        );
      }
      if (confirm !== expected) {
        return refuse(
          `INTEGRATION_DB_CONFIRM does not match ${name}: it must equal exactly "${expected}".`
        );
      }
    }
  }

  if (formatTarget(primary) !== formatTarget(direct)) {
    return refuse(
      `DATABASE_URL (${formatTarget(primary)}) and DIRECT_URL (${formatTarget(direct)}) must point to the same host, port and database.`
    );
  }

  return { host: primary.host, port: primary.port, database: primary.database };
}
