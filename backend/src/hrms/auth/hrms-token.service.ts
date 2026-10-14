import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { sql } from 'drizzle-orm';
import type { CookieOptions, Request, Response } from 'express';
import { isEnabled } from '../../common/utils/env';
import { sha256Hex } from '../../common/utils/passwords';
import { HrmsContextService, type HrmsTransaction } from '../db/hrms-context';
import {
  HRMS_ACCESS_COOKIE,
  HRMS_JWT_AUDIENCE,
  HRMS_JWT_ISSUER,
  HRMS_MFA_AUDIENCE,
  HRMS_REFRESH_COOKIE,
  isUsableMembership,
  type HrmsJwtPayload,
  type MembershipRow,
} from './hrms-auth.types';

const REFRESH_TOKEN_BYTES = 32;
// A token that was just rotated may be sent once more by a second tab. Beyond this window a
// reused token means theft, and the whole chain is revoked.
const REUSE_GRACE_MS = 30_000;

interface RefreshRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  member_id: string | null;
  // drizzle's driver returns timestamps as strings
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}

export interface Session {
  userId: string;
  memberId: string | null;
  orgId: string | null;
}

interface MembershipDbRow extends Record<string, unknown> {
  member_id: string;
  org_id: string;
  role: MembershipRow['role'];
  status: MembershipRow['status'];
  org_status: MembershipRow['orgStatus'];
}

type RefreshOutcome =
  | { kind: 'ok'; session: Session; token: string }
  | { kind: 'invalid' }
  | { kind: 'reuse' };

@Injectable()
export class HrmsTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly context: HrmsContextService,
  ) {}

  /** Creates a refresh token row and sets both cookies. */
  async issue(session: Session, req: Request, res: Response): Promise<void> {
    const { token, hash } = this.generateRefreshToken();
    await this.context.runSystem(async (tx) => {
      await this.insertRefreshToken(tx, session, hash, req);
    });
    await this.setCookies(res, session, token);
  }

  /** Rotates the refresh cookie. Reuse outside the grace window revokes every session of the user. */
  async refresh(req: Request, res: Response): Promise<Session> {
    const old = this.cookie(req, HRMS_REFRESH_COOKIE);
    if (!old) {
      this.clearCookies(res);
      throw new UnauthorizedException();
    }
    const oldHash = sha256Hex(old);
    const next = this.generateRefreshToken();

    // my_memberships() only answers for app.user_id, so the owner of the token is found first.
    const owner = await this.context.runSystem(async (tx) => {
      const found = await tx.execute<{ user_id: string }>(
        sql`select user_id from refresh_tokens where token_hash = ${oldHash}`,
      );
      return found.rows[0]?.user_id ?? null;
    });
    if (!owner) {
      this.clearCookies(res);
      throw new UnauthorizedException();
    }

    // The outcome is returned, not thrown, so a revoke-all inside the transaction commits.
    const outcome = await this.context.runSystem<RefreshOutcome>(
      async (tx) => {
        const found = await tx.execute<RefreshRow>(sql`
          select id, user_id, member_id, expires_at, revoked_at, replaced_by
            from refresh_tokens where token_hash = ${oldHash} for update`);
        const row = found.rows[0];
        const now = new Date();
        if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return { kind: 'invalid' };

        if (row.revoked_at) {
          const rotatedRecently =
            row.replaced_by !== null && now.getTime() - new Date(row.revoked_at).getTime() < REUSE_GRACE_MS;
          if (rotatedRecently) return { kind: 'invalid' };
          await tx.execute(
            sql`update refresh_tokens set revoked_at = now() where user_id = ${row.user_id} and revoked_at is null`,
          );
          return { kind: 'reuse' };
        }

        // A role change or deactivation takes effect here: the membership must still be usable.
        let orgId: string | null = null;
        if (row.member_id) {
          const memberships = await tx.execute<MembershipDbRow>(sql`
            select member_id, org_id, role, status, org_status from my_memberships(${row.user_id}::uuid)`);
          const current = memberships.rows.find((m) => m.member_id === row.member_id);
          const usable =
            current !== undefined &&
            isUsableMembership({
              status: current.status,
              orgStatus: current.org_status,
              role: current.role,
            });
          if (!usable) {
            await tx.execute(sql`update refresh_tokens set revoked_at = now() where id = ${row.id}`);
            return { kind: 'invalid' };
          }
          orgId = current.org_id;
        }

        const session: Session = { userId: row.user_id, memberId: row.member_id, orgId };
        const inserted = await this.insertRefreshToken(tx, session, next.hash, req);
        await tx.execute(
          sql`update refresh_tokens set revoked_at = now(), replaced_by = ${inserted} where id = ${row.id}`,
        );
        return { kind: 'ok', token: next.token, session };
      },
      { userId: owner },
    );

    if (outcome.kind !== 'ok') {
      this.clearCookies(res);
      throw new UnauthorizedException();
    }
    await this.setCookies(res, outcome.session, outcome.token);
    return outcome.session;
  }

  async revokeCurrent(req: Request, res: Response): Promise<void> {
    const token = this.cookie(req, HRMS_REFRESH_COOKIE);
    if (token) {
      const hash = sha256Hex(token);
      await this.context.runSystem(async (tx) => {
        await tx.execute(
          sql`update refresh_tokens set revoked_at = now() where token_hash = ${hash} and revoked_at is null`,
        );
      });
    }
    this.clearCookies(res);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.context.runSystem(async (tx) => {
      await tx.execute(
        sql`update refresh_tokens set revoked_at = now() where user_id = ${userId} and revoked_at is null`,
      );
    });
  }

  async verifyAccessToken(token: string): Promise<HrmsJwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<HrmsJwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
        issuer: HRMS_JWT_ISSUER,
        audience: HRMS_JWT_AUDIENCE,
      });
      if (typeof payload.sub !== 'string') throw new Error('no subject');
      return { sub: payload.sub, mid: payload.mid ?? null, oid: payload.oid ?? null };
    } catch {
      throw new UnauthorizedException();
    }
  }

  /** Five minutes to enter the code. It proves the password only; the audience keeps it from being a session. */
  signMfaToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, purpose: 'mfa' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithm: 'HS256',
        issuer: HRMS_JWT_ISSUER,
        audience: HRMS_MFA_AUDIENCE,
        expiresIn: 300,
      },
    );
  }

  async verifyMfaToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; purpose?: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
        issuer: HRMS_JWT_ISSUER,
        audience: HRMS_MFA_AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || payload.purpose !== 'mfa') throw new Error('bad token');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Your sign-in expired. Please log in again.');
    }
  }

  cookie(req: Request, name: string): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private async insertRefreshToken(
    tx: HrmsTransaction,
    session: Session,
    hash: string,
    req: Request,
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    const ip = req.ip && /^[0-9a-fA-F:.]+$/.test(req.ip) ? req.ip : null;
    const agent = (req.headers['user-agent'] ?? '').slice(0, 255) || null;
    const result = await tx.execute<{ id: string }>(sql`
      insert into refresh_tokens (user_id, token_hash, member_id, expires_at, ip_address, user_agent)
      values (${session.userId}, ${hash}, ${session.memberId}, ${expiresAt}, ${ip}::inet, ${agent})
      returning id`);
    return result.rows[0].id;
  }

  private async setCookies(res: Response, session: Session, refreshToken: string): Promise<void> {
    const ttl = Number(this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'));
    const payload: HrmsJwtPayload = { sub: session.userId, mid: session.memberId, oid: session.orgId };
    const access = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithm: 'HS256',
      issuer: HRMS_JWT_ISSUER,
      audience: HRMS_JWT_AUDIENCE,
      expiresIn: ttl,
    });
    res.cookie(HRMS_ACCESS_COOKIE, access, { ...this.cookieOptions(), maxAge: ttl * 1000 });
    res.cookie(HRMS_REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.refreshTtlMs(),
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie(HRMS_ACCESS_COOKIE, this.cookieOptions());
    res.clearCookie(HRMS_REFRESH_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    const domain = this.config.get<string>('COOKIE_DOMAIN');
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: isEnabled(this.config.get('COOKIE_SECURE')),
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private refreshTtlMs(): number {
    return Number(this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS')) * 24 * 60 * 60 * 1000;
  }

  private generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    return { token, hash: sha256Hex(token) };
  }
}
