// Every email the product sends takes one of two paths, and both keep Sharek's
// layout and sender. sendEmail queues one sendSingleEmailWorkflow per email,
// each under its own id, so one email can no longer hold up another behind a
// shared workflow. sendEmailSync sends from the request: the three account
// emails take it now (PLT-2), and the queued workflow's activity ends in it.
//
// EmailService reaches Temporal for queued emails and the provider SDKs for
// direct ones; both are doubles here, so the cases can see what was sent.
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));

import type { TemporalService } from 'nestjs-temporal-core';
import type { EmailInterface } from '@gitroom/nestjs-libraries/emails/email.interface';
import { EmailService } from './email.service';
import { renderBrandedEmail } from '@gitroom/helpers/utils/email.html';

const makeService = () => {
  const start = jest.fn().mockResolvedValue({});
  const service = new EmailService({
    client: { getRawClient: () => ({ workflow: { start } }) },
  } as unknown as TemporalService);
  const send = jest.fn().mockResolvedValue({ id: 'email-1' });
  const provider: EmailInterface = {
    name: 'double',
    validateEnvKeys: [],
    sendEmail: send,
  };
  service.emailService = provider;
  return { service, start, send };
};

beforeEach(() => {
  jest.useFakeTimers();
  process.env.EMAIL_FROM_NAME = 'Sharek';
  process.env.EMAIL_FROM_ADDRESS = 'noreply@updates.sharek.app';
  process.env.FRONTEND_URL = 'https://dash.sharek.app';
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.EMAIL_FROM_NAME;
  delete process.env.EMAIL_FROM_ADDRESS;
  delete process.env.FRONTEND_URL;
});

describe('EmailService.sendEmail', () => {
  it('starts one sendSingleEmailWorkflow per email, each with its own id', async () => {
    const { service, start } = makeService();

    await service.sendEmail('a@b.c', 'Subject', '<p>Hi</p>', 'top');
    await service.sendEmail('a@b.c', 'Subject', '<p>Hi</p>', 'bottom');

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledWith('sendSingleEmailWorkflow', {
      taskQueue: 'main',
      workflowId: expect.stringMatching(/^send_email_/),
      args: [
        {
          to: 'a@b.c',
          subject: 'Subject',
          html: '<p>Hi</p>',
          replyTo: undefined,
          addTo: 'top',
        },
      ],
    });
    expect(start.mock.calls[0][1].workflowId).not.toBe(
      start.mock.calls[1][1].workflowId
    );
  });
});

describe('EmailService.sendEmailSync', () => {
  it('sends the Sharek-branded body from the configured sender', async () => {
    const { service, send } = makeService();

    await service.sendEmailSync('a@b.c', 'Subject', '<p>Hi</p>');

    expect(send).toHaveBeenCalledWith(
      'a@b.c',
      'Subject',
      renderBrandedEmail('Subject', '<p>Hi</p>', 'https://dash.sharek.app'),
      'Sharek',
      'noreply@updates.sharek.app',
      undefined
    );
  });

  it('retries a send the provider rejected, such as a rate limit', async () => {
    const { service, send } = makeService();
    send.mockRejectedValueOnce(
      new Error('rate_limit_exceeded: Too many requests')
    );

    const sent = service.sendEmailSync('a@b.c', 'Subject', '<p>Hi</p>');
    await jest.advanceTimersByTimeAsync(700);
    await sent;

    expect(send).toHaveBeenCalledTimes(2);
  });
});
