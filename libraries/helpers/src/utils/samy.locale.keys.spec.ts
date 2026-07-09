// Guards the "Samy" assistant persona strings (en + ar): the display name and a
// non-empty first-person welcome that introduces Samy, covers the MCP path, and
// drops the direction-specific "left/right menu" wording that lies under RTL.
// (feature 004-brand-ui-refresh, US3 — Samy, the humanized assistant.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

describe('Samy persona locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it('names the assistant "Samy" / "سامي"', () => {
    expect(en.samy).toBe('Samy');
    expect(ar.samy).toBe('سامي');
  });

  it('has an English welcome that introduces Samy, mentions MCP, and is direction-neutral', () => {
    expect(typeof en.samy_welcome_message).toBe('string');
    expect(en.samy_welcome_message.length).toBeGreaterThan(0);
    expect(en.samy_welcome_message).toContain('Samy');
    expect(en.samy_welcome_message).toContain('MCP');
    expect(en.samy_welcome_message).not.toMatch(/left menu|right menu/i);
  });

  it('has an Arabic welcome that introduces سامي and mentions MCP', () => {
    expect(typeof ar.samy_welcome_message).toBe('string');
    expect(ar.samy_welcome_message.length).toBeGreaterThan(0);
    expect(ar.samy_welcome_message).toContain('سامي');
    expect(ar.samy_welcome_message).toContain('MCP');
  });
});
