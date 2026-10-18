/** Final review 2026-10-18 (I-6): every restaurant that exists when the migration runs becomes internal, whatever its date */
import fs from 'fs';
import path from 'path';

it('the plan_access migration has no date cutoff and stays idempotent', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20261018120000_plan_access/migration.sql'), 'utf8');
  expect(sql).not.toMatch(/createdAt/);
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "isInternal"/);
  expect(sql).toMatch(/WHERE "isInternal" = false/);
});
