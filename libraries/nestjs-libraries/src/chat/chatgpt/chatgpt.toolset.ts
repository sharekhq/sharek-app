export const CHATGPT_SERVER_NAME = 'Sharek';

export const CHATGPT_UPLOAD_WIDGET_URI = 'ui://sharek/upload';

export interface ChatgptToolRow {
  name: string;
  title: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  // Field descriptions by path (`a[].b`); a field not listed keeps its own.
  input?: Record<string, string>;
  output?: Record<string, string>;
  meta?: Record<string, unknown>;
  // Applied to the strings of a result or an error, after the names are renamed.
  resultRewrites?: { pattern: RegExp; replacement: string }[];
}

// One row per tool the ChatGPT connection serves, keyed by the source tool's
// name: a tool appears there only when a row names it.
export const CHATGPT_TOOLSET: Record<string, ChatgptToolRow> = {
  integrationList: {
    name: 'list_channels',
    title: 'List Channels',
    description:
      "Lists the social media channels connected in the user's Sharek account, such as Instagram, X or LinkedIn accounts and pages. Call it when the user asks which channels they have, or to get a channel's id before get_posting_rules, schedule_post or a lookup tool. Optionally lists only one brand's channels. Returns each channel's id, name, platform and picture, and the brand it belongs to.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: {
      group:
        "Optional brand id from list_brands, to list only that brand's channels",
    },
  },
  groupList: {
    name: 'list_brands',
    title: 'List Brands',
    description:
      "Lists the brands in the user's Sharek account; a brand groups the channels of one business or client. Call it when the user mentions a brand or wants to work with one brand's channels or posts. Returns each brand's id and name, which list_channels and list_posts take to filter by brand.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  integrationSchema: {
    name: 'get_posting_rules',
    title: 'Get Posting Rules',
    description:
      'Gets what a platform needs before Sharek can publish a post to it: its rules, the maximum post length, the settings a post can or must include, and the lookup tools that find the values some settings need, such as a Pinterest board. Call it for each platform a post goes to, before schedule_post or update_post_settings. Returns rules, maxLength, settings and lookups.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: {
      isPremium:
        'Whether the X account has X Premium, which allows longer posts; false when unknown or for other platforms',
    },
    output: {
      'output.tools':
        'The lookup tools that find the ids, tags and other values some settings need',
      'output.tools[].dataSchema': 'The settings this lookup finds values for',
    },
  },
  integrationSchedulePostTool: {
    name: 'schedule_post',
    title: 'Schedule Post',
    description:
      "Creates posts on the user's connected channels: saved as a draft, scheduled for a date, or published now. Call it when the user asks to draft, schedule or publish a post. Each socialPost item is one post on one channel, and its postsAndComments holds the post first and then its comments: one LinkedIn post with one comment is one socialPost item with two postsAndComments items, and 20 Facebook posts on different days are 20 socialPost items with one postsAndComments item each. Channel ids come from list_channels and each platform's settings from get_posting_rules. Returns each created post's id and a previewUrl the user can open; when validation fails it returns errors that say what to fix, and the call can be made again with corrected input. It does not change or delete existing posts.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    input: {
      socialPost: 'One item per post per channel',
      'socialPost[].integrationId': 'The channel id from list_channels',
      'socialPost[].isPremium':
        'For an X channel, whether the account has X Premium; false for other platforms',
      'socialPost[].shortLink':
        'Whether to replace the links in the post with short links; true only when the user agreed to short links',
      'socialPost[].type':
        'draft saves a draft, schedule publishes at date, now publishes right away (with the current date as date)',
      'socialPost[].postsAndComments':
        'The post first, then each comment in order',
      'socialPost[].postsAndComments[].content':
        'The text as HTML. Wrap each line in <p>. Allowed tags: h1, h2, h3, u, strong, li, ul, p (u and strong can\'t be combined), img (<img src="...">) only when the platform\'s rules from get_posting_rules say pictures go inside the content, and span only for a mention in the exact format a lookup tool returned',
      'socialPost[].postsAndComments[].attachments':
        "The media of the post: a media path from upload_media_from_url, generate_image, list_media or get_upload_status, or { path, alt?, thumbnail?, thumbnailTimestamp? } where alt is the alt text, thumbnail is the path of an uploaded JPEG or PNG used as a video's cover, and thumbnailTimestamp is the video frame to use as the cover, in milliseconds",
      'socialPost[].settings':
        'The platform settings of this post as key and value pairs; the keys come from get_posting_rules',
      'socialPost[].settings[].value':
        'The value. Where a setting is an id, pass the id a lookup tool returned, not its display label',
    },
  },
  postsListTool: {
    name: 'list_posts',
    title: 'List Posts',
    description:
      "Lists the user's posts whose publish date falls between startDate and endDate (UTC), in any state: scheduled, draft, published or failed. Call it when the user asks what is planned or published, or to find the id of a post to change or delete; for all upcoming posts, pass a wide window such as now to a year ahead. Optionally lists only one brand's posts. Returns each post's id, publish date, state, error for a failed post, content, channel and settings.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: {
      customer:
        "Optional brand id from list_brands, to list only that brand's posts",
    },
    output: {
      'output.posts[].group': "The brand of the post's channel",
      'output.posts[].integrationId': 'The channel id',
      'output.posts[].integrationName': 'The channel name',
    },
  },
  postSettingsTool: {
    name: 'update_post_settings',
    title: 'Update Post Settings',
    description:
      'Changes the platform settings of a post that is not published yet (scheduled or draft); its content and publish date stay as they are. Call it when the user wants to change a setting of an existing post, such as a Pinterest board or a TikTok privacy option. Takes the post id from list_posts and only the keys to change, which are merged into the existing settings; the keys a platform accepts come from get_posting_rules. Returns the updated post; when validation fails it returns errors that say what to fix, and the call can be made again with corrected input.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    input: {
      settings:
        'The settings keys to change and their new values, merged into the existing settings; the keys come from get_posting_rules',
      'settings[].value':
        'The new value. Where a setting is an id, pass the id a lookup tool returned, not its display label',
    },
  },
  deletePostTool: {
    name: 'delete_post',
    title: 'Delete Post',
    description:
      "Deletes one post and its comments from Sharek. Call it when the user asks to delete a post, with the post id from list_posts. A post made for several channels has a separate id on each channel, and deleting a repeating post deletes every repetition. A deleted scheduled post is not published; a deleted published post is removed from Sharek only and stays on the social network. This cannot be undone. Returns the deleted post's id, or errors that explain why it could not be deleted.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  generateImageTool: {
    name: 'generate_image',
    title: 'Generate Image',
    description:
      "Generates an image with AI from a text prompt and saves it to the user's Sharek media library, using the account's image credits. Call it when the user asks Sharek to create an image, for example for an Instagram post. Returns the image's id and path, which schedule_post can attach; returns an error when the account has no image credits left.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    input: {
      prompt: "What the image shows, in the user's words",
    },
  },
  uploadFromUrlTool: {
    name: 'upload_media_from_url',
    title: 'Upload Media From URL',
    description:
      "Uploads an image or video from a public http(s) URL to the user's Sharek media library. Call it when the user gives a link to media for a post. Returns the media's id, path and status; the path can be attached with schedule_post, or used as an <img> src in the content when the platform's rules say pictures go inside the content. Returns an error when the URL can't be fetched.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    input: {
      url: "The public http(s) URL of the image or video; a file on the user's device goes through upload_media_from_device",
    },
    resultRewrites: [
      {
        pattern: /Only public http\(s\) URLs work[\s\S]*$/,
        replacement:
          "Only public http(s) URLs work: to add a file from the user's device, use upload_media_from_device.",
      },
    ],
  },
  mediaListTool: {
    name: 'list_media',
    title: 'List Media',
    description:
      "Lists the images and videos in the user's Sharek media library, newest first, 32 per page, optionally searched by original file name. Call it when the user wants to reuse a file they uploaded before. Returns each file's id, name, path and upload date; the path can be attached with schedule_post.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  mediaStatusTool: {
    name: 'get_media_status',
    title: 'Get Media Status',
    description:
      "Checks whether a media uploaded with adjust set to true has finished adjusting to the platforms' size and format limits. Call it when the user asks whether such an upload is ready, with the id upload_media_from_url returned. Returns its status: processing while it is being adjusted, ready once the adjusted file is in place at the same path, or ready with a warning when the adjustment failed and the original file is kept. A post published while the status is processing uses the original file.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: {
      id: 'The media id upload_media_from_url returned',
    },
  },
  uploadWidgetTool: {
    name: 'upload_media_from_device',
    title: 'Upload Media From Device',
    description:
      'Shows an upload widget in the conversation, where the user adds images or videos from their own device to the Sharek media library. Call it when the user wants to attach a file from their device to a post. Returns a sessionId; the files the user uploads are reported in the conversation and can be read with get_upload_status.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    meta: { ui: { resourceUri: CHATGPT_UPLOAD_WIDGET_URI } },
  },
  uploadWidgetStatusTool: {
    name: 'get_upload_status',
    title: 'Get Upload Status',
    description:
      "Lists the files the user uploaded through the upload widget in one session, using the sessionId upload_media_from_device returned. Call it when the user says they uploaded a file, or asks about one. Returns each file's id, path and status: a ready file can be attached to a post, a processing file is still being prepared, and ready with a warning means the adjustment failed and the original file is kept. An empty list means nothing was uploaded yet.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: {
      sessionId: 'The sessionId upload_media_from_device returned',
    },
  },
  uploadWidgetTicketTool: {
    name: 'get_upload_ticket',
    title: 'Get Upload Ticket',
    description:
      'Used by the upload widget to get a short-lived upload ticket for the sessionId upload_media_from_device returned. Returns the ticket.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    input: {
      sessionId: 'The sessionId upload_media_from_device returned',
    },
  },
};
