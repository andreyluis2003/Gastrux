# Integration tests

These suites talk to a real PostgreSQL database and **delete fixture data**: before and after
every suite `setup-after-env.ts` removes the fixture users and restaurants. They must therefore
only ever run against a dedicated, disposable test database. Never point them at a shared,
staging or production database.

## Run them

One-time setup of the dedicated database (Windows, portable PostgreSQL 15, no installer, no Docker):

1. Download the PostgreSQL 15 "Windows x86-64" `.zip` from
   <https://www.enterprisedb.com/download-postgresql-binaries> and extract it so that
   `%USERPROFILE%\gastrux-test-pg\pgsql\bin\pg_ctl.exe` exists
   (set `GASTRUX_TEST_PG_HOME` to use another root).
2. `npm run test:db:setup` - creates the data directory, listens only on `127.0.0.1:55432`
   (trust auth, `fsync` off for speed), creates the `gastrux_test` database and copies
   `.env.test.example` to `.env.test` if it is missing. Safe to re-run.
3. `npm run test:db:migrate` - applies `prisma/migrations` to the test database, then checks that the
   result matches `prisma/schema.prisma` (drift check).

Then, as often as you like:

```
npm run test:integration
```

Other helpers: `npm run test:db:start | stop | status`, and `npm run test:db:reset` (drops and
recreates `gastrux_test`, then migrates; it refuses to touch anything but the portable cluster on
`127.0.0.1:55432`).

If `migrate deploy` fails you can fall back to `npm run test:db:migrate -- -UseDbPush`, which loads the
schema with `prisma db push`. The migration files are **not** exercised in that case, and the script
says so loudly.

## What the guard refuses, and why

`lib/testing/assert-test-db.ts` runs in `global-setup.ts` and again at the top of
`setup-after-env.ts` (so the jest workers are protected even if globalSetup is bypassed). It
throws, before any Prisma client is created, unless all of this holds for both `DATABASE_URL` and
`DIRECT_URL` (a missing `DIRECT_URL` counts as equal to `DATABASE_URL`):

- the URL parses and uses `postgresql://` or `postgres://`;
- the database name ends with `_test`;
- the host is loopback (`localhost`, `127.0.0.1`, `::1`);
- both URLs point to the same host, port and database;
- `NODE_ENV` is not `production`;
- the URL has no `host`, `hostaddr`, `dbname` or `port` query parameter (they could redirect the
  connection elsewhere).

Error messages and the printed target never include the user or password.

## `.env` is never read

The harness loads **only** `.env.test` (repo root, gitignored). It never loads `.env`, and values in
`.env.test` override anything already in the shell, so a stray `DATABASE_URL` in your terminal cannot
silently win. If `.env.test` is missing the run stops and tells you to
`copy .env.test.example .env.test` and run `npm run test:db:setup`.

## Using a dedicated remote test database

Only do this for a database created for testing and nothing else. Put its URLs in `.env.test`
(database name must still end in `_test`) and confirm the exact target, in the shell or in `.env.test`:

```
INTEGRATION_DB_CONFIRM=<host>:<port>/<database>
```

For example `INTEGRATION_DB_CONFIRM=test-db.example.com:5432/gastrux_test`. The value must equal the
host, port and database of the URLs exactly; any other value is refused. The `_test` suffix rule
cannot be overridden. The `test:db:*` scripts still only manage the local portable cluster
(`reset` refuses a remote target).
