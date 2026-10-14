import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { validateEnvironment } from './config/env.validation';
import { DbModule } from './db/db.module';
import { AccountStateGuard } from './auth/guards/account-state.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { RedisModule } from './modules/redis/redis.module';
import { RedisService } from './modules/redis/redis.service';
import { RedisThrottlerStorage } from './modules/redis/redis-throttler.storage';
import { EmployeeServicesModule } from './modules/employee-services/employee-services.module';
import { HrmsModule } from './hrms/hrms.module';
import { isEnabled } from './common/utils/env';

// Only credential endpoints count against the strict auth limit. /auth/me runs on every
// page load, so counting it would lock people out after a few refreshes.
const STRICT_AUTH_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/change-password',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/switch-org',
  '/api/auth/mfa/enroll',
  '/api/auth/mfa/verify',
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
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    DbModule,
    AuthModule,
    MessagesModule,
    DashboardModule,
    HealthModule,
    RedisModule,
    EmployeeServicesModule,
    // HRMS v2 exists only when the flag is on. forRoot() above has already loaded .env.local.
    ...(isEnabled(process.env.HRMS_V2_ENABLED) ? [HrmsModule] : []),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService, redis: RedisService) => {
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
          storage: new RedisThrottlerStorage(redis.client),
          setHeaders: true,
        };
      },
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccountStateGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginCheckMiddleware).forRoutes('{*path}');
  }
}
