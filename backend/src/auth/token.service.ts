import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CookieOptions, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../common/utils/passwords';
import { DRIZZLE, type Database } from '../db/db.module';
import { companies } from '../db/schema/companies';
import { refreshTokens } from '../db/schema/refresh-tokens';
import { users } from '../db/schema/users';
import { AuthStateService } from './auth-state.service';
import {
  ACCESS_COOKIE,
  JWT_AUDIENCE,
  JWT_ISSUER,
  REFRESH_COOKIE,
  type LoginUser,
  type Role,
} from './auth.types';

const REFRESH_TOKEN_BYTES = 32;
const REUSE_GRACE_MS = 30_000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE) private readonly database: Database,
    private readonly authStateService: AuthStateService,
  ) {}

  async issueTokens(user: LoginUser, req: Request, res: Response): Promise<void> {
    const { token: refreshToken, hash } = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    await this.database
      .insert(refreshTokens)
      .values({
        userId: user.id,
        tokenHash: hash,
        expiresAt,
        ipAddress: this.clientIp(req),
        userAgent: this.clientUserAgent(req),
      })
      .execute();

    const accessToken = await this.signAccessToken(
      user.id,
      user.role,
      user.companyId,
      user.tokenVersion,
    );

    this.setAuthCookies(res, accessToken, refreshToken);
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const oldToken = req.cookies?.[REFRESH_COOKIE];

    if (!oldToken) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException();
    }

    const oldHash = sha256Hex(oldToken);
    const rows = await this.database
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, oldHash))
      .limit(1)
      .execute();

    const row = rows[0];
    const now = new Date();

    if (!row) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException();
    }

    if (row.expiresAt.getTime() <= now.getTime()) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException();
    }

    if (row.revokedAt) {
      const rotatedWithinGrace =
        row.replacedById && now.getTime() - row.revokedAt.getTime() < REUSE_GRACE_MS;

      if (!rotatedWithinGrace) {
        await this.revokeAllForUser(row.userId);
      }

      this.clearAuthCookies(res);
      throw new UnauthorizedException();
    }

    const userRows = await this.database
      .select({
        id: users.id,
        role: users.role,
        companyId: users.companyId,
        isActive: users.isActive,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .execute();

    const user = userRows[0];

    if (!user || !user.isActive) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException();
    }

    if (user.companyId && !(await this.isCompanyActive(user.companyId))) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException();
    }

    const { token: newToken, hash: newHash } = this.generateRefreshToken();
    const newExpiresAt = new Date(now.getTime() + this.refreshTtlMs());

    await this.database.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(refreshTokens)
        .values({
          userId: user.id,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
          ipAddress: this.clientIp(req),
          userAgent: this.clientUserAgent(req),
        })
        .returning();

      await tx
        .update(refreshTokens)
        .set({ revokedAt: now, replacedById: inserted.id })
        .where(eq(refreshTokens.id, row.id))
        .execute();
    });

    const accessToken = await this.signAccessToken(
      user.id,
      user.role as Role,
      user.companyId,
      user.tokenVersion,
    );

    this.setAuthCookies(res, accessToken, newToken);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_COOKIE];

    if (token) {
      await this.database
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.tokenHash, sha256Hex(token)), isNull(refreshTokens.revokedAt)))
        .execute();
    }

    this.clearAuthCookies(res);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date();

    await this.database.transaction(async (tx) => {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
        .execute();

      await tx
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, userId))
        .execute();
    });

    await this.authStateService.invalidate(userId);
  }

  async signAccessToken(
    userId: string,
    role: Role,
    companyId: string | null,
    tokenVersion: number,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: userId,
        role,
        companyId,
        tv: tokenVersion,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: 'HS256',
        expiresIn: this.accessTtlSeconds(),
      },
    );
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const options = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, accessToken, options);
    res.cookie(REFRESH_COOKIE, refreshToken, options);
  }

  clearAuthCookies(res: Response): void {
    const options = this.cookieOptions();
    res.clearCookie(ACCESS_COOKIE, options);
    res.clearCookie(REFRESH_COOKIE, options);
  }

  private generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return { token, hash: sha256Hex(token) };
  }

  private refreshTtlMs(): number {
    const days = Number(this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 7);
    return days * 24 * 60 * 60 * 1000;
  }

  private accessTtlSeconds(): number {
    return Number(this.configService.getOrThrow<string>('JWT_ACCESS_TTL_SECONDS'));
  }

  private cookieOptions(): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get<string>('COOKIE_SECURE') === 'true',
      path: '/',
    };

    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    if (domain) {
      options.domain = domain;
    }

    return options;
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

  private clientIp(req: Request): string | null {
    const ip = String(req.ip ?? '').trim();
    return ip.length > 0 ? ip.slice(0, 45) : null;
  }

  private clientUserAgent(req: Request): string | null {
    const userAgent = String(req.headers['user-agent'] ?? '').trim();
    return userAgent.length > 0 ? userAgent.slice(0, 255) : null;
  }
}
