import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    const redisUrl = config.getOrThrow<string>('REDIS_URL');

    try {
      const parsedUrl = new URL(redisUrl);
      if (parsedUrl.protocol !== 'redis:' && parsedUrl.protocol !== 'rediss:') {
        throw new Error('REDIS_URL must use redis:// or rediss://');
      }
    } catch (error) {
      throw new Error(
        `Invalid REDIS_URL: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 1_000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2_000),
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.client.connect(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('Redis startup connection timed out'));
          }, 5_000);
        }),
      ]);
      await this.client.ping();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.client.disconnect();
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit().catch(() => {
      this.client.disconnect();
    });
  }

  async ping(): Promise<'PONG'> {
    return this.client.ping();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
