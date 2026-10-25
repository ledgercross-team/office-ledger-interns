import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { validateEnvironment } from './config/env.validation';
import { HrmsModule } from './hrms/hrms.module';

// Login has its own per-IP/email route limit. Other credential endpoints use the strict limit;
// /auth/me runs on page loads and is deliberately excluded.
const STRICT_AUTH_PATHS = [
  '/api/auth/refresh',
  '/api/auth/switch-org',
  '/api/auth/mfa/setup',
  '/api/auth/mfa/enable',
  '/api/auth/mfa/disable',
  '/api/auth/mfa/backup-codes',
  '/api/auth/change-password',
  '/api/auth/accept-invite',
];

function positiveInteger(config: ConfigService, name: string, fallback: number): number {
  const value = config.get<string>(name);
  const parsed = value === undefined ? fallback : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env.local', '.env'],
      validate: validateEnvironment,
    }),
    HrmsModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const globalLimit = positiveInteger(config, 'RATE_LIMIT_GLOBAL_PER_MIN', 100);
        const authLimit = positiveInteger(config, 'RATE_LIMIT_AUTH_PER_MIN', 10);
        const globalBlockSeconds = positiveInteger(config, 'RATE_LIMIT_GLOBAL_BLOCK_SECONDS', 60);
        const authBlockSeconds = positiveInteger(config, 'RATE_LIMIT_AUTH_BLOCK_SECONDS', 300);

        return {
          throttlers: [
            {
              name: 'default',
              limit: globalLimit,
              ttl: seconds(60),
              blockDuration: seconds(globalBlockSeconds),
            },
            {
              name: 'auth',
              skipIf: (context) =>
                !STRICT_AUTH_PATHS.includes(
                  context.switchToHttp().getRequest<{ path: string }>().path,
                ),
              limit: authLimit,
              ttl: seconds(60),
              blockDuration: seconds(authBlockSeconds),
            },
          ],
          setHeaders: true,
        };
      },
    }),
  ],
  providers: [
    OriginCheckMiddleware,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginCheckMiddleware).forRoutes('{*path}');
  }
}
