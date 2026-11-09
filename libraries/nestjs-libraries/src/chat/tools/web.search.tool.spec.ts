// Nothing here reaches Tavily (same shell pattern as samy.image.tool.spec).
jest.mock('@gitroom/nestjs-libraries/tavily/tavily.service', () => ({
  TavilyService: class {},
}));

import { HttpException } from '@nestjs/common';
import { WebSearchTool } from '@gitroom/nestjs-libraries/chat/tools/web.search.tool';
import { ReadWebPageTool } from '@gitroom/nestjs-libraries/chat/tools/read.web.page.tool';

const org = { id: 'org-1', name: 'Sharek' };

const results = [
  {
    title: 'B.A. Design',
    url: 'https://a.example/design',
    snippet: 'Fees: 4,200 a term.',
  },
  {
    title: 'Admissions',
    url: 'https://a.example/admissions',
    snippet: 'Apply by June.',
  },
];

const LIMIT =
  "One message can make up to 5 web lookups, so this one wasn't made. Tell the user what you found so far and that you can look further if they ask.";

const FAILED =
  "The web lookup failed. Say it failed and offer to try again; don't answer from memory as if you had read it.";

const makeTool = (search?: jest.Mock) => {
  const tavily = { search: search ?? jest.fn().mockResolvedValue(results) };
  return { tool: new WebSearchTool(tavily as any).run() as any, tavily };
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

const call = { query: 'Macromedia B.A. Design fees' };

describe('WebSearchTool', () => {
  it('goes by webSearchTool', () => {
    const { tool } = makeTool();

    expect(new WebSearchTool({} as any).name).toBe('webSearchTool');
    expect(tool.id).toBe('webSearchTool');
  });

  it('says what it returns and that each call is a lookup', () => {
    const { tool } = makeTool();

    expect(tool.description).toBe(
      "Search the web. Returns up to 5 results, each { title, url, snippet }, or { error } when the search couldn't be made. Each call is one of the message's web lookups."
    );
  });

  it('takes a query of 1 to 400 characters', () => {
    const parse = (query: unknown) =>
      makeTool().tool.inputSchema.safeParse({ query });

    expect(parse('a').success).toBe(true);
    expect(parse('a'.repeat(400)).success).toBe(true);
    expect(parse('').success).toBe(false);
    expect(parse('a'.repeat(401)).success).toBe(false);
  });

  // Mastra validates the return against this schema, so without the error field
  // a failure would never reach the model.
  it('declares the results and the error it hands back', () => {
    const { tool } = makeTool();

    expect(Object.keys(tool.outputSchema.shape).sort()).toEqual([
      'error',
      'results',
    ]);
    expect(tool.outputSchema.safeParse({ results }).success).toBe(true);
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

      expect(new WebSearchTool({} as any).available()).toBe(true);
    });

    it('not without one', () => {
      delete process.env.TAVILY_API_KEY;

      expect(new WebSearchTool({} as any).available()).toBe(false);
    });

    it('not with an empty one', () => {
      process.env.TAVILY_API_KEY = '';

      expect(new WebSearchTool({} as any).available()).toBe(false);
    });
  });

  it('searches for this organization, and returns the results', async () => {
    const { tool, tavily } = makeTool();

    const result = await tool.execute(call, context());

    expect(tavily.search).toHaveBeenCalledWith('org-1', call.query);
    expect(result).toEqual({ results });
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
        expect(logged).toHaveBeenCalledWith('webSearchTool failed:', thrown);
      });

      it('the same with no organization to read', async () => {
        const { tool, tavily } = makeTool();

        const result = await tool.execute(call, {
          requestContext: new Map(),
        } as any);

        expect(result).toEqual({ error: FAILED });
        expect(tavily.search).not.toHaveBeenCalled();
      });
    });
  });

  // Searches and reads draw on one count, so a message can't make 5 of each.
  describe('shares the 5 web lookups of a message with readWebPageTool', () => {
    const lookups = async () => {
      const tavily = {
        search: jest.fn().mockResolvedValue(results),
        extract: jest
          .fn()
          .mockResolvedValue([
            { url: 'https://a.example/design', text: 'Fees: 4,200 a term.' },
          ]),
      };
      const search = new WebSearchTool(tavily as any).run() as any;
      const read = new ReadWebPageTool(tavily as any).run() as any;
      const run = context();
      const page = { urls: ['https://a.example/design'] };

      for (let lookup = 0; lookup < 3; lookup++) {
        expect((await read.execute(page, run)).pages).toHaveLength(1);
      }
      for (let lookup = 0; lookup < 2; lookup++) {
        expect(await search.execute(call, run)).toEqual({ results });
      }

      return { tavily, search, read, run, page };
    };

    it('refuses the next search without reaching Tavily', async () => {
      const { tavily, search, run } = await lookups();

      expect(await search.execute(call, run)).toEqual({ error: LIMIT });
      expect(tavily.search).toHaveBeenCalledTimes(2);
      expect(tavily.extract).toHaveBeenCalledTimes(3);
    });

    it('refuses the next read without reaching Tavily', async () => {
      const { tavily, read, run, page } = await lookups();

      expect(await read.execute(page, run)).toEqual({ error: LIMIT });
      expect(tavily.search).toHaveBeenCalledTimes(2);
      expect(tavily.extract).toHaveBeenCalledTimes(3);
    });
  });
});
