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
  // through the transform rather than be required as-is. isomorphic-dompurify resolves to its
  // Node build, the server's, on jsdom: DOMPurify 3.4.8+ reads Node getters that happy-dom
  // leaves empty, so it does not sanitize on happy-dom's window. jsdom's CSS, selector and
  // encoding packages and isomorphic-dompurify's own parse5 and entities ship ESM only (some as
  // .mjs) too; isomorphic-dompurify is listed so the pattern reaches its nested node_modules.
  // The calendar's drag pipeline (rdndmb-html5-to-touch, its transitions in dnd-multi-backend,
  // and the touch backend with its invariant helper) ships ESM only as well, and so does
  // react-dnd itself, which a spec runs whole to drag a month chip with a finger
  // (calendar.month.hold.spec.tsx): react-dnd, dnd-core and its helpers, the multi-backend
  // provider with its preview, and the html5 backend.
  transformIgnorePatterns: [
    'node_modules/(?!react-hotkeys-hook/|isomorphic-dompurify/|parse5/|entities/|@exodus/bytes/|@asamuzakjp/css-color/|@asamuzakjp/dom-selector/|@asamuzakjp/generational-cache/|@csstools/css-calc/|@csstools/css-color-parser/|@csstools/color-helpers/|@csstools/css-parser-algorithms/|@csstools/css-tokenizer/|rdndmb-html5-to-touch/|dnd-multi-backend/|react-dnd-touch-backend/|@react-dnd/invariant/|react-dnd/|dnd-core/|@react-dnd/asap/|@react-dnd/shallowequal/|react-dnd-multi-backend/|react-dnd-preview/|react-dnd-html5-backend/)',
  ],
  transform: {
    '^.+\\.[mc]?[tj]sx?$': [
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
