/**
 * Global Setup for Integration Tests
 * Runs once before all test suites
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { assertDedicatedTestDb, redactDbUrl } from '../../lib/testing/assert-test-db';

export default async function globalSetup() {
  console.log('\n🚀 Starting Integration Test Global Setup...');
  
  // Load ONLY .env.test (never .env: these suites delete fixture data).
  const envTestPath = path.resolve(__dirname, '../../.env.test');
  if (!fs.existsSync(envTestPath)) {
    throw new Error(
      '.env.test not found. Integration tests only read .env.test (never .env). ' +
        'Run "copy .env.test.example .env.test" and then "npm run test:db:setup".'
    );
  }
  // override: a DATABASE_URL/DIRECT_URL from the shell must not win silently.
  const loaded = require('dotenv').config({ path: envTestPath, override: true });
  if (loaded.error) {
    throw new Error('Could not read .env.test: ' + loaded.error.message);
  }

  // Refuse to continue unless the final values point at a dedicated test database.
  assertDedicatedTestDb(process.env);
  console.log('   Integration DB target: ' + redactDbUrl(process.env.DATABASE_URL));

  console.log('✅ DATABASE_URL configured');
  console.log('✅ Global setup complete\n');
}
