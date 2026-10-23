// The real PostsService reaches Prisma, Temporal and every provider at import; only the two calls
// the tool makes are under test (same shell pattern as video.status.tool.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);

import { DeletePostTool } from '@gitroom/nestjs-libraries/chat/tools/delete.post.tool';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

const org = { id: 'org-1', name: 'Sharek' };

// checkAuth only writes to the request context when it finds an authInfo, and there is no
// async-storage context in a unit test, so the organization the tool reads back is this one.
const context = () => ({
  requestContext: new Map<string, string>([
    ['organization', JSON.stringify(org)],
  ]),
});

type BuiltTool = {
  description: string;
  mcp: { annotations: Record<string, boolean | string> };
  execute: (
    input: { id: string },
    ctx: ReturnType<typeof context>
  ) => Promise<{ output: { postId: string } | { errors: string } }>;
};

const makeTool = (rows: unknown[] = []) => {
  const posts = {
    getPostsRecursively: jest.fn().mockResolvedValue(rows),
    deletePost: jest.fn().mockResolvedValue({ id: 'post-1' }),
  };
  const tool = new DeletePostTool(
    posts as unknown as PostsService
  ).run() as unknown as BuiltTool;
  return { tool, posts };
};

describe('DeletePostTool', () => {
  // What a client tells the user before a deletion it cannot undo.
  it('says a published post stays live and names Sharek, never the upstream product', () => {
    const { description } = makeTool().tool;

    expect(description).toContain(
      'Deleting a published post only removes it from Sharek - it stays live on the social network.'
    );
    expect(description).not.toMatch(/postiz/i);
  });

  // Clients such as Claude ask before running a tool marked destructive.
  it('is marked destructive', () => {
    expect(makeTool().tool.mcp.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("deletes the asking organization's post by its group, with its comments", async () => {
    const { tool, posts } = makeTool([
      { id: 'post-1', group: 'group-1', parentPostId: null },
    ]);

    await expect(tool.execute({ id: 'post-1' }, context())).resolves.toEqual({
      output: { postId: 'post-1' },
    });
    expect(posts.getPostsRecursively).toHaveBeenCalledWith(
      'post-1',
      false,
      'org-1',
      true
    );
    expect(posts.deletePost).toHaveBeenCalledWith('org-1', 'group-1');
  });

  // A comment shares its group with the whole thread, so deleting by a
  // comment's group would delete the post it belongs to.
  it('refuses a comment id and deletes nothing', async () => {
    const { tool, posts } = makeTool([
      { id: 'comment-1', group: 'group-1', parentPostId: 'post-1' },
    ]);

    await expect(tool.execute({ id: 'comment-1' }, context())).resolves.toEqual(
      {
        output: {
          errors: 'This id belongs to a comment, pass the id of the main post',
        },
      }
    );
    expect(posts.deletePost).not.toHaveBeenCalled();
  });

  // Another organization's post is not found either: the read is scoped to org-1.
  it('answers when the post is not found, and deletes nothing', async () => {
    const { tool, posts } = makeTool([]);

    await expect(tool.execute({ id: 'post-9' }, context())).resolves.toEqual({
      output: { errors: 'Post not found' },
    });
    expect(posts.deletePost).not.toHaveBeenCalled();
  });
});
