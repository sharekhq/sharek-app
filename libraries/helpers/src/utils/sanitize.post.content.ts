import DOMPurify from 'isomorphic-dompurify';
import { parseFragment } from 'parse5';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'u',
  'a',
  'ul',
  'li',
  'h1',
  'h2',
  'h3',
  'span',
  'img',
];

const ALLOWED_ATTR = [
  'dir',
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
  'src',
  'alt',
];

// <img> keeps data: URIs whatever ALLOWED_URI_REGEXP says, so a picture
// that doesn't point to a real file is dropped
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (
    data.tagName === 'img' &&
    !/^https?:\/\//i.test((node as Element).getAttribute('src') || '')
  ) {
    node.parentNode?.removeChild(node);
  }
});

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
    // only the data-* attributes named above: the app's tooltip renders
    // data-tooltip-html as HTML. Named ones are then checked against
    // ALLOWED_URI_REGEXP, which only a link passes, unless marked safe here
    ALLOW_DATA_ATTR: false,
    ADD_URI_SAFE_ATTR: ['data-mention-id', 'data-mention-label'],
  });
};

// The editor's previews and Samy's chat build HTML around text that is not
// markup (a preview decodes the post's entities to show it as the network
// will). Their own wrappers survive; anything the text brings in does not.
export const sanitizeDisplayHtml = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [...ALLOWED_TAGS, 'mark', 'div', 'video', 'source'],
    ALLOWED_ATTR: [
      ...ALLOWED_ATTR,
      'style',
      'controls',
      'type',
      'data-tooltip-id',
      'data-tooltip-content',
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
    ALLOW_DATA_ATTR: false,
    ADD_URI_SAFE_ATTR: [
      'dir',
      'type',
      'data-mention-id',
      'data-mention-label',
      'data-tooltip-id',
      'data-tooltip-content',
    ],
  });
};

// The plain text a reviewer sees for a post item: the text nodes of the
// sanitised HTML, in order, entities decoded. This is what anchor offsets
// index into on both the frontend (element.textContent) and the backend.
export const postContentPlainText = (value: unknown): string => {
  const walk = (nodes: any[]): string =>
    nodes
      .map((node) =>
        node.nodeName === '#text' ? node.value : walk(node.childNodes || [])
      )
      .join('');

  return walk(parseFragment(sanitizePostContent(value)).childNodes as any[]);
};
