import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response, json } from 'express';
import { AppModule } from './modules/app.module';
import { env } from './env';
import { RedactingLogger } from './security/redacting-logger';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const csrfExemptPaths = new Set([
  '/meta-accounts/webhook',
  '/campaigns/delivery-status',
]);

if (env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: env.isProduction ? 0.1 : 1,
  });
}

async function bootstrap() {
  const logger = new RedactingLogger();

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger,
  });

  app.useLogger(logger);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());

  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );

    if (env.isProduction) {
      response.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    next();
  });

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      env.isProduction &&
      writeMethods.has(request.method) &&
      !csrfExemptPaths.has(request.path)
    ) {
      const origin = String(request.headers.origin || '').trim();

      if (origin !== env.webOrigin) {
        return response.status(403).json({
          statusCode: 403,
          message: 'Invalid request origin',
        });
      }
    }

    return next();
  });

  app.use(
    json({
      limit: '1mb',
      verify: (request: Request & { rawBody?: Buffer }, _response, buffer) => {
        request.rawBody = Buffer.from(buffer);
      },
    }),
  );

  app.enableCors({
    origin: [env.webOrigin],
    credentials: true,
  });

  await app.listen(env.apiPort);

  logger.log(
    env.isProduction
      ? `API started on configured port ${env.apiPort}`
      : `API running on http://localhost:${env.apiPort}`,
    'Bootstrap',
  );
}

bootstrap().catch((error) => {
  Sentry.captureException(error);
  throw error;
});