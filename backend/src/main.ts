import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function parseTrustProxy(value: string): boolean | number {
  if (value === 'true') {
    return true;
  }

  if (value === 'false' || value === '') {
    return false;
  }

  const hops = Number(value);
  if (Number.isSafeInteger(hops) && hops >= 0) {
    return hops;
  }

  throw new Error('TRUST_PROXY must be true, false, or a non-negative integer');
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('PORT must be a positive integer');
  }
  return parsed;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api/v1');
  const config = app.get(ConfigService);
  const httpApp = app.getHttpAdapter().getInstance() as Express;
  const frontendOrigins = (config.get<string>('FRONTEND_URL') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (frontendOrigins.includes('*')) {
    throw new Error('FRONTEND_URL cannot contain * when credentials are enabled');
  }

  if (
    config.get<string>('NODE_ENV') === 'production' &&
    config.get<string>('COOKIE_SECURE') !== 'true'
  ) {
    throw new Error('COOKIE_SECURE must be true in production');
  }

  httpApp.set('trust proxy', parseTrustProxy(config.get<string>('TRUST_PROXY') ?? 'false'));
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

  await app.listen(positiveInteger(config.get<string>('PORT'), 4000));
}

void bootstrap().catch((error: unknown) => {
  console.error('Application failed to start', error);
  process.exitCode = 1;
});
