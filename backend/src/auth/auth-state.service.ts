import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../db/db.module';
import { companies } from '../db/schema/companies';
import { users } from '../db/schema/users';
import { RedisService } from '../modules/redis/redis.service';
import type { CurrentUserState, Role } from './auth.types';

const AUTH_STATE_TTL_SECONDS = 300;

@Injectable()
export class AuthStateService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly redis: RedisService,
  ) {}

  async getAuthState(userId: string): Promise<CurrentUserState | null> {
    const key = this.key(userId);
    const cached = await this.getCached(key);

    if (cached) {
      try {
        return JSON.parse(cached) as CurrentUserState;
      } catch {
        // Fall through and rebuild from Postgres on a corrupt value.
      }
    }

    const userRows = await this.database
      .select({
        id: users.id,
        role: users.role,
        companyId: users.companyId,
        fullName: users.fullName,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .execute();

    const user = userRows[0];

    if (!user) {
      return null;
    }

    let companyActive = true;

    if (user.companyId) {
      const companyRows = await this.database
        .select({ isActive: companies.isActive })
        .from(companies)
        .where(eq(companies.id, user.companyId))
        .limit(1)
        .execute();

      companyActive = companyRows[0]?.isActive ?? false;
    }

    const state: CurrentUserState = {
      role: user.role as Role,
      companyId: user.companyId,
      fullName: user.fullName,
      isActive: user.isActive,
      companyActive,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
    };

    await this.setCached(key, JSON.stringify(state), AUTH_STATE_TTL_SECONDS);

    return state;
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.client.del(this.key(userId));
    } catch {
      // Cache is best-effort; Postgres remains the source of truth.
    }
  }

  private key(userId: string): string {
    return `auth:user:${userId}`;
  }

  private async getCached(key: string): Promise<string | null> {
    try {
      return await this.redis.client.get(key);
    } catch {
      return null;
    }
  }

  private async setCached(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(key, value, 'EX', ttlSeconds);
    } catch {
      // Best-effort; the next request rebuilds the cache.
    }
  }
}
