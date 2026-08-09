import { HttpException } from '@nestjs/common';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { CreateSupportTicketDto } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';
import { SupportSender, SupportService } from './support.service';

// The one global key the access token is cached under — the credential belongs to
// the application, not to a user (research R3). MockRedis takes over whenever
// REDIS_URL is unset, so these tests exercise the caching path without a live Redis.
const TOKEN_CACHE_KEY = 'support:zoho:access-token';

const tokenResponse = (accessToken: string, expiresIn = 3600) => ({
  ok: true,
  status: 200,
  json: async () => ({
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: 'Bearer',
  }),
  text: async () => '',
});

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// What `fetch` really hands back for an empty body: `ok` is true, and `json()`
// rejects rather than resolving to null.
const noContentResponse = () => ({
  ok: true,
  status: 204,
  json: async () => {
    throw new SyntaxError('Unexpected end of JSON input');
  },
  text: async () => '',
});

const errorResponse = (status: number, body = 'rejected') => ({
  ok: false,
  status,
  json: async () => ({ message: body }),
  text: async () => body,
});

const fetchMock = jest.fn();
const findMany = jest.fn();
let service: SupportService;

beforeEach(async () => {
  fetchMock.mockReset();
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  global.fetch = fetchMock as unknown as typeof fetch;

  process.env.ZOHO_DESK_DC = 'com';
  process.env.ZOHO_DESK_ORG_ID = 'org-123';
  process.env.ZOHO_DESK_DEPARTMENT_ID = 'dept-456';
  process.env.ZOHO_DESK_CLIENT_ID = 'client-id';
  process.env.ZOHO_DESK_CLIENT_SECRET = 'client-secret';
  process.env.ZOHO_DESK_REFRESH_TOKEN = 'refresh-token';

  // MockRedis is a module-level singleton and nothing in it expires, so one
  // test's cached token would be a cache hit in the next and one test's filed
  // enquiries would count against the next one's allowance.
  await ioRedis.flushall();

  service = new SupportService({
    model: { integration: { findMany } },
  } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.ZOHO_DESK_DC;
  delete process.env.ZOHO_DESK_ORG_ID;
  delete process.env.ZOHO_DESK_DEPARTMENT_ID;
  delete process.env.ZOHO_DESK_CLIENT_ID;
  delete process.env.ZOHO_DESK_CLIENT_SECRET;
  delete process.env.ZOHO_DESK_REFRESH_TOKEN;
});

describe('SupportService — OAuth layer', () => {
  it('derives both base URLs from ZOHO_DESK_DC', async () => {
    process.env.ZOHO_DESK_DC = 'eu';
    fetchMock
      .mockResolvedValueOnce(tokenResponse('atk_1'))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    await service.deskRequest('/contacts/search?email=a@b.com');

    const [tokenUrl] = fetchMock.mock.calls[0];
    const [apiUrl] = fetchMock.mock.calls[1];
    expect(tokenUrl).toContain('https://accounts.zoho.eu/oauth/v2/token');
    expect(apiUrl).toBe(
      'https://desk.zoho.eu/api/v1/contacts/search?email=a@b.com'
    );
  });

  it('mints an access token on a cache miss and sends it on the API call', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('atk_1'))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-1' }] }));

    const result = await service.deskRequest<{ data: { id: string }[] }>(
      '/contacts/search?email=a@b.com'
    );

    expect(result.data[0].id).toBe('contact-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenInit.method).toBe('POST');
    expect(tokenUrl).toContain('grant_type=refresh_token');
    expect(tokenUrl).toContain('refresh_token=refresh-token');
    expect(tokenUrl).toContain('client_id=client-id');
    expect(tokenUrl).toContain('client_secret=client-secret');

    const [, apiInit] = fetchMock.mock.calls[1];
    expect(apiInit.headers.Authorization).toBe('Zoho-oauthtoken atk_1');
    expect(apiInit.headers.orgId).toBe('org-123');

    await expect(ioRedis.get(TOKEN_CACHE_KEY)).resolves.toBe('atk_1');
  });

  it('caches the token below its stated lifetime', async () => {
    const setSpy = jest.spyOn(ioRedis, 'set');
    fetchMock
      .mockResolvedValueOnce(tokenResponse('atk_1', 3600))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    await service.deskRequest('/contacts/search?email=a@b.com');

    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, value, mode, ttl] = setSpy.mock.calls[0];
    expect(key).toBe(TOKEN_CACHE_KEY);
    expect(value).toBe('atk_1');
    expect(mode).toBe('EX');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThan(3600);
  });

  it('reuses a cached token instead of minting a second one', async () => {
    await ioRedis.set(TOKEN_CACHE_KEY, 'atk_cached', 'EX', 3300);
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await service.deskRequest('/contacts/search?email=a@b.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://desk.zoho.com/api/v1');
    expect(init.headers.Authorization).toBe('Zoho-oauthtoken atk_cached');
  });

  it('discards the cached token and retries exactly once when the API rejects it', async () => {
    await ioRedis.set(TOKEN_CACHE_KEY, 'atk_stale', 'EX', 3300);
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, 'invalid oauth token'))
      .mockResolvedValueOnce(tokenResponse('atk_fresh'))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-1' }] }));

    const result = await service.deskRequest<{ data: { id: string }[] }>(
      '/contacts/search?email=a@b.com'
    );

    expect(result.data[0].id).toBe('contact-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, staleInit] = fetchMock.mock.calls[0];
    expect(staleInit.headers.Authorization).toBe('Zoho-oauthtoken atk_stale');
    const [, retriedInit] = fetchMock.mock.calls[2];
    expect(retriedInit.headers.Authorization).toBe('Zoho-oauthtoken atk_fresh');

    await expect(ioRedis.get(TOKEN_CACHE_KEY)).resolves.toBe('atk_fresh');
  });

  it('gives up after a single retry when the API rejects the fresh token too', async () => {
    await ioRedis.set(TOKEN_CACHE_KEY, 'atk_stale', 'EX', 3300);
    fetchMock
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(tokenResponse('atk_fresh'))
      .mockResolvedValueOnce(errorResponse(401));

    await expect(
      service.deskRequest('/contacts/search?email=a@b.com')
    ).rejects.toBeInstanceOf(HttpException);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry when the token exchange itself is rejected', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'invalid_client'));

    await expect(
      service.deskRequest('/contacts/search?email=a@b.com')
    ).rejects.toBeInstanceOf(HttpException);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects rather than caching nothing when the exchange returns no access token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_code' }));

    await expect(
      service.deskRequest('/contacts/search?email=a@b.com')
    ).rejects.toBeInstanceOf(HttpException);

    await expect(ioRedis.get(TOKEN_CACHE_KEY)).resolves.toBeFalsy();
  });
});

describe('SupportService — contact resolution and ticket creation', () => {
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
    locale: 'ar',
  };

  // Every test here is about the contact/ticket chain, not about minting, so the
  // token is already cached and fetch call 0 is the contact search.
  beforeEach(async () => {
    await ioRedis.set(TOKEN_CACHE_KEY, 'atk_cached', 'EX', 3300);
  });

  const callsTo = (fragment: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

  it('reuses an existing contact instead of creating a duplicate', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '110', id: 'zzz' }));

    await service.createTicket(sender, enquiry);

    const [searchUrl] = fetchMock.mock.calls[0];
    expect(String(searchUrl)).toContain('/contacts/search?email=');
    expect(String(searchUrl)).toContain(encodeURIComponent(sender.email));

    // Contacts are not unique by email in Zoho, so creating one per submission
    // would scatter a customer's history across duplicates (research R1).
    expect(
      callsTo('/contacts').filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(0);

    const [, ticketInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(ticketInit.body).contactId).toBe('contact-9');
  });

  it('creates a contact when the search comes back empty and uses the new id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '111' }));

    await service.createTicket(sender, enquiry);

    // search, create contact, create ticket, then the best-effort tag and
    // context calls
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [createUrl, createInit] = fetchMock.mock.calls[1];
    expect(String(createUrl)).toContain('/contacts');
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(createInit.body).email).toBe(sender.email);

    const [, ticketInit] = fetchMock.mock.calls[2];
    expect(JSON.parse(ticketInit.body).contactId).toBe('contact-new');
  });

  // Sharek stores one `name`; Zoho requires `lastName`. A name is not always
  // "first last" — this is a storage requirement of the destination, never shown
  // back to the customer.
  it.each([
    ['Moataz Khalifa', 'Moataz', 'Khalifa'],
    ['Ada Lovelace King', 'Ada', 'Lovelace King'],
  ])('splits %s across firstName and lastName', async (name, first, last) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '111' }));

    await service.createTicket({ ...sender, name }, enquiry);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.firstName).toBe(first);
    expect(body.lastName).toBe(last);
  });

  it('puts a single-word name in lastName, the field Zoho requires', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '111' }));

    await service.createTicket({ ...sender, name: 'Moataz' }, enquiry);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.lastName).toBe('Moataz');
    expect(body.firstName).toBeFalsy();
  });

  // `User.name` is nullable and the signup path never writes it, so this is the
  // state nearly every account is in rather than a rare first enquiry. Zoho
  // requires `lastName` to be filled, and whatever goes there is read back out
  // as `${Cases.Contact Name}` by every notification template Desk sends — so
  // the whole address there greets the customer with their own email.
  describe('an account with no display name', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['blank', '   '],
      ['empty', ''],
    ])(
      'files the contact under the local part when the name is %s',
      async (_label, name) => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ data: [] }))
          .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
          .mockResolvedValueOnce(jsonResponse({ ticketNumber: '113' }));

        await service.createTicket(
          { ...sender, name: name as unknown as string },
          enquiry
        );

        const body = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(body.lastName).toBe('mo');
        // The domain is never part of the name, and the address still travels in
        // the field that is actually for it.
        expect(body.lastName).not.toContain('@');
        expect(body.email).toBe(sender.email);
      }
    );

    // Deriving a plausible human name out of an address is guesswork the rest of
    // this file refuses — an unmapped locale omits the language rather than
    // inventing one. The local part goes across as it was written.
    it.each([
      ['moataz.khalifa@concepta.digital', 'moataz.khalifa'],
      ['mo+support@concepta.digital', 'mo+support'],
    ])('carries %s across untouched', async (email, expected) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
        .mockResolvedValueOnce(jsonResponse({ ticketNumber: '113' }));

      await service.createTicket({ ...sender, name: null, email }, enquiry);

      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.lastName).toBe(expected);
      expect(body.email).toBe(email);
    });

    it('still returns the reference rather than throwing', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
        .mockResolvedValueOnce(jsonResponse({ ticketNumber: '113' }));

      await expect(
        service.createTicket(
          { ...sender, name: null as unknown as string },
          enquiry
        )
      ).resolves.toBe('113');
    });
  });

  // Zoho answers a search that matched nothing with 204 and an empty body.
  // `response.ok` is true for it, so parsing unconditionally throws a
  // SyntaxError — a plain Error, which escapes the 503 mapping as an opaque 500
  // for every first-time sender. This is the one branch T001 never observed.
  it('reads a 204 from the contact search as no contact rather than crashing', async () => {
    fetchMock
      .mockResolvedValueOnce(noContentResponse())
      .mockResolvedValueOnce(jsonResponse({ id: 'contact-new' }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '114' }));

    await expect(service.createTicket(sender, enquiry)).resolves.toBe('114');

    const [, createInit] = fetchMock.mock.calls[1];
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).contactId).toBe(
      'contact-new'
    );
  });

  // Omitting `channel` does not leave the field blank — Zoho defaults it to
  // "Phone" and files every web enquiry in the queue as a phone call.
  it('always marks the ticket as a Web enquiry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '110' }));

    await service.createTicket(sender, enquiry);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.channel).toBe('Web');
  });

  it('sends the subject, the message and the configured department', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '110' }));

    await service.createTicket(sender, enquiry);

    const [ticketUrl, ticketInit] = fetchMock.mock.calls[1];
    expect(String(ticketUrl)).toContain('/tickets');
    expect(ticketInit.method).toBe('POST');
    const body = JSON.parse(ticketInit.body);
    expect(body.subject).toBe(enquiry.subject);
    expect(body.description).toContain(enquiry.message);
    expect(body.departmentId).toBe('dept-456');
  });

  // ticketNumber is the short sequential reference the customer is shown and the
  // acknowledgement email carries; `id` is an internal record id they never see.
  // The last two calls, and the only ones allowed to fail. They run after the
  // ticket exists, so the customer already has their reference — no enquiry may
  // fail because a label or a comment did not stick. They also run together, so
  // neither is at a fixed index and both are found by their URL.
  describe('the tags', () => {
    const createAndTag = async (tagResponse: unknown) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
        .mockResolvedValueOnce(
          jsonResponse({ ticketNumber: '110', id: 'ticket-internal-1' })
        )
        .mockResolvedValueOnce(tagResponse)
        .mockResolvedValueOnce(jsonResponse({ id: 'comment-1' }));

      return service.createTicket(sender, enquiry);
    };

    it('attaches them after the ticket exists, against its internal id', async () => {
      await createAndTag(jsonResponse({ data: [] }));

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const [url, init] = callsTo('/associateTag')[0];
      expect(String(url)).toContain('/tickets/ticket-internal-1/associateTag');
      expect(init.method).toBe('POST');
    });

    // Hyphens, never colons: a colon returns a 422 that names nothing.
    it('sends hyphenated names in a tags envelope', async () => {
      await createAndTag(jsonResponse({ data: [] }));

      const body = JSON.parse(callsTo('/associateTag')[0][1].body);
      expect(body).toEqual({
        tags: ['tier-standard', 'role-admin', 'cat-channels'],
      });
    });

    it('still returns the reference when the tag call is rejected', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        createAndTag(errorResponse(422, 'data is invalid'))
      ).resolves.toBe('110');

      expect(logged).toHaveBeenCalled();
      logged.mockRestore();
    });

    it('still returns the reference when the tag call never answers', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
        .mockResolvedValueOnce(
          jsonResponse({ ticketNumber: '110', id: 'ticket-internal-1' })
        )
        .mockRejectedValueOnce(new Error('socket hang up'));

      await expect(service.createTicket(sender, enquiry)).resolves.toBe('110');
      logged.mockRestore();
    });

    it('does not retry a failed tag call', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createAndTag(errorResponse(422));

      expect(callsTo('/associateTag')).toHaveLength(1);
      logged.mockRestore();
    });
  });

  // The diagnostics live here rather than in the description because Desk quotes
  // the description into every reply — anything left there is read back to the
  // customer under our signature.
  describe('the context comment', () => {
    const createWithComment = async (commentResponse: unknown) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
        .mockResolvedValueOnce(
          jsonResponse({ ticketNumber: '110', id: 'ticket-internal-1' })
        )
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockResolvedValueOnce(commentResponse);

      return service.createTicket(sender, enquiry);
    };

    it('posts against the ticket that was just created', async () => {
      await createWithComment(jsonResponse({ id: 'comment-1' }));

      const [url, init] = callsTo('/comments')[0];
      expect(String(url)).toContain('/tickets/ticket-internal-1/comments');
      expect(init.method).toBe('POST');
    });

    // isPublic can only be set as the comment is made, so getting it wrong here
    // cannot be corrected afterwards — it would already have been sent.
    it('is private, so it is never quoted back to the customer', async () => {
      await createWithComment(jsonResponse({ id: 'comment-1' }));

      expect(JSON.parse(callsTo('/comments')[0][1].body).isPublic).toBe(false);
    });

    it('sends the block as html, with the empty attachment list the schema demands', async () => {
      await createWithComment(jsonResponse({ id: 'comment-1' }));

      const body = JSON.parse(callsTo('/comments')[0][1].body);
      expect(body.contentType).toBe('html');
      expect(body.attachmentIds).toEqual([]);
      expect(body.content).toContain('<pre>');
      expect(body.content).toContain('Category:');
    });

    // The two fields must not be confused for one another in either direction.
    it('carries the context here and the message in the description', async () => {
      await createWithComment(jsonResponse({ id: 'comment-1' }));

      const comment = JSON.parse(callsTo('/comments')[0][1].body);
      const ticket = JSON.parse(callsTo('/tickets')[0][1].body);

      expect(comment.content).not.toContain(enquiry.message);
      expect(ticket.description).toBe(enquiry.message);
      expect(ticket.description).not.toContain('Category:');
    });

    it('still returns the reference when the comment is rejected', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        createWithComment(errorResponse(422, 'data is invalid'))
      ).resolves.toBe('110');

      expect(logged).toHaveBeenCalled();
      logged.mockRestore();
    });

    it('still returns the reference when the comment never answers', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
        .mockResolvedValueOnce(
          jsonResponse({ ticketNumber: '110', id: 'ticket-internal-1' })
        )
        .mockResolvedValueOnce(jsonResponse({ data: [] }))
        .mockRejectedValueOnce(new Error('socket hang up'));

      await expect(service.createTicket(sender, enquiry)).resolves.toBe('110');
      logged.mockRestore();
    });

    it('does not retry a failed comment', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

      await createWithComment(errorResponse(422));

      expect(callsTo('/comments')).toHaveLength(1);
      logged.mockRestore();
    });
  });

  describe('the language field on create', () => {
    const createWith = async (locale: string) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
        .mockResolvedValueOnce(jsonResponse({ ticketNumber: '110' }));

      await service.createTicket(sender, { ...enquiry, locale });
      return JSON.parse(fetchMock.mock.calls[1][1].body);
    };

    it('sends the English display name, not the locale code', async () => {
      expect((await createWith('ar')).language).toBe('Arabic');
    });

    it('omits the field entirely for a locale it cannot name', async () => {
      const body = await createWith('zz');

      expect(body.language).toBeUndefined();
      expect(Object.keys(body)).not.toContain('language');
    });
  });

  // support.context.spec asserts the built payload holds no secret. This asserts
  // the layer where a widened `select` would actually pull one into memory — and
  // from there into any log that ever prints the row.
  describe('the channel-health query', () => {
    const queryFor = async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
        .mockResolvedValueOnce(jsonResponse({ ticketNumber: '110' }));

      await service.createTicket(sender, enquiry);
      return findMany.mock.calls[0][0];
    };

    it('projects only the six fields that are safe to send', async () => {
      const { select } = await queryFor();

      expect(Object.keys(select).sort()).toEqual([
        'disabled',
        'inBetweenSteps',
        'name',
        'providerIdentifier',
        'refreshNeeded',
        'tokenExpiration',
      ]);
    });

    it.each(['token', 'refreshToken', 'profile'])(
      'never selects %s',
      async (field) => {
        const { select } = await queryFor();

        expect(select[field]).toBeUndefined();
      }
    );

    it('reads only the active organisation’s channels', async () => {
      const { where } = await queryFor();

      expect(where.organizationId).toBe(sender.organizationId);
    });
  });

  it('returns the ticket number, not the internal record id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ ticketNumber: '110', id: '1413305000000456001' })
      );

    await expect(service.createTicket(sender, enquiry)).resolves.toBe('110');
  });
});

// Every outbound failure has to reach the controller as an HttpException
// carrying 503. A bare Error surfaces to the customer as an opaque 500, which is
// the dead end US3 exists to prevent — the banner naming a way out never renders.
describe('SupportService — the failure taxonomy', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  const rejectedStatus = async (call: Promise<unknown>) => {
    const error = await call.then(
      () => null,
      (thrown) => thrown
    );

    expect(error).toBeInstanceOf(HttpException);
    return (error as HttpException).getStatus();
  };

  const withCachedToken = () =>
    ioRedis.set(TOKEN_CACHE_KEY, 'atk_cached', 'EX', 3300);

  const said = () => logged.mock.calls.flat().join(' ');

  it('maps a refused token exchange to 503', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'invalid_client'));

    await expect(rejectedStatus(service.deskRequest('/tickets'))).resolves.toBe(
      503
    );
  });

  // A revoked refresh token or a mismatched region needs an operator, and
  // nothing else in the chain says so.
  it('logs what the token endpoint said when it refuses', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'invalid_client'));

    await rejectedStatus(service.deskRequest('/tickets'));

    expect(said()).toContain('invalid_client');
  });

  it('maps an unreachable token endpoint to 503, not a bare Error', async () => {
    fetchMock.mockRejectedValueOnce(
      new Error('getaddrinfo ENOTFOUND accounts.zoho.com')
    );

    await expect(rejectedStatus(service.deskRequest('/tickets'))).resolves.toBe(
      503
    );
  });

  // One status for every outbound failure, because the customer's options are
  // identical in all of them: try again, or email us. The distinction is for the
  // logs, not for them.
  it.each([422, 429, 500])(
    'maps a %s from the help desk to 503',
    async (status) => {
      await withCachedToken();
      fetchMock.mockResolvedValueOnce(errorResponse(status));

      await expect(
        rejectedStatus(service.deskRequest('/tickets'))
      ).resolves.toBe(503);
    }
  );

  it('maps a token still refused after its single retry to 503', async () => {
    await withCachedToken();
    fetchMock
      .mockResolvedValueOnce(errorResponse(401))
      .mockResolvedValueOnce(tokenResponse('atk_fresh'))
      .mockResolvedValueOnce(errorResponse(401));

    await expect(rejectedStatus(service.deskRequest('/tickets'))).resolves.toBe(
      503
    );
  });

  it('maps a timed-out call to 503, not a bare Error', async () => {
    await withCachedToken();
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(timeout);

    await expect(rejectedStatus(service.deskRequest('/tickets'))).resolves.toBe(
      503
    );
  });

  it('maps a dropped connection to 503', async () => {
    await withCachedToken();
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(rejectedStatus(service.deskRequest('/tickets'))).resolves.toBe(
      503
    );
  });

  // Nothing else bounds a call that never answers, and the customer is sitting
  // in front of the form waiting for it.
  it('bounds every outbound call with an abort signal', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('atk_1'))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    await service.deskRequest('/contacts/search?email=a@b.com');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mock.calls.forEach(([, init]) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  // Both times Zoho rejected a payload during verification the message named the
  // offending parameter exactly — the difference between a silent failure and a
  // five-minute fix.
  it('logs what the help desk said when it rejects the payload', async () => {
    await withCachedToken();
    fetchMock.mockResolvedValueOnce(
      errorResponse(422, "extra parameter 'tagNames'")
    );

    await rejectedStatus(service.deskRequest('/tickets'));

    expect(said()).toContain("extra parameter 'tagNames'");
  });

  // A retry the customer waits through only lengthens the failure; the stale
  // token is the one case where retrying is cheaper than failing.
  it('retries nothing but a stale token', async () => {
    await withCachedToken();
    fetchMock.mockResolvedValueOnce(errorResponse(422));

    await rejectedStatus(service.deskRequest('/tickets'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// FR-015 bounds what reaches the support queue: "no more than 5 enquiries per
// hour", against a customer or a stuck button flooding it. Only a ticket that
// was created ever reaches the queue, so a send that failed must not spend the
// allowance — otherwise one outage costs a customer their whole hour while they
// do exactly what the failure banner told them to and try again.
describe('SupportService — the enquiry allowance', () => {
  const sender: SupportSender = {
    userId: 'user-1',
    name: 'Moataz Khalifa',
    email: 'mo@concepta.digital',
    organizationId: 'org-rate',
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
  };

  const succeeds = () =>
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'contact-9' }] }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: '120', id: 'zzz' }))
      .mockResolvedValueOnce(jsonResponse({}));

  const fileOne = async () => {
    succeeds();
    return service.createTicket(sender, enquiry);
  };

  beforeEach(async () => {
    await ioRedis.set(TOKEN_CACHE_KEY, 'atk_cached', 'EX', 3300);
  });

  it('lets five enquiries through in the same hour', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(fileOne()).resolves.toBe('120');
    }
  });

  it('refuses the sixth with 429 rather than filing it', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await fileOne();
    }

    const before = fetchMock.mock.calls.length;
    await expect(service.createTicket(sender, enquiry)).rejects.toMatchObject({
      status: 429,
    });

    // Refused before any outbound call, not after filing a sixth ticket.
    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it('does not spend the allowance on a send that failed', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      fetchMock.mockResolvedValueOnce(errorResponse(503, 'Zoho is down'));
      await expect(
        service.createTicket(sender, enquiry)
      ).rejects.toBeInstanceOf(HttpException);
    }

    // The help desk comes back; the customer retries the message still sitting
    // in their form. Five failures must not have cost them the hour.
    await expect(fileOne()).resolves.toBe('120');
  });

  // The counter is written once the ticket exists, so a throw here would report
  // a failure for an enquiry that was filed and send the customer to retry into
  // a duplicate.
  it('still returns the reference when the count cannot be written', async () => {
    jest
      .spyOn(ioRedis, 'incr')
      .mockRejectedValueOnce(new Error('redis is unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(fileOne()).resolves.toBe('120');
  });

  it('counts each organisation separately', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await fileOne();
    }

    succeeds();
    await expect(
      service.createTicket({ ...sender, organizationId: 'org-other' }, enquiry)
    ).resolves.toBe('120');
  });
});
