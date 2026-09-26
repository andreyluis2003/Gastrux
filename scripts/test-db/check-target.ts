/**
 * Validates DATABASE_URL / DIRECT_URL from the current environment with the same
 * guard the integration harness uses (lib/testing/assert-test-db.ts).
 * Used by the PowerShell scripts in this folder. Never connects to a database.
 *
 * stdout: JSON {"host","port","database"} on success. stderr + exit code 1 on refusal.
 */
import { assertDedicatedTestDb } from '../../lib/testing/assert-test-db';

try {
  const target = assertDedicatedTestDb(process.env);
  process.stdout.write(JSON.stringify(target) + '\n');
} catch (error) {
  process.stderr.write((error as Error).message + '\n');
  process.exit(1);
}
