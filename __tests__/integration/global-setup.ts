/**
 * Global Setup for Integration Tests
 * Runs once before all test suites
 */

import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('\n🚀 Starting Integration Test Global Setup...');
  
  // Ensure environment variables are loaded
  require('dotenv').config({ path: '.env' });

  // Verify DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required for integration tests');
  }

  console.log('✅ DATABASE_URL configured');
  console.log('✅ Global setup complete\n');
}
