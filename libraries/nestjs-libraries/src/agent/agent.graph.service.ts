import { Injectable } from '@nestjs/common';
import {
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { TavilySearch } from '@langchain/tavily';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import dayjs from 'dayjs';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { z } from 'zod';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { Organization } from '@prisma/client';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const tools = !process.env.TAVILY_API_KEY
  ? []
  : [new TavilySearch({ maxResults: 3 })];
const toolNode = new ToolNode(tools);

// Effort must stay 'none'. This graph binds Tavily tools, and OpenAI refuses
// function tools on /v1/chat/completions at any other effort — so quality
// cannot be bought here by raising it without moving to the Responses API.
// `temperature` is deliberately absent: gpt-5.x accepts only the default, and
// @langchain/openai forwards the field rather than stripping it.
const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
  model: 'gpt-5.6-luna',
  reasoning: { effort: 'none' },
});

interface WorkflowChannelsState {
  messages: BaseMessage[];
  orgId: string;
  question: string;
  hook?: string;
  fresearch?: string;
  category?: string;
  topic?: string;
  date?: string;
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long';
  tone: 'personal' | 'company';
  content?: {
    content: string;
    website?: string;
    prompt?: string;
    image?: string;
  }[];
  isPicture?: boolean;
  // Set when at least one item's picture was refused for lack of credits. Rides
  // the final payload to the client, which turns it into the notice explaining
  // why the posts arrived without images.
  imagesSkipped?: boolean;
  popularPosts?: { content: string; hook: string }[];
}

const category = z.object({
  category: z.string().describe('The category for the post'),
});

const topic = z.object({
  topic: z.string().describe('The topic for the post'),
});

const hook = z.object({
  hook: z
    .string()
    .describe(
      'Hook for the new post, don\'t take it from "the request of the user"'
    ),
});

const contentZod = (
  isPicture: boolean,
  format: 'one_short' | 'one_long' | 'thread_short' | 'thread_long'
) => {
  const content = z.object({
    content: z.string().describe('Content for the new post'),
    website: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Website for the new post if exists, If one of the post present a brand, website link must be to the root domain of the brand or don't include it, website url should contain the brand name"
      ),
    ...(isPicture
      ? {
          prompt: z
            .string()
            .describe(
              "Prompt to generate a picture for this post later, make sure it doesn't contain brand names and make it very descriptive in terms of style"
            ),
        }
      : {}),
  });

  return z.object({
    content:
      format === 'one_short' || format === 'one_long'
        ? content
        : z.array(content).min(2).describe(`Content for the new post`),
  });
};

@Injectable()
export class AgentGraphService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _postsService: PostsService,
    private _mediaService: MediaService
  ) {}
  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: () => [],
        },
        fresearch: null,
        format: null,
        tone: null,
        question: null,
        orgId: null,
        hook: null,
        content: null,
        date: null,
        category: null,
        popularPosts: null,
        topic: null,
        isPicture: null,
        imagesSkipped: null,
      },
    });

  async startCall(state: WorkflowChannelsState) {
    const runTools = model.bindTools(tools);
    const response = await ChatPromptTemplate.fromTemplate(
      `
    Today is ${dayjs().format()}, You are an assistant that gets a social media post or requests for a social media post.
    You research should be on the most possible recent data.
    You concat the text of the request together with an internet research based on the text.
    {text}
    `
    )
      .pipe(runTools)
      .invoke({
        text: state.messages[state.messages.length - 1].content,
      });

    return { messages: [response] };
  }

  async saveResearch(state: WorkflowChannelsState) {
    const content = state.messages.filter((f) => f instanceof ToolMessage);
    return { fresearch: content };
  }

  async findCategories(state: WorkflowChannelsState) {
    const allCategories = await this._postsService.findAllExistingCategories();
    const structuredOutput = model.withStructuredOutput(category);
    const { category: outputCategory } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets a text that will be later summarized into a social media post
        and classify it to one of the following categories: {categories}
        text: {text}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        categories: allCategories.map((p) => p.category).join(', '),
        text: state.fresearch,
      });

    return {
      category: outputCategory,
    };
  }

  async findTopic(state: WorkflowChannelsState) {
    const allTopics = await this._postsService.findAllExistingTopicsOfCategory(
      state?.category!
    );
    if (allTopics.length === 0) {
      return { topic: null };
    }

    const structuredOutput = model.withStructuredOutput(topic);
    const { topic: outputTopic } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets a text that will be later summarized into a social media post
        and classify it to one of the following topics: {topics}
        text: {text}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        topics: allTopics.map((p) => p.topic).join(', '),
        text: state.fresearch,
      });

    return {
      topic: outputTopic,
    };
  }

  async findPopularPosts(state: WorkflowChannelsState) {
    const popularPosts = await this._postsService.findPopularPosts(
      state.category!,
      state.topic
    );
    return { popularPosts };
  }

  async generateHook(state: WorkflowChannelsState) {
    const structuredOutput = model.withStructuredOutput(hook);
    const { hook: outputHook } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets content for a social media post, and generate only the hook.
        The hook is the 1-2 sentences of the post that will be used to grab the attention of the reader.
        You will be provided existing hooks you should use as inspiration.
        - Avoid weird hook that starts with "Discover the secret...", "The best...", "The most...", "The top..."
        - Make sure it sounds ${state.tone}
        - Use ${state.tone === 'personal' ? '1st' : '3rd'} person mode
        - Make sure it's engaging
        - Don't be cringy
        - Write in the same language as the user's request
        - Keep the language simple and direct
        - Make sure you add "\n" between the lines
        - Don't take the hook from "request of the user"

        <!-- BEGIN request of the user -->
        {request}
        <!-- END request of the user -->
        
        <!-- BEGIN existing hooks -->
        {hooks}
        <!-- END existing hooks -->
        
        <!-- BEGIN current content -->
        {text}
        <!-- END current content -->
       
      `
    )
      .pipe(structuredOutput)
      .invoke({
        request: state.messages[0].content,
        hooks: state.popularPosts!.map((p) => p.hook).join('\n'),
        text: state.fresearch,
      });

    return {
      hook: outputHook,
    };
  }

  async generateContent(state: WorkflowChannelsState) {
    const structuredOutput = model.withStructuredOutput(
      contentZod(!!state.isPicture, state.format)
    );
    const { content: outputContent } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets existing hook of a social media, content and generate only the content.
        - Don't add any hashtags
        - Make sure it sounds ${state.tone}
        - Use ${state.tone === 'personal' ? '1st' : '3rd'} person mode
        - ${
          state.format === 'one_short' || state.format === 'thread_short'
            ? 'Post should be maximum 200 chars to fit twitter'
            : 'Post should be long'
        }
        - ${
          state.format === 'one_short' || state.format === 'one_long'
            ? 'Post should have only 1 item'
            : 'Post should have minimum 2 items'
        }
        - Use the hook as inspiration
        - Make sure it's engaging
        - Don't be cringy
        - Write in the same language as the user's request
        - Keep the language simple and direct
        - The Content should not contain the hook
        - Try to put some call to action at the end of the post
        - Make sure you add "\n" between the lines
        - Add "\n" after every "."
        
        Hook:
        {hook}
        
        User request:
        {request}
        
        current content information:
        {information}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        hook: state.hook,
        request: state.messages[0].content,
        information: state.fresearch,
      });

    return {
      content: outputContent,
    };
  }

  async fixArray(state: WorkflowChannelsState) {
    if (state.format === 'one_short' || state.format === 'one_long') {
      return {
        content: [state.content],
      };
    }

    return {};
  }

  async generatePictures(state: WorkflowChannelsState, org: Organization) {
    if (!state.isPicture) {
      return {};
    }

    // Set per item rather than decided up front: credits can run out partway
    // through a thread, and whatever was covered keeps its picture.
    let imagesSkipped = false;

    try {
      const newContent = await Promise.all(
        (state.content || []).map(async (p) => {
          try {
            const image =
              'data:image/png;base64,' +
              (await this._mediaService.generateImage(p.prompt!, org));
            return {
              ...p,
              image,
            };
          } catch (err) {
            // Out of credits is not a failed run: the posts are the wizard's
            // real output and are still worth delivering without pictures.
            // Anything else is a genuine failure and keeps failing the node.
            if (!(err instanceof SubscriptionException)) {
              throw err;
            }

            imagesSkipped = true;
            return p;
          }
        })
      );

      return {
        content: newContent,
        // Only when something actually was skipped — the client shows a notice
        // on this flag, and an always-present `false` would be a lie the
        // consumer has to interpret.
        ...(imagesSkipped ? { imagesSkipped: true } : {}),
      };
    } catch (err) {
      throw generationError(err);
    }
  }

  async uploadPictures(state: WorkflowChannelsState) {
    const all = await Promise.all(
      (state.content || []).map(async (p) => {
        if (p.image) {
          const upload = await this.storage.uploadSimple(p.image);
          const name = upload.split('/').pop()!;
          const uploadWithId = await this._mediaService.saveFile(
            state.orgId,
            name,
            upload
          );

          return {
            ...p,
            image: uploadWithId,
          };
        }

        return p;
      })
    );

    return { content: all };
  }

  async isGeneratePicture(state: WorkflowChannelsState) {
    if (state.isPicture) {
      return 'generate-picture';
    }

    return 'post-time';
  }

  async postDateTime(state: WorkflowChannelsState) {
    return { date: await this._postsService.findFreeDateTime(state.orgId) };
  }

  /**
   * The org travels as a closure argument into the picture node and never into
   * graph state: this streams with `streamMode: 'values'`, which emits the full
   * state after every node, and the controller writes those frames to the
   * client verbatim — an org in state would hand any member running the wizard
   * the apiKey, the paymentId and the subscription row. `orgId` alone would not
   * do: the metering point needs the loaded subscription to price the
   * allowance, and the controller already holds that row.
   */
  start(org: Organization, body: GeneratorDto) {
    const state = AgentGraphService.state();
    const workflow = state
      .addNode('agent', this.startCall.bind(this))
      .addNode('research', toolNode)
      .addNode('save-research', this.saveResearch.bind(this))
      .addNode('find-category', this.findCategories.bind(this))
      .addNode('find-topic', this.findTopic.bind(this))
      .addNode('find-popular-posts', this.findPopularPosts.bind(this))
      .addNode('generate-hook', this.generateHook.bind(this))
      .addNode('generate-content', this.generateContent.bind(this))
      .addNode('generate-content-fix', this.fixArray.bind(this))
      .addNode('generate-picture', (state: WorkflowChannelsState) =>
        this.generatePictures(state, org)
      )
      .addNode('upload-pictures', this.uploadPictures.bind(this))
      .addNode('post-time', this.postDateTime.bind(this))
      .addEdge(START, 'agent')
      .addEdge('agent', 'research')
      .addEdge('research', 'save-research')
      .addEdge('save-research', 'find-category')
      .addEdge('find-category', 'find-topic')
      .addEdge('find-topic', 'find-popular-posts')
      .addEdge('find-popular-posts', 'generate-hook')
      .addEdge('generate-hook', 'generate-content')
      .addEdge('generate-content', 'generate-content-fix')
      .addConditionalEdges(
        'generate-content-fix',
        this.isGeneratePicture.bind(this)
      )
      .addEdge('generate-picture', 'upload-pictures')
      .addEdge('upload-pictures', 'post-time')
      .addEdge('post-time', END);

    const app = workflow.compile();

    return app.streamEvents(
      {
        messages: [new HumanMessage(body.research)],
        isPicture: body.isPicture,
        format: body.format,
        tone: body.tone,
        orgId: org.id,
      },
      {
        streamMode: 'values',
        version: 'v2',
      }
    );
  }
}
