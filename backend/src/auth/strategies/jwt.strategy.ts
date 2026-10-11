import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthStateService } from '../auth-state.service';
import {
  ACCESS_COOKIE,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type AuthUser,
  type JwtPayload,
} from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authStateService: AuthStateService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[ACCESS_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const state = await this.authStateService.getAuthState(payload.sub);

    if (!state || !state.isActive || !state.companyActive || state.tokenVersion !== payload.tv) {
      throw new UnauthorizedException();
    }

    return {
      id: payload.sub,
      role: state.role,
      companyId: state.companyId,
      fullName: state.fullName,
      mustChangePassword: state.mustChangePassword,
    };
  }
}
