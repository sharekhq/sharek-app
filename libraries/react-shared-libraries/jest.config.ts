// Fork-only Jest config (not present in upstream), mirroring libraries/helpers/jest.config.ts.
// Upstream's root jest.config.ts imports `@nx/jest`, which this repo never installs, so the
// shared React components are tested through this scoped config instead:
//   npx jest --config libraries/react-shared-libraries/jest.config.ts
//
// Components are asserted through react-dom/server, so no jsdom or DOM testing library is
// needed — these specs check the class strings a component emits, which is where the
// design-token bugs live.
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.tsx'],
  transform: {
    '^.+\\.tsx?$': [
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
        },
      },
    ],
  },
};

export default config;
