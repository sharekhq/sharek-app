// The real MediaService constructs the upload factory at import, which reaches
// for the R2 SDK and its env; the tool only starts the render job (same shell
// pattern as generate.image.tool.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { HttpException } from '@nestjs/common';
import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const org = { id: 'org-1', name: 'Sharek' };

const startedJob = { jobId: 'video_org1_abcdefghij' };

// The real VideoManager reads decorator metadata and drags in every provider;
// the tool only reads titles out of it to build its description.
const videoManager = {
  getAllVideos: () => [{ title: 'Fake Provider' }],
} as any;

const makeTool = (over: { startGenerateVideo?: any } = {}) => {
  const media = {
    startGenerateVideo:
      over.startGenerateVideo ?? jest.fn().mockResolvedValue(startedJob),
  };
  const tool = new GenerateVideoTool(media as any, videoManager).run() as any;
  return { tool, media };
};

// checkAuth only writes to the request context when it finds an authInfo, and
// there is no async-storage context in a unit test — so the organization the
// tool reads back is the one seeded here.
const context = () =>
  ({
    requestContext: new Map<string, string>([
      ['organization', JSON.stringify(org)],
    ]),
  } as any);

const input = {
  identifier: 'fake-provider',
  output: 'vertical' as const,
  customParams: [{ key: 'voice', value: 'v-1' }],
};

// A paid plan's refusal carries the end of its credit window; a FREE or lapsed
// organization's has none, because it has no window to reset.
const RESETS_AT = '2026-12-01T00:00:00.000Z';

const outOfCredits = () =>
  new SubscriptionException({
    action: AuthorizationActions.Create,
    section: Sections.VIDEOS_PER_MONTH,
    resetsAt: RESETS_AT,
  });

const noPlanCredits = () =>
  new SubscriptionException({
    action: AuthorizationActions.Create,
    section: Sections.VIDEOS_PER_MONTH,
  });

const refusalFor = async (refusal = outOfCredits()) => {
  const { tool } = makeTool({
    startGenerateVideo: jest.fn().mockRejectedValue(refusal),
  });
  const result = await tool.execute(input, context());
  return result.error as string;
};

describe('GenerateVideoTool', () => {
  it('starts the job and returns its id', async () => {
    const { tool, media } = makeTool();

    const result = await tool.execute(input, context());

    expect(media.startGenerateVideo).toHaveBeenCalledWith(org, {
      type: 'fake-provider',
      output: 'vertical',
      customParams: { voice: 'v-1' },
    });
    expect(result).toEqual({ jobId: startedJob.jobId });
  });

  // A render outlasts the turn that asked for it, so the description is the
  // only thing standing between the user and an assistant that sits on the
  // reply polling for minutes. Upstream's wording told it to do exactly that.
  describe('the description', () => {
    const description = () => makeTool().tool.description as string;

    it('names the job id and the tool that reads it', () => {
      expect(description()).toContain('jobId');
      expect(description()).toContain('videoStatusTool');
    });

    it('says where the video turns up', () => {
      expect(description()).toContain('Media library');
    });

    it('forbids waiting inside the turn', () => {
      expect(description()).toMatch(/never wait/i);
      expect(description()).not.toMatch(/until the status is/i);
    });
  });

  // A thrown error reaches the model as an opaque tool failure, and the model
  // then supplies a cause of its own — the reported transcript answered "your
  // current subscription doesn't include access to Veo3 video generation",
  // which is false. Handing the refusal back as data is what makes the model
  // say the true thing, in the conversation's own language.
  describe('when the video credits are exhausted', () => {
    it('resolves with an error the model can relay, without throwing', async () => {
      const { tool } = makeTool({
        startGenerateVideo: jest.fn().mockRejectedValue(outOfCredits()),
      });

      const result = await tool.execute(input, context());

      expect(result.error).toEqual(expect.any(String));
      expect(result.jobId).toBeUndefined();
    });

    it('names the spent video credits as the cause', async () => {
      const error = await refusalFor();

      expect(error.toLowerCase()).toContain('video credits');
    });

    // Every framing from the reported transcript, and any provider name that
    // would let the model blame one type of video rather than the pool.
    it('rules out the plan, the subscription and any provider as the cause', async () => {
      const error = await refusalFor();

      expect(error).toMatch(/not that their plan or subscription/i);
      expect(error).not.toMatch(
        /does ?n[o’']t include|lacks? access|no access to|not available on your/i
      );
      expect(error).not.toMatch(/veo3|slides/i);
    });

    // The transcript's other three failures: an unnamed pool, a second refusal
    // that read as an unrelated problem, and no way forward. The way forward is
    // the date the credits come back: the ChatGPT plugin guidelines forbid
    // promoting upgrades, and Samy reads the same text.
    it('names the reset date and the pool every video type draws on, without an upsell', async () => {
      const error = await refusalFor();

      expect(error).toContain(RESETS_AT);
      expect(error).toMatch(/every .*video.*same video credits/i);
      expect(error).toMatch(/image credits are a separate pool/i);
      expect(error).toMatch(/do not suggest upgrading or buying anything/i);
      expect(error).not.toMatch(
        /can upgrade|upgrade their plan|\/billing|finish trial/i
      );
    });

    it('says a plan without video credits has none, without claiming they ran out', async () => {
      const error = await refusalFor(noPlanCredits());

      expect(error).toMatch(/current plan has no AI video credits/i);
      expect(error).not.toMatch(/run out|reset|not that their plan/i);
      expect(error).toMatch(/do not suggest upgrading or buying anything/i);
    });

    // Mastra validates the return against this schema, so without the widening
    // the refusal never even reaches the model — and the case above would pass
    // while the real tool threw a validation error instead.
    it('declares the error shape on the output schema', () => {
      const { tool } = makeTool();
      const shape = tool.outputSchema.shape;

      expect(Object.keys(shape)).toEqual(
        expect.arrayContaining(['jobId', 'error'])
      );
      expect(tool.outputSchema.safeParse({ error: 'no credits' }).success).toBe(
        true
      );
      expect(
        tool.outputSchema.safeParse({ jobId: startedJob.jobId }).success
      ).toBe(true);
      // The synchronous url is gone; a non-strict object would silently strip
      // it and let the old shape look valid.
      expect(
        tool.outputSchema.strict().safeParse({ url: 'https://media/abc.mp4' })
          .success
      ).toBe(false);
    });

    // The description is where the model is standing when it reads the result,
    // so a return shape it was never told about is one it has to guess at.
    it('tells the agent an error can come back instead of a video', () => {
      expect(makeTool().tool.description).toContain('{ error }');
    });
  });

  // A trialing organization can't render every video type, and upstream's
  // refusal sends the user to a billing button that charges the plan at once.
  // The ChatGPT plugin guidelines forbid linking to a page that starts a
  // charge, and Samy reads the same text.
  describe('when the video type is not available during the trial', () => {
    it('turns the trial refusal into wording without a billing link', async () => {
      const { tool } = makeTool({
        startGenerateVideo: jest
          .fn()
          .mockRejectedValue(
            new HttpException(
              'This video is not available in trial mode. To use it now, open https://dash.sharek.app/billing and click "Finish trial" (this charges the plan immediately)',
              406
            )
          ),
      });

      const result = await tool.execute(input, context());

      expect(result.error).toMatch(/not available during the trial/i);
      expect(result.error).not.toMatch(/billing|finish trial|charges/i);
      expect(result.jobId).toBeUndefined();
    });

    // The description is where the model is standing when it reads the result.
    it('tells the agent this refusal comes back as an error too', () => {
      expect(makeTool().tool.description).toMatch(
        /not available during the trial/i
      );
    });
  });

  // Everything else is a real failure — a safety rejection, an unknown video
  // type, a provider outage — and the existing tool-error handling is what
  // should see it.
  it('still throws failures that are not a credit refusal', async () => {
    const { tool } = makeTool({
      startGenerateVideo: jest.fn().mockRejectedValue(new Error('socket hang up')),
    });

    await expect(tool.execute(input, context())).rejects.toThrow(
      'socket hang up'
    );
  });

  it('still throws other HTTP errors', async () => {
    const { tool } = makeTool({
      startGenerateVideo: jest
        .fn()
        .mockRejectedValue(new HttpException('Video type fake not found', 404)),
    });

    await expect(tool.execute(input, context())).rejects.toThrow(
      'Video type fake not found'
    );
  });
});
