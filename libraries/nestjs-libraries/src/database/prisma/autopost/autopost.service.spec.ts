// Keep the module import hermetic: the ChatOpenAI stub only has to satisfy the
// structured-output prompt chain in generatePicture (LangChain coerces the
// returned function into a Runnable), and the NestJS dependencies are
// constructor metadata only — generatePicture never touches them.
const mockChatOpenAIFields: any[] = [];
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(fields: any) {
      mockChatOpenAIFields.push(fields);
    }
    withStructuredOutput() {
      return async () => ({
        generatedTextToBeSentToDallE: 'a pomegranate on a desk',
      });
    }
  },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository',
  () => ({ AutopostRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { AutopostService } from './autopost.service';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

// Mirrors the select subset media.repository saveFile actually returns
// (no organizationId or timestamps).
const mediaRow = {
  id: 'media-1',
  name: 'abc.png',
  path: 'https://uploads.example.com/2026/07/abc.png',
};

// The run has only an organizationId in its state — there is no request org —
// so the row is fetched, with its subscription, before anything is generated.
const org = { id: 'org-1', subscription: { subscriptionTier: 'PRO' } };

const makeService = (over: { media?: any; organizations?: any } = {}) => {
  const media = over.media ?? {
    generateImage: jest.fn().mockResolvedValue('B64DATA'),
    saveFile: jest.fn().mockResolvedValue(mediaRow),
  };
  const organizations = over.organizations ?? {
    getOrgById: jest.fn().mockResolvedValue(org),
  };
  const service = new AutopostService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    media as any,
    organizations as any
  );
  const storage = {
    uploadSimple: jest
      .fn()
      .mockResolvedValue('https://uploads.example.com/2026/07/abc.png'),
  };
  (service as any).storage = storage;
  return { service, media, organizations, storage };
};

const pictureState = () =>
  ({
    body: { organizationId: 'org-1' },
    load: { description: 'New article about pomegranates' },
  } as any);

describe('AutopostService.generatePicture', () => {
  it('generates through the metering point and registers the image in the media library', async () => {
    const { service, media, organizations, storage } = makeService();

    const state: any = await service.generatePicture(pictureState());

    expect(organizations.getOrgById).toHaveBeenCalledWith('org-1');
    expect(media.generateImage).toHaveBeenCalledWith(
      'a pomegranate on a desk',
      org
    );
    expect(storage.uploadSimple).toHaveBeenCalledWith(
      'data:image/png;base64,B64DATA'
    );
    expect(media.saveFile).toHaveBeenCalledWith(
      'org-1',
      'abc.png',
      'https://uploads.example.com/2026/07/abc.png'
    );
    expect(state.image).toBe(mediaRow);
  });

  // Autopost is unattended: a customer's publishing pipeline must not stop
  // because an image could not be paid for. The article is the point; the
  // picture is the extra, and schedulePost already drafts without one.
  describe('when the image allowance is exhausted', () => {
    const refused = () =>
      jest.fn().mockRejectedValue(
        new SubscriptionException({
          action: AuthorizationActions.Create,
          section: Sections.IMAGES_PER_MONTH,
        })
      );

    it('carries on without an image and saves no media', async () => {
      const media = {
        generateImage: refused(),
        saveFile: jest.fn(),
      };
      const { service, storage } = makeService({ media });

      const state: any = await service.generatePicture(pictureState());

      expect(state.image).toBeUndefined();
      expect(storage.uploadSimple).not.toHaveBeenCalled();
      expect(media.saveFile).not.toHaveBeenCalled();
    });

    it('leaves the rest of the state intact for schedulePost', async () => {
      const { service } = makeService({
        media: { generateImage: refused(), saveFile: jest.fn() },
      });

      const state: any = await service.generatePicture(pictureState());

      expect(state.body.organizationId).toBe('org-1');
      expect(state.load.description).toBe('New article about pomegranates');
    });

    // A provider outage is still a failed run, and the workflow's own retry is
    // what should see it — not a silently imageless post.
    it('still propagates failures that are not a credit refusal', async () => {
      const { service } = makeService({
        media: {
          generateImage: jest.fn().mockRejectedValue(new Error('socket hang up')),
          saveFile: jest.fn(),
        },
      });

      await expect(service.generatePicture(pictureState())).rejects.toThrow(
        'socket hang up'
      );
    });
  });
});

describe('AutopostService.schedulePost', () => {
  it('attaches the registered media row to the drafted post', async () => {
    const postsService = {
      findFreeDateTime: jest.fn().mockResolvedValue('2026-07-27T10:00:00'),
      createPost: jest.fn().mockResolvedValue([]),
    };
    const service = new AutopostService(
      {} as any,
      {} as any,
      {} as any,
      postsService as any,
      {} as any,
      {} as any
    );

    await service.schedulePost({
      description: 'Fresh article',
      load: { url: 'https://blog.example.com/a' },
      image: {
        id: 'media-1',
        name: 'abc.png',
        path: 'https://uploads.example.com/2026/07/abc.png',
      },
      integrations: [
        { id: 'int-1', providerIdentifier: 'x', organizationId: 'org-1' },
      ],
    } as any);

    const dto = postsService.createPost.mock.calls[0][1];
    expect(dto.posts[0].value[0].image).toEqual([
      {
        id: 'media-1',
        name: 'abc.png',
        path: 'https://uploads.example.com/2026/07/abc.png',
        organizationId: 'org-1',
      },
    ]);
  });
});

// Same contract as the post generator: gpt-5.x 400s on a non-default
// temperature, and reasoning is configured through `reasoning.effort` rather
// than the deprecated call-option-only `reasoningEffort`. This graph binds no
// tools, so 'none' here is purely about not paying for reasoning tokens — they
// bill as output, and gpt-5.6 defaults to 'medium'.
describe('AutopostService model', () => {
  it('runs gpt-5.6-luna with reasoning off and no temperature', () => {
    expect(mockChatOpenAIFields).toHaveLength(1);
    const [fields] = mockChatOpenAIFields;
    expect(fields.model).toBe('gpt-5.6-luna');
    expect(fields.reasoning).toEqual({ effort: 'none' });
    expect(fields).not.toHaveProperty('temperature');
  });
});
