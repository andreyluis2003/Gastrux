/**
 * Jest Configuration for Integration Tests
 */

module.exports = {
  displayName: 'integration',
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testEnvironment: 'node',
  globalSetup: '<rootDir>/__tests__/integration/global-setup.ts',
  globalTeardown: '<rootDir>/__tests__/integration/global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/__tests__/integration/setup-after-env.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },
  testTimeout: 30000,
  maxWorkers: 1,
  verbose: true,
  collectCoverage: false,
};
