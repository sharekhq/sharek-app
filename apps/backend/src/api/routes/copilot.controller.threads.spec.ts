// The Samy page lists, renames and pins its chats through ChatThreadsService;
// the controller hands it the caller's workspace and the body, and nothing else
// (contracts/chat-threads-api.md). The service is a set of spies and the
// controller's other dependencies are shells, as in copilot.controller.history.spec.
jest.mock('@gitroom/nestjs-libraries/chat/sharek.agent', () => ({
  getSharekAgents: () => ({}),
  logRunError: () => undefined,
  SharekAgentRunner: class {},
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);

import { NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ChatTitleDto } from '@gitroom/nestjs-libraries/dtos/chat/chat.title.dto';
import { ChatPinDto } from '@gitroom/nestjs-libraries/dtos/chat/chat.pin.dto';
import { CopilotController } from './copilot.controller';

const organization = { id: 'org-1' } as unknown as Parameters<
  CopilotController['getList']
>[0];

const chat = {
  id: 'thread-1',
  title: 'Cold brew launch plan',
  pinned: true,
  updatedAt: '2026-11-08T09:12:44.000Z',
};
const listed = { threads: [chat] };

const makeController = () => {
  const service = {
    list: jest.fn().mockResolvedValue(listed),
    rename: jest.fn().mockResolvedValue(chat),
    setPinned: jest.fn().mockResolvedValue(chat),
  };
  // No Mastra: the list reads its chats through the service alone.
  const controller = new CopilotController(
    {} as unknown as ConstructorParameters<typeof CopilotController>[0],
    {} as unknown as ConstructorParameters<typeof CopilotController>[1],
    service as unknown as ConstructorParameters<typeof CopilotController>[2]
  );
  return { controller, service };
};

describe('CopilotController chat threads', () => {
  it("lists the workspace's chats as the service returns them", async () => {
    const { controller, service } = makeController();

    await expect(controller.getList(organization)).resolves.toBe(listed);
    expect(service.list).toHaveBeenCalledWith('org-1');
  });

  it("renames a chat of the caller's workspace", async () => {
    const { controller, service } = makeController();
    const body: ChatTitleDto = { title: 'Cold brew launch plan' };

    await expect(
      controller.renameThread(organization, 'thread-1', body)
    ).resolves.toBe(chat);
    expect(service.rename).toHaveBeenCalledWith(
      'org-1',
      'thread-1',
      'Cold brew launch plan'
    );
  });

  it.each([true, false])(
    "sets a chat of the caller's workspace to pinned: %s",
    async (pinned) => {
      const { controller, service } = makeController();
      const body: ChatPinDto = { pinned };

      await expect(
        controller.pinThread(organization, 'thread-1', body)
      ).resolves.toBe(chat);
      expect(service.setPinned).toHaveBeenCalledWith(
        'org-1',
        'thread-1',
        pinned
      );
    }
  );

  // The service answers a missing chat and another workspace's chat alike.
  it('lets a rename of a chat it cannot find fail as not found', async () => {
    const { controller, service } = makeController();
    service.rename.mockRejectedValue(new NotFoundException());

    await expect(
      controller.renameThread(organization, 'thread-2', { title: 'Plan' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a pin of a chat it cannot find fail as not found', async () => {
    const { controller, service } = makeController();
    service.setPinned.mockRejectedValue(new NotFoundException());

    await expect(
      controller.pinThread(organization, 'thread-2', { pinned: true })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CopilotController chat thread routes', () => {
  it.each([
    { name: 'getList' as const, method: RequestMethod.GET, path: '/list' },
    {
      name: 'renameThread' as const,
      method: RequestMethod.PUT,
      path: '/:thread/title',
    },
    {
      name: 'pinThread' as const,
      method: RequestMethod.PUT,
      path: '/:thread/pin',
    },
  ])(
    "$name is served at $path with the list's permission",
    ({ name, method, path }) => {
      const handler = CopilotController.prototype[name];

      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(CHECK_POLICIES_KEY, handler)).toEqual([
        [AuthorizationActions.Create, Sections.AI],
      ]);
    }
  );

  // The global ValidationPipe validates a body against its parameter's type,
  // which is what turns a bad title or pin into a 400.
  it.each([
    { name: 'renameThread' as const, dto: ChatTitleDto },
    { name: 'pinThread' as const, dto: ChatPinDto },
  ])('$name takes its body as $dto.name', ({ name, dto }) => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        CopilotController.prototype,
        name
      )
    ).toContain(dto);
  });
});
