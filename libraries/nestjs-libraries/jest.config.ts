// Fork-only Jest config (not present in upstream) — same rationale as
// libraries/helpers/jest.config.ts: upstream's root jest.config.ts needs the
// never-installed @nx/jest, so scoped configs run the unit tests instead:
//   npx jest --config libraries/nestjs-libraries/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  // *.integration.spec.ts drive a real Mastra agent and need Node flags this
  // config cannot set — see jest.integration.config.ts.
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$'],
  setupFiles: ['reflect-metadata'],
  // music-metadata 11 and file-type 22 publish no "require" condition in their
  // exports map — Node 22.12+ resolves them from require() through
  // "module-sync", and Jest's resolver has to be told the same or the packages
  // look missing. 'node'/'node-addons' are jest-environment-node's defaults.
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons', 'module-sync'],
  },
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/(.*)$': '<rootDir>/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../helpers/src/$1',
    // A handful of libraries import back into the backend app (media.service
    // raises SubscriptionException); same mapping as tsconfig.base.json.
    '^@gitroom/backend/(.*)$': '<rootDir>/../../../apps/backend/src/$1',
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
  // @mastra/core's CJS build requires tokenx, which ships ESM only. node_modules
  // is untransformed by default, so importing anything from @mastra/core throws
  // "Unexpected token 'export'" until tokenx goes through the transform too.
  // file-type 22 and music-metadata 11 are ESM-only for the same reason: Node
  // 22.12+ loads them from require() natively, but Jest's own CommonJS runtime
  // does not, so custom.upload.validation's require('file-type') needs them —
  // and their ESM dependencies — transformed as well.
  transformIgnorePatterns: [
    '/node_modules/(?!tokenx/|file-type/|music-metadata/|media-typer/|strtok3/|token-types/|uint8array-extras/|win-guid/|@tokenizer/inflate/|@borewit/text-codec/)',
  ],
};

export default config;
