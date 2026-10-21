// sanitizePostContent lives in libraries/helpers, but this spec runs here: the
// helpers config has no DOM and stubs DOMPurify (sanitize.post.content.spec),
// while this config maps it to the browser build on happy-dom's window, so the
// real sanitizer runs. It cleans a post on save and again on the public
// preview page, which mounts the app's tooltip.
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

describe('sanitizePostContent', () => {
  // A post as it is stored today: the mention keeps its id and label.
  it("keeps the editor's markup as it is", () => {
    const post =
      '<p>Hi <span class="mention" data-mention-id="u1" data-mention-label="Sara">@Sara</span>, <strong>bold</strong> <u>under</u> <a href="https://sharek.app">link</a></p>' +
      '<h2>Title</h2><ul><li><p>item</p></li></ul><p><img src="https://media.sharek.app/a.png" alt="a"></p>';

    expect(sanitizePostContent(post)).toBe(post);
  });

  // The tooltip renders data-tooltip-html as HTML on hover.
  it('drops tooltip markup the text brings in', () => {
    const cleaned = sanitizePostContent(
      '<p><span data-tooltip-id="tooltip" data-tooltip-html="<img src=x onerror=document.title=1>">hover</span></p>'
    );

    expect(cleaned).not.toContain('data-tooltip-html');
    expect(cleaned).not.toContain('onerror');
  });
});
