import 'reflect-metadata';
import { VideoAbstract } from '@gitroom/nestjs-libraries/videos/video.interface';
import '@gitroom/nestjs-libraries/videos/veo3/veo3';
import '@gitroom/nestjs-libraries/videos/images-slides/images.slides';

// Samy chooses a video provider from these strings alone: generateVideoOptions
// hands them to the model and nothing else tells it what a provider makes.
// They are the fork's own wording, so this spec is also what catches an
// upstream merge quietly restoring "the most advanced video model".
const describedAs = (identifier: string): string => {
  const meta = (Reflect.getMetadata('video', VideoAbstract) || []).find(
    (p: any) => p.identifier === identifier
  );
  if (!meta) {
    throw new Error(`No @Video metadata for ${identifier}`);
  }
  return meta.description;
};

describe('video provider descriptions', () => {
  it('tells the agent veo3 is one short continuous shot', () => {
    const description = describedAs('veo3');
    expect(description).toContain('continuous');
    expect(description).toContain('8 second');
    expect(description).toMatch(/no cuts/i);
  });

  it('tells the agent veo3 renders no readable text', () => {
    expect(describedAs('veo3')).toMatch(/no readable text/i);
  });

  it('tells the agent slides carry several points across 1-6 images', () => {
    const description = describedAs('image-text-slides');
    expect(description).toContain('1-6');
    expect(description).toMatch(/several points/i);
  });

  // "Generate videos with the most advanced video model." is 52 characters and
  // says nothing about what comes out. Anything that short is a regression,
  // whichever provider it lands on.
  it('keeps every provider description long enough to answer the question', () => {
    for (const meta of Reflect.getMetadata('video', VideoAbstract) || []) {
      expect(meta.description.length).toBeGreaterThan(120);
    }
  });
});
