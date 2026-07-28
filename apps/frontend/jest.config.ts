// Fork-only Jest config (not present in upstream), mirroring
// libraries/react-shared-libraries/jest.config.ts. Upstream's root jest.config.ts imports
// `@nx/jest`, which this repo never installs, so the app's components are tested through this
// scoped config instead:
//   npx jest --config apps/frontend/jest.config.ts
//
// rootDir is the repo root so the `@gitroom/*` aliases can be mapped the way tsconfig.base.json
// declares them; only apps/frontend/src is scanned for specs.
import type { Config } from 'jest';

const config: Config = {
  rootDir: '../..',
  roots: ['<rootDir>/apps/frontend/src'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.spec.tsx'],
  moduleNameMapper: {
    '^@gitroom/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
    '^@gitroom/react/(.*)$':
      '<rootDir>/libraries/react-shared-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
  },
  // react-hotkeys-hook (the modal manager's Escape handling) ships ESM only, so it has to go
  // through the transform rather than be required as-is.
  transformIgnorePatterns: ['node_modules/(?!react-hotkeys-hook/)'],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        // isolatedModules = transpile each file alone, no whole-program type-check.
        // The repo-wide base tsconfig (rootDir ".", monorepo paths) otherwise OOMs the runner.
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          target: 'es2019',
          jsx: 'react-jsx',
          isolatedModules: true,
          allowJs: true,
        },
      },
    ],
  },
};

export default config;
