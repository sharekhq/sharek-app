// Fork-only Jest config (not present in upstream) — same rationale as
// libraries/nestjs-libraries/jest.config.ts: upstream's root jest.config.ts needs
// the never-installed @nx/jest, so scoped configs run the unit tests instead:
//   npx jest --config apps/backend/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^@gitroom/backend/(.*)$': '<rootDir>/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/../../../libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../../libraries/helpers/src/$1',
  },
  transform: {
    '^.+\\.[mc]?[tj]s$': [
      'ts-jest',
      {
        // isolatedModules = transpile each file alone, no whole-program type-check.
        // The repo-wide base tsconfig (rootDir ".", monorepo paths) otherwise OOMs the runner.
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          target: 'es2019',
          isolatedModules: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          allowJs: true,
        },
      },
    ],
  },
};

export default config;
