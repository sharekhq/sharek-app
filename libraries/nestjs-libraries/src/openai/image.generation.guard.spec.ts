import * as fs from 'fs';
import * as path from 'path';

/**
 * The image allowance is enforced and recorded in one place —
 * `MediaService.generateImage` / `generateImageWithPrompt`. That only holds as
 * long as nothing reaches the raw generators behind it: every surface that had
 * to remember the check for itself (the wizard, autopost, the assistant)
 * eventually forgot, which is the leak this guard exists to keep closed.
 *
 * A build failure here means a new call site is generating images off the
 * books. Route it through MediaService rather than widening the list below.
 */

// Callers hold the service under their own name (`_openAi`, `_openaiService`),
// so the receiver is resolved from the declarations in each file rather than
// guessed — `this._mediaService.generateImage(...)` is the metered path and
// must not be mistaken for a raw one.
const RAW_METHODS = ['generateImage', 'generateImageAtSize'];

const ALLOWED = [
  // The metering point itself.
  'libraries/nestjs-libraries/src/database/prisma/media/media.service.ts',
  // Slide frames rendered inside a video generation: already paid for by the
  // video credit, and charging them again would bill one render twice.
  'libraries/nestjs-libraries/src/videos/images-slides/images.slides.ts',
  // Where the generators are declared.
  'libraries/nestjs-libraries/src/openai/openai.service.ts',
];

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SEARCH = ['apps', 'libraries'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sources(full);
    }

    // Specs are excluded on purpose: a test may mock the raw generator to
    // prove a caller never reaches it.
    if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.spec.tsx')) {
      return [];
    }

    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

// e.g. `private _openaiService: OpenaiService,` or `openAi: OpenaiService`
const HOLDER = /(\w+)\s*:\s*OpenaiService\b/g;

const rawCallersIn = (source: string) => {
  const holders = [...source.matchAll(HOLDER)].map((match) => match[1]);

  return holders.some((holder) =>
    RAW_METHODS.some((method) => source.includes(`${holder}.${method}(`))
  );
};

const flagged = SEARCH.flatMap((dir) => sources(path.join(ROOT, dir)))
  .filter((file) => rawCallersIn(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
  .sort();

describe('raw image generator call sites', () => {
  it('has none outside the metering point and the slide renderer', () => {
    expect(flagged.filter((file) => !ALLOWED.includes(file))).toEqual([]);
  });

  // Without this the guard could pass by finding nothing at all — a broken
  // matcher and a clean codebase look identical from the assertion above.
  it('still recognises the call sites it is meant to allow', () => {
    expect(flagged).toEqual(
      expect.arrayContaining([
        'libraries/nestjs-libraries/src/database/prisma/media/media.service.ts',
        'libraries/nestjs-libraries/src/videos/images-slides/images.slides.ts',
      ])
    );
  });
});
