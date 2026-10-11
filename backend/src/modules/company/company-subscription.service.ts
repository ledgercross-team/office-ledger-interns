import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../db/db.module';
import { companies, subscriptions } from '../../db/schema';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_SECONDS = 300;

const cacheKey = (companyId: string) => `company:${companyId}:subscription-active`;

@Injectable()
export class CompanySubscriptionService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly redis: RedisService,
  ) {}

  // Active: not cancelled, started, and not ended, with "today" in the company's timezone.
  async isActive(companyId: string): Promise<boolean> {
    const cached = await this.redis.client.get(cacheKey(companyId));
    if (cached !== null) {
      return cached === '1';
    }

    const today = sql`(now() at time zone ${companies.timezone})::date`;
    const rows = await this.database
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .innerJoin(companies, eq(companies.id, subscriptions.companyId))
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          isNull(subscriptions.cancelledAt),
          sql`${subscriptions.startsOn} <= ${today}`,
          sql`${subscriptions.endsOn} >= ${today}`,
        ),
      )
      .limit(1);

    const active = rows.length > 0;
    await this.redis.client.set(cacheKey(companyId), active ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
    return active;
  }

  // Call after every subscription write (create, edit, cancel), once the transaction commits.
  async invalidate(companyId: string): Promise<void> {
    await this.redis.del(cacheKey(companyId));
  }
}
