import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../db/db.module';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.database.execute(sql`select 1`), this.redis.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
  }
}
