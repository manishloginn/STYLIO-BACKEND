/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.ts', '!src/database/seed.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  testTimeout: 120000,
  setupFiles: ['<rootDir>/test/set-env.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
};
