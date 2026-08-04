import { SubscriptionExceptionFilter } from './subscription.exception';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from './permission.exception.class';

process.env.FRONTEND_URL = 'https://dash.sharek.app';

// The sections a @CheckPolicies or a MediaService throw can actually reach
// (research R1), with the message each produces today. The strings are copied
// verbatim on purpose: non-browser clients read them, so a reword must fail here.
const REACHABLE: { section: Sections; message?: string }[] = [
  {
    section: Sections.POSTS_PER_MONTH,
    message:
      'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.',
  },
  {
    section: Sections.CHANNEL,
    message:
      'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.',
  },
  {
    section: Sections.WEBHOOKS,
    message:
      'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.',
  },
  {
    section: Sections.VIDEOS_PER_MONTH,
    message:
      'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.',
  },
  {
    section: Sections.IMAGES_PER_MONTH,
    message:
      'You have reached the maximum number of generated images for your subscription. Please upgrade your subscription to generate more images.',
  },
  // No case in the message function — pre-existing, and the browser no longer
  // depends on it.
  { section: Sections.AI },
  { section: Sections.TEAM_MEMBERS },
  { section: Sections.ADMIN },
];

const caught = (payload: {
  section: Sections;
  action?: AuthorizationActions;
  resetsAt?: string;
}) => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as any;

  new SubscriptionExceptionFilter().catch(
    new SubscriptionException({
      action: AuthorizationActions.Create,
      ...payload,
    }),
    host
  );

  return { status, body: json.mock.calls[0][0] };
};

describe('SubscriptionExceptionFilter', () => {
  it.each(REACHABLE)('names the section for $section', ({ section }) => {
    expect(caught({ section }).body.section).toBe(section);
  });

  it.each(REACHABLE)('keeps the message for $section', ({ section, message }) => {
    expect(caught({ section }).body.message).toBe(message);
  });

  it('answers 402 at the billing url', () => {
    const { status, body } = caught({ section: Sections.CHANNEL });

    expect(status).toHaveBeenCalledWith(402);
    expect(body.statusCode).toBe(402);
    expect(body.url).toBe('https://dash.sharek.app/billing');
  });

  it('passes a reset date through', () => {
    const { body } = caught({
      section: Sections.VIDEOS_PER_MONTH,
      resetsAt: '2026-09-12T08:31:04.000Z',
    });

    expect(body.resetsAt).toBe('2026-09-12T08:31:04.000Z');
  });

  it('omits the reset date rather than sending null when it has none', () => {
    const { body } = caught({ section: Sections.CHANNEL });

    // Asserted on the serialized body, which is what the client actually reads.
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('resetsAt');
  });
});
