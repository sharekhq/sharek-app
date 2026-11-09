// Nothing here reaches Tavily (same shell pattern as samy.image.tool.spec).
jest.mock('@gitroom/nestjs-libraries/tavily/tavily.service', () => ({
  TavilyService: class {},
}));

import { HttpException } from '@nestjs/common';
import { ReadWebPageTool } from '@gitroom/nestjs-libraries/chat/tools/read.web.page.tool';

const org = { id: 'org-1', name: 'Sharek' };

const pages = [
  { url: 'https://a.example/', text: 'Fees: 4,200 a term.' },
  { url: 'https://b.example/', error: 'Failed to fetch url' },
];

const LIMIT =
  "One message can make up to 5 web lookups, so this one wasn't made. Tell the user what you found so far and that you can look further if they ask.";

const FAILED =
  "The web lookup failed. Say it failed and offer to try again; don't answer from memory as if you had read it.";

const makeTool = (extract?: jest.Mock) => {
  const tavily = { extract: extract ?? jest.fn().mockResolvedValue(pages) };
  return { tool: new ReadWebPageTool(tavily as any).run() as any, tavily };
};

// checkAuth only writes to the request context when it finds an authInfo, and
// there is no async-storage context in a unit test, so the organization the tool
// reads back is the one seeded here.
const context = () =>
  ({
    requestContext: new Map<string, string>([
      ['organization', JSON.stringify(org)],
    ]),
  } as any);

const call = { urls: ['https://a.example/', 'https://b.example/'] };

describe('ReadWebPageTool', () => {
  it('goes by readWebPageTool', () => {
    const { tool } = makeTool();

    expect(new ReadWebPageTool({} as any).name).toBe('readWebPageTool');
    expect(tool.id).toBe('readWebPageTool');
  });

  it('says what it reads, what it returns, what it cuts and what it can’t read', () => {
    const { tool } = makeTool();

    expect(tool.description).toBe(
      "Read the words of up to 3 public web pages. Returns { pages }, each { url, text } or { url, error }, or { error } when nothing could be read. Text past 8,000 characters is cut, and ends with a note saying so. Pages that need a login, such as Facebook or Instagram, can't be read. Each call is one of the message's web lookups."
    );
  });

  describe('takes', () => {
    const parse = (urls: unknown) =>
      makeTool().tool.inputSchema.safeParse({ urls });

    it('one to three addresses', () => {
      expect(parse(['https://a.example/']).success).toBe(true);
      expect(
        parse(['https://a.example/', 'https://b.example/', 'http://c.example/'])
          .success
      ).toBe(true);
      expect(parse([]).success).toBe(false);
      expect(
        parse([
          'https://a.example/',
          'https://b.example/',
          'https://c.example/',
          'https://d.example/',
        ]).success
      ).toBe(false);
    });

    it('only absolute http and https addresses', () => {
      expect(parse(['http://a.example/about']).success).toBe(true);
      expect(parse(['/about']).success).toBe(false);
      expect(parse(['a.example/about']).success).toBe(false);
      expect(parse(['ftp://a.example/file.txt']).success).toBe(false);
    });
  });

  // Mastra validates the return against this schema, so without the error field
  // a failure would never reach the model.
  it('declares the pages and the error it hands back', () => {
    const { tool } = makeTool();

    expect(Object.keys(tool.outputSchema.shape).sort()).toEqual([
      'error',
      'pages',
    ]);
    expect(tool.outputSchema.safeParse({ pages }).success).toBe(true);
    expect(tool.outputSchema.safeParse({ error: 'no' }).success).toBe(true);
  });

  describe('is offered', () => {
    const saved = process.env.TAVILY_API_KEY;

    afterEach(() => {
      if (saved === undefined) {
        delete process.env.TAVILY_API_KEY;
      } else {
        process.env.TAVILY_API_KEY = saved;
      }
    });

    it('while a Tavily key is set', () => {
      process.env.TAVILY_API_KEY = 'tvly-test';

      expect(new ReadWebPageTool({} as any).available()).toBe(true);
    });

    it('not without one', () => {
      delete process.env.TAVILY_API_KEY;

      expect(new ReadWebPageTool({} as any).available()).toBe(false);
    });

    it('not with an empty one', () => {
      process.env.TAVILY_API_KEY = '';

      expect(new ReadWebPageTool({} as any).available()).toBe(false);
    });
  });

  it('reads the addresses for this organization, and returns the pages', async () => {
    const { tool, tavily } = makeTool();

    const result = await tool.execute(call, context());

    expect(tavily.extract).toHaveBeenCalledWith('org-1', call.urls);
    expect(result).toEqual({ pages });
  });

  // A throw reaches the user as raw error text, and a turn that ends without
  // content poisons the thread, so every failure is data the model can relay.
  describe('hands back, and never throws', () => {
    const errorFor = async (thrown: unknown) => {
      const { tool } = makeTool(jest.fn().mockRejectedValue(thrown));
      return tool.execute(call, context());
    };

    it("the service's own words, already written for the model", async () => {
      expect(
        await errorFor(
          new HttpException(
            'The web lookup service is busy. Say the lookup failed and offer to try again in a moment.',
            429
          )
        )
      ).toEqual({
        error:
          'The web lookup service is busy. Say the lookup failed and offer to try again in a moment.',
      });
    });

    describe('with anything else', () => {
      let logged: jest.SpyInstance;

      beforeEach(() => {
        logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      });

      afterEach(() => logged.mockRestore());

      it('general words, and the failure in the log', async () => {
        const thrown = new Error('socket hang up');

        expect(await errorFor(thrown)).toEqual({ error: FAILED });
        expect(logged).toHaveBeenCalledWith('readWebPageTool failed:', thrown);
      });

      it('the same with no organization to read', async () => {
        const { tool, tavily } = makeTool();

        const result = await tool.execute(call, {
          requestContext: new Map(),
        } as any);

        expect(result).toEqual({ error: FAILED });
        expect(tavily.extract).not.toHaveBeenCalled();
      });
    });
  });

  // Enforced rather than instructed, because the model can miss a line. Parallel
  // calls in one step and calls across steps share one request context, and each
  // POST builds a new one.
  describe('makes at most 5 web lookups in one message', () => {
    it('refuses a sixth call without reaching Tavily, and says what to tell the user', async () => {
      const { tool, tavily } = makeTool();
      const run = context();

      for (let lookup = 0; lookup < 5; lookup++) {
        expect(await tool.execute(call, run)).toEqual({ pages });
      }

      expect(await tool.execute(call, run)).toEqual({ error: LIMIT });
      expect(tavily.extract).toHaveBeenCalledTimes(5);
    });

    it('lets exactly five of six calls started together through', async () => {
      const { tool, tavily } = makeTool();
      const run = context();

      const results = await Promise.all(
        [1, 2, 3, 4, 5, 6].map(() => tool.execute(call, run))
      );

      expect(results.filter((result) => result.pages)).toHaveLength(5);
      expect(results.filter((result) => result.error === LIMIT)).toHaveLength(
        1
      );
      expect(tavily.extract).toHaveBeenCalledTimes(5);
    });

    // Unlike an image, a lookup that failed may still have spent a credit.
    it('keeps the slot of a call that failed', async () => {
      const extract = jest
        .fn()
        .mockRejectedValueOnce(
          new HttpException(
            'The web lookup took too long. Say it failed and offer to try again.',
            504
          )
        )
        .mockResolvedValue(pages);
      const { tool, tavily } = makeTool(extract);
      const run = context();

      await tool.execute(call, run);
      for (let lookup = 0; lookup < 4; lookup++) {
        expect(await tool.execute(call, run)).toEqual({ pages });
      }

      expect(await tool.execute(call, run)).toEqual({ error: LIMIT });
      expect(tavily.extract).toHaveBeenCalledTimes(5);
    });

    it('starts again on a new context, as a regenerate does', async () => {
      const { tool } = makeTool();
      const run = context();

      for (let lookup = 0; lookup < 6; lookup++) {
        await tool.execute(call, run);
      }

      expect(await tool.execute(call, context())).toEqual({ pages });
    });
  });
});
