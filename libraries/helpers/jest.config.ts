// Fork-only Jest config (not present in upstream).
// Upstream's root jest.config.ts imports `@nx/jest`, which this repo never installs,
// so `pnpm test` is broken upstream too. Editing that shared file would conflict on
// every weekly upstream merge, so the helpers' unit tests run through this scoped
// config instead:  npx jest --config libraries/helpers/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  // Jest does not read tsconfig `paths`, so a helper that imports a shared constant
  // through its alias resolves at build time and not under test. Only `@gitroom/react`
  // is mapped, and only the shared i18n config is imported through it today.
  moduleNameMapper: {
    '^@gitroom/react/(.*)$': '<rootDir>/../../react-shared-libraries/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // isolatedModules = transpile each file alone, no whole-program type-check.
        // The repo-wide base tsconfig (rootDir ".", monorepo paths) otherwise OOMs the runner.
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          target: 'es2019',
          isolatedModules: true,
        },
      },
    ],
  },
};

export default config;
