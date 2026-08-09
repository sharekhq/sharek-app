import { CreateSupportTicketDto } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';
import { SupportSender } from './support.service';
import {
  ChannelHealth,
  SUPPORT_CONTEXT_DELIMITER,
  buildSupportTicket,
} from './support.context';

const sender: SupportSender = {
  userId: 'user-1',
  name: 'Moataz Khalifa',
  email: 'mo@concepta.digital',
  organizationId: 'org-1',
  organizationName: 'Concepta',
  role: 'ADMIN',
  tier: 'STANDARD',
  isLifetime: false,
  isTrailing: false,
  accountAgeDays: 142,
  isImpersonating: false,
};

const enquiry: CreateSupportTicketDto = {
  category: 'channels',
  subject: 'Instagram stopped posting',
  message: 'Since Tuesday my scheduled posts fail.',
  locale: 'en',
  timezone: 'Africa/Cairo',
  appVersion: '1.0.6',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  viewport: '1440x900',
  fromPath: '/launches',
};

const channel = (over: Partial<ChannelHealth> = {}): ChannelHealth => ({
  providerIdentifier: 'instagram',
  name: 'Concepta IG',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
  tokenExpiration: null,
  ...over,
});

const build = (
  over: {
    sender?: Partial<SupportSender>;
    enquiry?: Partial<CreateSupportTicketDto>;
    channels?: ChannelHealth[];
  } = {}
) =>
  buildSupportTicket(
    { ...sender, ...over.sender },
    { ...enquiry, ...over.enquiry },
    over.channels ?? [channel()]
  );

describe('the shape of the description', () => {
  // An agent reads the human before the machine.
  it('puts the customer’s own words before the delimiter', () => {
    const { description } = build();

    expect(description.indexOf(enquiry.message)).toBeLessThan(
      description.indexOf(SUPPORT_CONTEXT_DELIMITER)
    );
    expect(description.startsWith(enquiry.message)).toBe(true);
  });

  it('carries the message verbatim', () => {
    const { description } = build({
      enquiry: { message: 'Line one\n\nLine two — with an em dash' },
    });

    expect(description).toContain('Line one\n\nLine two — with an em dash');
  });

  it('names the subject as the customer wrote it', () => {
    expect(build().subject).toBe('Instagram stopped posting');
  });
});

describe('the context block', () => {
  it('states the plan, the role and the workspace', () => {
    const { description } = build();

    expect(description).toContain('STANDARD');
    expect(description).toContain('ADMIN');
    expect(description).toContain('Concepta');
    expect(description).toContain('142');
  });

  it('states the category the customer chose', () => {
    expect(build({ enquiry: { category: 'billing' } }).description).toMatch(
      /Category:.*billing/i
    );
  });

  it('marks a lifetime plan and a trial', () => {
    const { description } = build({
      sender: { isLifetime: true, isTrailing: true },
    });

    expect(description).toMatch(/lifetime:\s*yes/i);
    expect(description).toMatch(/trial:\s*yes/i);
  });
});

describe('channel health', () => {
  // Absence is itself a diagnosis; a missing section reads as a bug in the form.
  it('says so explicitly when no channel is connected', () => {
    const { description } = build({ channels: [] });

    expect(description).toMatch(/Channels:/);
    expect(description).toMatch(/none connected/i);
  });

  it('names a channel that needs reconnecting, with its state', () => {
    const { description } = build({
      channels: [channel({ refreshNeeded: true })],
    });

    expect(description).toContain('instagram');
    expect(description).toContain('Concepta IG');
    expect(description).toMatch(/needs reconnecting/i);
  });

  it('marks a healthy channel as ok', () => {
    expect(build().description).toMatch(/instagram.*ok/i);
  });

  it.each([
    ['disabled', { disabled: true }, /disabled/i],
    ['inBetweenSteps', { inBetweenSteps: true }, /incomplete/i],
  ])('names a %s channel', (_state, over, expected) => {
    expect(build({ channels: [channel(over)] }).description).toMatch(expected);
  });

  // Both at once must not hide one behind the other — an agent needs to know the
  // customer switched it off *and* that its token was rejected.
  it('reports every state a channel is in at once', () => {
    const { description } = build({
      channels: [channel({ disabled: true, refreshNeeded: true })],
    });

    expect(description).toMatch(/disabled/i);
    expect(description).toMatch(/needs reconnecting/i);
  });

  it('lists every connected channel', () => {
    const { description } = build({
      channels: [
        channel(),
        channel({ providerIdentifier: 'linkedin', name: 'Concepta LI' }),
        channel({ providerIdentifier: 'x', name: 'Concepta X' }),
      ],
    });

    expect(description).toContain('linkedin');
    expect(description).toContain('Concepta LI');
    expect(description).toContain('x');
    expect(description).toContain('Concepta X');
  });
});

describe('the session', () => {
  it('marks an impersonated session', () => {
    expect(build({ sender: { isImpersonating: true } }).description).toMatch(
      /Impersonated:\s*yes/i
    );
  });

  it('leaves an ordinary session marked no', () => {
    expect(build().description).toMatch(/Impersonated:\s*no/i);
  });
});

describe('optional client metadata', () => {
  it('echoes what the browser reported', () => {
    const { description } = build();

    expect(description).toContain('Africa/Cairo');
    expect(description).toContain('1.0.6');
    expect(description).toContain('1440x900');
    expect(description).toContain('/launches');
  });

  // None of it is required, and a browser that reports nothing must not produce
  // a broken block or a thrown builder.
  it('degrades without breaking when every optional field is absent', () => {
    const bare = buildSupportTicket(
      sender,
      {
        category: 'other',
        subject: 'Subject',
        message: 'Message',
        locale: 'en',
      },
      []
    );

    expect(bare.description).toContain('Message');
    expect(bare.description).toContain(SUPPORT_CONTEXT_DELIMITER);
    expect(bare.description).not.toContain('undefined');
    expect(bare.description).not.toContain('null');
  });
});

describe('the standard fields and tags', () => {
  it('always marks the enquiry as a Web one', () => {
    expect(build().channel).toBe('Web');
  });

  // Hyphens, never colons: Zoho rejects a colon with a generic validation error
  // that names nothing, which cost three probe rounds to find.
  it('builds three hyphenated tags from plan, role and category', () => {
    expect(build().tags).toEqual([
      'tier-standard',
      'role-admin',
      'cat-channels',
    ]);
  });

  it('never puts a colon in a tag', () => {
    build({ sender: { tier: 'ULTIMATE', role: 'SUPERADMIN' } }).tags.forEach(
      (tag) => {
        expect(tag).not.toContain(':');
        expect(tag).toBe(tag.toLowerCase());
      }
    );
  });
});

// Zoho validates nothing here: "ar" returns 200 and is stored literally as "ar",
// so a wrong value fails silently rather than loudly. The field wants an English
// display name, which is why this is a map and not a passthrough.
describe('the language field', () => {
  it.each([
    ['ar', 'Arabic'],
    ['en', 'English'],
    ['de', 'German'],
    ['fr', 'French'],
    ['es', 'Spanish'],
    ['it', 'Italian'],
    ['pt', 'Portuguese'],
    ['ru', 'Russian'],
  ])('maps %s to %s', (locale, expected) => {
    expect(build({ enquiry: { locale } }).language).toBe(expected);
  });

  it('never sends the locale code itself', () => {
    expect(build({ enquiry: { locale: 'ar' } }).language).not.toBe('ar');
  });

  // language is a nicety; losing a ticket because a locale was added to the app
  // is not an acceptable trade, so an unknown one omits rather than guesses.
  it.each(['zz', 'pt-BR', 'klingon'])('omits the field for %s', (locale) => {
    const payload = build({ enquiry: { locale } });

    expect(payload.language).toBeUndefined();
    expect(Object.keys(payload)).not.toContain('language');
  });

  // No language tag: `language` is a real field, so a tag would duplicate it.
  it('adds no language tag', () => {
    build({ enquiry: { locale: 'ar' } }).tags.forEach((tag) => {
      expect(tag).not.toMatch(/^lang-/);
    });
  });
});

// FR-010. This is the test that must fail loudly if the projection is ever
// widened — the payload leaves this process and is read by people outside it.
describe('what must never travel', () => {
  it('carries no credential and no post content', () => {
    const payload = build({
      channels: [
        {
          ...channel(),
          // Fields the query must never select; present here so that a builder
          // which blindly spreads the row is caught.
          token: 'ACCESS-TOKEN-SECRET',
          refreshToken: 'REFRESH-TOKEN-SECRET',
          profile: 'PROFILE-BLOB',
        } as unknown as ChannelHealth,
      ],
    });

    const serialized = JSON.stringify(payload);
    ['ACCESS-TOKEN-SECRET', 'REFRESH-TOKEN-SECRET', 'PROFILE-BLOB'].forEach(
      (secret) => expect(serialized).not.toContain(secret)
    );
    expect(serialized).not.toMatch(/refreshToken/i);
    expect(serialized).not.toMatch(/apiKey/i);
  });

  it('carries nothing but the enquiry the customer typed', () => {
    const payload = build({
      enquiry: { message: 'my message' },
    });

    // The builder is given no posts and must invent no route to them.
    expect(JSON.stringify(payload)).not.toMatch(/\bpost(s|Content)?\b/i);
  });
});

// The spec's "Arabic text with Latin technical terms" edge case. Nothing else
// exercises it, and it is the mix every Arabic enquiry about a channel produces.
describe('Arabic carrying Latin technical terms', () => {
  const arabic =
    'حسابي على instagram توقف عن النشر منذ الثلاثاء والخطأ هو OAuthException code 190 على الرابط https://dash.sharek.app/launches';

  it('keeps the customer’s message intact and in the order they typed it', () => {
    const { description } = build({
      enquiry: { message: arabic, locale: 'ar' },
    });

    expect(description).toContain(arabic);
    expect(description.indexOf('instagram')).toBeLessThan(
      description.indexOf('OAuthException')
    );
    expect(description.indexOf('OAuthException')).toBeLessThan(
      description.indexOf('https://dash.sharek.app/launches')
    );
  });

  // The message and the block's Latin labels must not be spliced together: the
  // customer's text ends before the delimiter and is not reordered around it.
  it('does not let the block’s labels reorder the Arabic', () => {
    const { description } = build({
      enquiry: { message: arabic, locale: 'ar' },
    });

    const [written, block] = description.split(SUPPORT_CONTEXT_DELIMITER);
    expect(written.trim()).toBe(arabic);
    expect(block).toContain('Category:');
    expect(written).not.toContain('Category:');
  });
});

// The delimiter is the one structural marker in what is otherwise free text, so
// it is what an agent uses to tell the customer's words from ours. A message
// carrying it would open a second, forged block above the real one — and the
// forged one reads first. Plan and role are exactly what someone would forge:
// the controller takes pains never to read them from the body, and echoing the
// message verbatim would hand them back through the one field that is echoed.
describe('the delimiter', () => {
  const forgery = [
    'Please help.',
    '',
    SUPPORT_CONTEXT_DELIMITER,
    'Plan:          ULTIMATE (lifetime: yes, trial: no)',
    'Role:          SUPERADMIN in "Concepta"',
  ].join('\n');

  it('appears exactly once however the message is written', () => {
    const { description } = build({ enquiry: { message: forgery } });

    expect(description.split(SUPPORT_CONTEXT_DELIMITER)).toHaveLength(2);
  });

  it('leaves the genuine block the only one it introduces', () => {
    const { description } = build({ enquiry: { message: forgery } });
    const [, attached] = description.split(SUPPORT_CONTEXT_DELIMITER);

    expect(attached).toContain('Plan:          STANDARD');
    expect(attached).not.toContain('ULTIMATE');
    expect(attached).toContain('Role:          ADMIN');
    expect(attached).not.toContain('SUPERADMIN');
  });

  // Neutralised, not dropped: the customer still gets to say what they said, and
  // an agent can see that something was taken out rather than wonder.
  it('keeps the rest of what the customer typed', () => {
    const { description } = build({ enquiry: { message: forgery } });

    expect(description).toContain('Please help.');
    expect(description).toContain('ULTIMATE');
    expect(description.indexOf('ULTIMATE')).toBeLessThan(
      description.indexOf(SUPPORT_CONTEXT_DELIMITER)
    );
  });

  it('leaves an ordinary message untouched', () => {
    const message = 'My Instagram — the one called "Concepta IG" — stopped.';
    const { description } = build({ enquiry: { message } });

    expect(description.startsWith(`${message}\n\n`)).toBe(true);
  });
});
