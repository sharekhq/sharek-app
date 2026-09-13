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
  // file-type 22 (custom.upload.validation) is ESM-only and publishes no
  // "require" condition: Node 22.12+ resolves it from require() through
  // "module-sync", and Jest's resolver and CommonJS runtime both have to be
  // told the same — see libraries/nestjs-libraries/jest.config.ts.
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons', 'module-sync'],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!file-type/|strtok3/|token-types/|uint8array-extras/|@tokenizer/inflate/|@borewit/text-codec/)',
  ],
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
