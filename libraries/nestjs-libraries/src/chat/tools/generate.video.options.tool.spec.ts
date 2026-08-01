import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';

// The real VideoManager reads decorator metadata, which drags in every provider
// and through them Transloadit, ElevenLabs and the upload factory. This tool
// only reshapes what the manager hands it, so a stub is both enough and
// hermetic.
const PROVIDER = {
  identifier: 'fake-provider',
  title: 'Fake Provider',
  description: 'One continuous fake shot. Suits nothing real.',
  dto: { name: 'FakeParams' },
  target: {},
  tools: [{ functionName: 'loadVoices', output: 'voice id' }],
  placement: 'text-to-image',
  trial: true,
};

const runTool = () =>
  new GenerateVideoOptionsTool({
    getAllVideos: () => [PROVIDER],
  } as any).run() as any;

describe('GenerateVideoOptionsTool', () => {
  // Samy chooses a video provider from this payload alone. Without title and
  // description it is choosing between parameter names.
  it('carries each provider title and description', async () => {
    const result = await runTool().execute({}, undefined);

    expect(result.video).toHaveLength(1);
    expect(result.video[0]).toMatchObject({
      type: 'fake-provider',
      title: 'Fake Provider',
      description: 'One continuous fake shot. Suits nothing real.',
      output: 'vertical|horizontal',
      tools: [{ functionName: 'loadVoices', output: 'voice id' }],
    });
  });

  // execute() is not validated against outputSchema, so the assertion above
  // would pass while the model still saw a schema with the fields missing.
  it('declares title and description on the output schema', () => {
    const shape = runTool().outputSchema.shape.video.element.shape;

    expect(Object.keys(shape)).toEqual(
      expect.arrayContaining(['type', 'title', 'description'])
    );
  });

  // The tool description is where the model is standing when it decides, so it
  // is where it gets told the payload is worth reading.
  it('tells the agent the descriptions are worth reading', () => {
    expect(runTool().description).toContain(
      'what it actually produces and what it suits'
    );
  });
});
