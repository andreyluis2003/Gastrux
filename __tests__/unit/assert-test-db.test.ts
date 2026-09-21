// @ts-nocheck
import { assertDedicatedTestDb, redactDbUrl } from '../../lib/testing/assert-test-db';

const LOCAL = 'postgresql://postgres@127.0.0.1:55432/gastrux_test';
const PASSWORD = 'S3cr3tPassw0rd!xyz';
const REMOTE_HOST = 'aws-0-sa-east-1.pooler.supabase.com';

function env(extra = {}) {
  return { DATABASE_URL: LOCAL, DIRECT_URL: LOCAL, ...extra };
}

function errorOf(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the guard to throw');
}

describe('assertDedicatedTestDb', () => {
  it('accepts the dedicated local database', () => {
    expect(assertDedicatedTestDb(env())).toEqual({
      host: '127.0.0.1',
      port: '55432',
      database: 'gastrux_test',
    });
  });

  it('treats a missing DIRECT_URL as equal to DATABASE_URL', () => {
    expect(assertDedicatedTestDb({ DATABASE_URL: LOCAL }).database).toBe('gastrux_test');
  });

  it('accepts localhost and the IPv6 loopback', () => {
    const a = 'postgresql://postgres@localhost:5432/app_test';
    const b = 'postgres://postgres@[::1]:5432/app_test';
    expect(assertDedicatedTestDb({ DATABASE_URL: a }).host).toBe('localhost');
    expect(assertDedicatedTestDb({ DATABASE_URL: b }).host).toBe('[::1]');
  });

  it('refuses a Supabase-looking remote host', () => {
    const url = `postgresql://postgres.abcdef:${PASSWORD}@${REMOTE_HOST}:6543/postgres?pgbouncer=true`;
    expect(() => assertDedicatedTestDb({ DATABASE_URL: url, DIRECT_URL: url })).toThrow(/_test|loopback/);
  });

  it('refuses a database whose name does not end with _test', () => {
    const url = 'postgresql://postgres@127.0.0.1:55432/gastrux';
    expect(() => assertDedicatedTestDb({ DATABASE_URL: url })).toThrow(/must end with "_test"/);
  });

  it('refuses a *_test database on a remote host without INTEGRATION_DB_CONFIRM', () => {
    const url = `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:5432/gastrux_test`;
    expect(() => assertDedicatedTestDb({ DATABASE_URL: url, DIRECT_URL: url })).toThrow(/INTEGRATION_DB_CONFIRM/);
  });

  it('accepts a remote *_test database with the exact INTEGRATION_DB_CONFIRM', () => {
    const url = `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:5432/gastrux_test`;
    const result = assertDedicatedTestDb({
      DATABASE_URL: url,
      DIRECT_URL: url,
      INTEGRATION_DB_CONFIRM: `${REMOTE_HOST}:5432/gastrux_test`,
    });
    expect(result).toEqual({ host: REMOTE_HOST, port: '5432', database: 'gastrux_test' });
  });

  it('refuses INTEGRATION_DB_CONFIRM with the wrong value', () => {
    const url = `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:5432/gastrux_test`;
    for (const confirm of ['yes', 'true', `${REMOTE_HOST}:5432/other_test`, `${REMOTE_HOST}/gastrux_test`, `${REMOTE_HOST}:5432/gastrux_test `]) {
      expect(() =>
        assertDedicatedTestDb({ DATABASE_URL: url, DIRECT_URL: url, INTEGRATION_DB_CONFIRM: confirm })
      ).toThrow(/INTEGRATION_DB_CONFIRM does not match/);
    }
  });

  it('never lets INTEGRATION_DB_CONFIRM override the _test suffix rule', () => {
    const url = `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:5432/postgres`;
    expect(() =>
      assertDedicatedTestDb({ DATABASE_URL: url, DIRECT_URL: url, INTEGRATION_DB_CONFIRM: `${REMOTE_HOST}:5432/postgres` })
    ).toThrow(/must end with "_test"/);
  });

  it('refuses a mismatching DIRECT_URL', () => {
    expect(() =>
      assertDedicatedTestDb({ DATABASE_URL: LOCAL, DIRECT_URL: 'postgresql://postgres@127.0.0.1:55432/other_test' })
    ).toThrow(/same host, port and database/);
    expect(() =>
      assertDedicatedTestDb({ DATABASE_URL: LOCAL, DIRECT_URL: 'postgresql://postgres@127.0.0.1:5432/gastrux_test' })
    ).toThrow(/same host, port and database/);
  });

  it('refuses a DIRECT_URL that points at a remote database', () => {
    const remote = `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:5432/gastrux_test`;
    expect(() => assertDedicatedTestDb({ DATABASE_URL: LOCAL, DIRECT_URL: remote })).toThrow(/DIRECT_URL/);
  });

  it('refuses garbage, empty and missing values', () => {
    expect(() => assertDedicatedTestDb({ DATABASE_URL: 'not a url' })).toThrow(/not a valid URL/);
    expect(() => assertDedicatedTestDb({ DATABASE_URL: '' })).toThrow(/not set/);
    expect(() => assertDedicatedTestDb({})).toThrow(/not set/);
    expect(() => assertDedicatedTestDb({ DATABASE_URL: LOCAL, DIRECT_URL: 'garbage' })).toThrow(/DIRECT_URL is not a valid URL/);
    expect(() => assertDedicatedTestDb({ DATABASE_URL: LOCAL, DIRECT_URL: '' })).toThrow(/DIRECT_URL/);
    expect(() => assertDedicatedTestDb({ DATABASE_URL: 'mysql://root@127.0.0.1/app_test' })).toThrow(/protocol/);
  });

  it('refuses connection parameters that redirect to another host', () => {
    const url = 'postgresql://postgres@127.0.0.1:55432/gastrux_test?host=other.example.com';
    expect(() => assertDedicatedTestDb({ DATABASE_URL: url })).toThrow(/"host" query parameter/);
  });

  it('refuses NODE_ENV=production even for the local database', () => {
    expect(() => assertDedicatedTestDb(env({ NODE_ENV: 'production' }))).toThrow(/production/);
  });

  it('never puts the password in an error message', () => {
    const remote = `postgresql://postgres.abcdef:${PASSWORD}@${REMOTE_HOST}:5432/gastrux_test`;
    const cases = [
      { DATABASE_URL: remote, DIRECT_URL: remote },
      { DATABASE_URL: remote, DIRECT_URL: remote, INTEGRATION_DB_CONFIRM: 'wrong' },
      { DATABASE_URL: remote.replace('/gastrux_test', '/postgres'), DIRECT_URL: remote },
      { DATABASE_URL: LOCAL, DIRECT_URL: remote },
      { DATABASE_URL: remote, NODE_ENV: 'production' },
      { DATABASE_URL: `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:5432/a?host=x` },
      { DATABASE_URL: `postgresql://postgres:${PASSWORD}@${REMOTE_HOST}:notaport/a_test` },
      { DATABASE_URL: `postgresql://postgres:${PASSWORD}/oops@${REMOTE_HOST}/a_test` },
      { DATABASE_URL: `mysql://root:${PASSWORD}@${REMOTE_HOST}/a_test` },
    ];
    for (const c of cases) {
      const error = errorOf(() => assertDedicatedTestDb(c));
      expect(error.message).not.toContain(PASSWORD);
      expect(error.message).not.toContain(encodeURIComponent(PASSWORD));
    }
  });
});

describe('redactDbUrl', () => {
  it('drops user, password and query string', () => {
    const url = `postgresql://postgres.abcdef:${PASSWORD}@${REMOTE_HOST}:6543/postgres?pgbouncer=true`;
    const redacted = redactDbUrl(url);
    expect(redacted).toBe(`postgresql://${REMOTE_HOST}:6543/postgres`);
    expect(redacted).not.toContain(PASSWORD);
    expect(redacted).not.toContain('postgres.abcdef');
    expect(redacted).not.toContain('pgbouncer');
  });

  it('handles unset and unparseable values without echoing them', () => {
    expect(redactDbUrl(undefined)).toBe('<unset>');
    expect(redactDbUrl('')).toBe('<unset>');
    expect(redactDbUrl(`nonsense ${PASSWORD}`)).toBe('<unparseable database URL>');
  });
});
