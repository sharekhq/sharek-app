// Fork-only Jest config for specs that drive a real Mastra agent end to end.
// These cannot run under the plain config: @mastra/core's execution path uses a
// dynamic import(), which jest's VM rejects unless Node is started with
// --experimental-vm-modules — and once that flag is on, jest refuses to require
// `tokenx` (ESM only, pulled in by @mastra/core), so it is mapped to a stub.
//
// Both conditions come from upstream's dependency set; neither is reachable from
// the unit config, which is why this is separate rather than merged into it.
//
//   NODE_OPTIONS=--experimental-vm-modules \
//     npx jest --config libraries/nestjs-libraries/jest.integration.config.ts
import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.integration.spec.ts'],
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/(.*)$': '<rootDir>/$1',
    '^tokenx$': '<rootDir>/../test/tokenx.stub.ts',
  },
  transform: {
    '^.+\\.[mc]?[tj]s$': [
      'ts-jest',
      {
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
