import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Request, Response } from 'express';
import { env } from '../env';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    if (env.sentryDsn && status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('path', request.path);
        scope.setTag('method', request.method);

        scope.setContext('request', {
          path: request.path,
          method: request.method,
          queryKeys: Object.keys(request.query || {}).slice(0, 50),
        });

        Sentry.captureException(exception);
      });
    }

    if (response.headersSent) {
      return;
    }

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}