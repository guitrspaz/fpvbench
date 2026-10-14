export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/tests/**/*.test.mjs'],
  collectCoverageFrom: ['src/**/*.mjs'],
  testTimeout: 10000,
};
