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
  transformIgnorePatterns: ['/node_modules/(?!tokenx/)'],
};

export default config;
