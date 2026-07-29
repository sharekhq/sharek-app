import { Injectable, Type, ValidationPipe } from '@nestjs/common';

export type URL = string;

/** What a two-phase provider hands the user to review between the phases. */
export interface VideoStoryboard {
  styleGuide: string;
  slides: { text: string }[];
}

export type VideoCreateEvent =
  | { name: 'progress'; step: string; done: number; total: number }
  | { name: 'done'; url: URL };

export abstract class VideoAbstract<T, S = VideoStoryboard> {
  dto: Type<T>;

  async processAndValidate(customParams?: T) {
    const validationPipe = new ValidationPipe({
      skipMissingProperties: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    await validationPipe.transform(customParams, {
      type: 'body',
      metatype: this.dto,
    });
  }

  abstract process(
    output: 'vertical' | 'horizontal',
    customParams?: T
  ): Promise<URL>;

  /**
   * Optional two-phase flow. `plan` is a cheap pass whose result the user
   * reviews and edits; `create` renders what they approved, yielding progress
   * so a caller can keep a streamed response alive. A provider implementing
   * neither is driven through `process` alone, so callers must check first
   * rather than assume.
   */
  plan?(customParams: T): Promise<S>;

  create?(
    output: 'vertical' | 'horizontal',
    storyboard: S,
    customParams: T
  ): AsyncGenerator<VideoCreateEvent>;
}

export interface VideoParams {
  identifier: string;
  title: string;
  description: string;
  dto: any;
  placement: 'text-to-image' | 'image-to-video' | 'video-to-video';
  tools: { functionName: string; output: string }[];
  available: boolean;
  trial: boolean;
}

export function ExposeVideoFunction(description?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    Reflect.defineMetadata(
      'video-function',
      description || 'true',
      descriptor.value
    );
  };
}

export function Video(params: VideoParams) {
  return function (target: any) {
    // Apply @Injectable decorator to the target class
    Injectable()(target);

    // Retrieve existing metadata or initialize an empty array
    const existingMetadata = Reflect.getMetadata('video', VideoAbstract) || [];

    // Add the metadata information for this method
    existingMetadata.push({ target, ...params });

    // Define metadata on the class prototype (so it can be retrieved from the class)
    Reflect.defineMetadata('video', existingMetadata, VideoAbstract);
  };
}
