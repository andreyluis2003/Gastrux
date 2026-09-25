/**
 * Jest configuration for DB-free unit tests.
 * Unlike jest.integration.config.js this has no globalSetup / setupFilesAfterEnv,
 * so it never connects to DATABASE_URL and never runs cleanupAllTestData().
 */
module.exports = {
  displayName: 'unit',
  testMatch: ['**/__tests__/unit/**/*.test.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  testTimeout: 15000,
  verbose: true,
};
