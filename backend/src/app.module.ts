import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { validateEnvironment } from './config/env.validation';
import { DbModule } from './db/db.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './modules/redis/redis.module';
import { RedisService } from './modules/redis/redis.service';
import { RedisThrottlerStorage } from './modules/redis/redis-throttler.storage';

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
    HealthModule,
    RedisModule,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginCheckMiddleware).forRoutes('*');
  }
}
