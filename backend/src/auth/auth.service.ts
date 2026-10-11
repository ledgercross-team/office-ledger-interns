import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { getCompanyDate } from '../common/utils/company-time';
import { hashPassword, verifyPassword } from '../common/utils/passwords';
import { DRIZZLE, type Database } from '../db/db.module';
import { companies } from '../db/schema/companies';
import { subscriptions } from '../db/schema/subscriptions';
import { users } from '../db/schema/users';
import { RedisService } from '../modules/redis/redis.service';
import type { AuthUser, LoginUser, PublicUser, Role } from './auth.types';
import type { ChangePasswordDto } from './dto/change-password.dto';

const SUBSCRIPTION_ACTIVE_TTL_SECONDS = 300;
const GENERIC_LOGIN_MESSAGE = 'Email or password is incorrect.';
const SUBSCRIPTION_MESSAGE = "Your company's subscription has ended. Please contact your admin.";
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$0kdvxdpPM8O0HC5vf7YY+g$V6U/pl33SxEq8dWe+1Xk5KzOHWsrXZhiaOyj40S3Dn8';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly redis: RedisService,
  ) {}

  async validateCredentials(email: string, password: string): Promise<LoginUser> {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const userRows = await this.database
      .select({
        id: users.id,
        role: users.role,
        companyId: users.companyId,
        email: users.email,
        fullName: users.fullName,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        tokenVersion: users.tokenVersion,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)
      .execute();

    const user = userRows[0];
    const passwordOk = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

    if (!user || !passwordOk) {
      throw new UnauthorizedException(GENERIC_LOGIN_MESSAGE);
    }

    if (!user.isActive) {
      throw new UnauthorizedException(GENERIC_LOGIN_MESSAGE);
    }

    const companyActive = user.companyId ? await this.isCompanyActive(user.companyId) : true;

    if (!companyActive) {
      throw new UnauthorizedException(GENERIC_LOGIN_MESSAGE);
    }

    if (user.companyId && user.role !== 'game_master') {
      const subscriptionActive = await this.getSubscriptionActive(user.companyId);

      if (!subscriptionActive && (user.role === 'manager' || user.role === 'employee')) {
        throw new ForbiddenException(SUBSCRIPTION_MESSAGE);
      }
    }

    return {
      id: user.id,
      role: user.role as Role,
      companyId: user.companyId,
      fullName: user.fullName,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      tokenVersion: user.tokenVersion,
    };
  }

  async me(user: AuthUser): Promise<{ user: PublicUser & { subscriptionActive?: boolean } }> {
    const rows = await this.database
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        companyId: users.companyId,
        fullName: users.fullName,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
      .execute();

    const row = rows[0];

    if (!row) {
      throw new UnauthorizedException();
    }

    const result: PublicUser & { subscriptionActive?: boolean } = {
      id: row.id,
      role: row.role as Role,
      fullName: row.fullName,
      email: row.email,
      companyId: row.companyId,
      mustChangePassword: row.mustChangePassword,
    };

    if (row.companyId) {
      result.subscriptionActive = await this.getSubscriptionActive(row.companyId);
    }

    return { user: result };
  }

  // Verifies the current password and stores the new one. The caller revokes the
  // user's tokens afterwards (TokenService.revokeAllForUser) and issues fresh ones.
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const rows = await this.database
      .select({ email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .execute();

    const row = rows[0];

    if (!row) {
      throw new UnauthorizedException();
    }

    if (!(await verifyPassword(row.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is incorrect.');
    }

    if (dto.newPassword.toLowerCase() === row.email.toLowerCase()) {
      throw new BadRequestException('New password must not be your email address.');
    }

    await this.database
      .update(users)
      .set({ passwordHash: await hashPassword(dto.newPassword), mustChangePassword: false })
      .where(eq(users.id, userId))
      .execute();
  }

  async getLoginUser(userId: string): Promise<LoginUser> {
    const rows = await this.database
      .select({
        id: users.id,
        role: users.role,
        companyId: users.companyId,
        email: users.email,
        fullName: users.fullName,
        mustChangePassword: users.mustChangePassword,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .execute();

    const row = rows[0];

    if (!row) {
      throw new UnauthorizedException();
    }

    return { ...row, role: row.role as Role };
  }

  // Call after every subscription write (create, edit, cancel), once it has committed.
  async invalidateCompanySubscription(companyId: string): Promise<void> {
    try {
      await this.redis.client.del(`company:${companyId}:subscription-active`);
    } catch {
      // Best-effort; the key expires on its own within five minutes.
    }
  }

  private async isCompanyActive(companyId: string): Promise<boolean> {
    const rows = await this.database
      .select({ isActive: companies.isActive })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
      .execute();

    return rows[0]?.isActive ?? false;
  }

  async getSubscriptionActive(companyId: string): Promise<boolean> {
    const key = `company:${companyId}:subscription-active`;
    const cached = await this.getCached(key);

    if (cached === '1' || cached === '0') {
      return cached === '1';
    }

    const companyRows = await this.database
      .select({ timezone: companies.timezone })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
      .execute();

    const timezone = companyRows[0]?.timezone ?? 'UTC';
    const today = getCompanyDate(timezone);

    const activeRows = await this.database
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.companyId, companyId),
          isNull(subscriptions.cancelledAt),
          lte(subscriptions.startsOn, today),
          gte(subscriptions.endsOn, today),
        ),
      )
      .limit(1)
      .execute();

    const active = activeRows.length > 0;
    await this.setCached(key, active ? '1' : '0', SUBSCRIPTION_ACTIVE_TTL_SECONDS);

    return active;
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
