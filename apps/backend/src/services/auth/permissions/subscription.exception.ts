import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AuthorizationActions, Sections, SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Catch(SubscriptionException)
export class SubscriptionExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const error: {
      section: Sections;
      action: AuthorizationActions;
      resetsAt?: string;
    } = exception.getResponse() as any;

    const message = getErrorMessage(error);

    response.status(status).json({
      statusCode: status,
      message,
      url: process.env.FRONTEND_URL + '/billing',
      // What the browser keys its copy on; `message` stays as it is for the
      // clients that read it. Undefined `resetsAt` serializes away.
      section: error.section,
      resetsAt: error.resetsAt,
    });
  }
}

const getErrorMessage = (error: {
  section: Sections;
  action: AuthorizationActions;
}) => {
  switch (error.section) {
    case Sections.POSTS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.';
      }
    case Sections.CHANNEL:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.';
      }
    case Sections.WEBHOOKS:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.';
      }
    case Sections.VIDEOS_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.';
      }
    case Sections.IMAGES_PER_MONTH:
      switch (error.action) {
        default:
          return 'You have reached the maximum number of generated images for your subscription. Please upgrade your subscription to generate more images.';
      }
  }
};
