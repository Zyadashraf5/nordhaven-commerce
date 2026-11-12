import type { Config } from 'jest';

const transform: Config['transform'] = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.base.json', diagnostics: true }],
};

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/**/*.spec.ts', '<rootDir>/test/unit/**/*.spec.ts'],
      testPathIgnorePatterns: ['\\.integration\\.', '\\.e2e\\.', '\\.process\\.'],
      transform,
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      transform,
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/e2e/**/*.spec.ts'],
      transform,
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
    {
      displayName: 'process',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/process/**/*.spec.ts'],
      transform,
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    },
  ],
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    '!apps/api/src/generated/**',
    '!apps/api/src/main.ts',
  ],
};

export default config;
