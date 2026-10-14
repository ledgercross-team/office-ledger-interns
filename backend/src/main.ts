import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { isEnabled } from './common/utils/env';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('PORT must be a positive integer');
  }
  return parsed;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const httpApp = app.getHttpAdapter().getInstance() as Express;
  const frontendOrigins = (config.get<string>('FRONTEND_URL') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (frontendOrigins.includes('*')) {
    throw new Error('FRONTEND_URL cannot contain * when credentials are enabled');
  }

  if (config.get<string>('NODE_ENV') === 'production' && !isEnabled(config.get('COOKIE_SECURE'))) {
    throw new Error('COOKIE_SECURE must be true in production');
  }

  // Behind exactly one reverse proxy, so req.ip is the client's IP.
  const trustProxy = isEnabled(config.get('TRUST_PROXY'));
  httpApp.set('trust proxy', trustProxy ? 1 : false);
  if (config.get<string>('NODE_ENV') === 'production') {
    // Wrong either way: false behind a proxy gives every user the proxy's IP (office-IP check-in
    // and rate limits break); true without a proxy lets clients spoof X-Forwarded-For.
    new Logger('Bootstrap').warn(
      trustProxy
        ? 'TRUST_PROXY=true: the API must sit behind exactly one reverse proxy that sets X-Forwarded-For.'
        : 'TRUST_PROXY=false: if a reverse proxy is in front, every client appears as the proxy IP.',
    );
  }
  // API responses carry personal data and one-time secrets: never let a browser or proxy keep them.
  httpApp.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  httpApp.use(express.json({ limit: '1mb' }));
  httpApp.use(
    express.urlencoded({
      extended: false,
      limit: '100kb',
      parameterLimit: 100,
    }),
  );
  app.use(cookieParser());
  app.use(helmet());
  app.enableCors({
    origin: frontendOrigins.length > 0 ? frontendOrigins : false,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  // Render and similar reverse proxies connect over IPv4, so bind explicitly to all
  // interfaces instead of relying on Node's platform-dependent default host.
  await app.listen(
    positiveInteger(config.get<string>('PORT'), 4000),
    config.get<string>('HOST') ?? '0.0.0.0',
  );
}

void bootstrap().catch((error: unknown) => {
  console.error('Application failed to start', error);
  process.exitCode = 1;
});
