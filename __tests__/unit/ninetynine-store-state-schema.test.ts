import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';

/**
 * Deploy safety (99Food final review): the owner runs `prisma migrate deploy` inside the new container, after Deploy.
 * A column added to delivery_integrations makes every unselected DeliveryIntegration query of the new code (live iFood
 * token save, kitchen include) fail with P2022 until then, so the 99Food-only state lives in ninetynine_store_states.
 */
describe('99Food state stays off delivery_integrations', () => {
  const ninetynineOnly = ['linkRequestStoreId', 'linkRequestStoreName', 'linkRequestedAt', 'linkRequestedBy', 'pausedUntil'];

  it('DeliveryIntegration has no 99Food-only scalar fields', () => {
    const fields = Object.keys(Prisma.DeliveryIntegrationScalarFieldEnum);
    for (const f of ninetynineOnly) expect(fields).not.toContain(f);
  });

  it('NinetynineStoreState holds them, keyed by the integration', () => {
    const fields = Object.keys(Prisma.NinetynineStoreStateScalarFieldEnum);
    expect(fields).toEqual(expect.arrayContaining(['integrationId', ...ninetynineOnly]));
  });

  it('the 99Food migration adds no column to delivery_integrations', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20261110120000_ninetynine_events/migration.sql'), 'utf8');
    expect(sql).not.toMatch(/ALTER TABLE "delivery_integrations"/i);
    expect(sql).toMatch(/CREATE TABLE "ninetynine_store_states"/);
  });
});
