import { Body, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { HrmsController } from '../hrms-controller.decorator';
import {
  HrmsAcceptInviteDto,
  HrmsChangePasswordDto,
  HrmsLoginDto,
  HrmsMfaCodeDto,
  HrmsMfaSetupDto,
  HrmsSwitchOrgDto,
} from './dto/hrms-auth.dto';
import { HrmsSession } from './hrms-auth.decorators';
import type { HrmsAuthedRequest } from './hrms-auth.guard';
import { HrmsAuthService, type SessionView } from './hrms-auth.service';
import type { HrmsPrincipal } from './hrms-auth.types';
import { HrmsTokenService } from './hrms-token.service';

// 2-minute windows, per IP (login: per IP and email). The strict "auth" limit also applies
// to these paths (STRICT_AUTH_PATHS in app.module.ts).
const LOGIN_RATE = { limit: 10, ttl: 2 * 60 * 1000 };
const REFRESH_RATE = { limit: 30, ttl: 2 * 60 * 1000 };
const SENSITIVE_RATE = { limit: 5, ttl: 2 * 60 * 1000 };

function principalOf(req: HrmsAuthedRequest): HrmsPrincipal {
  if (!req.hrmsAuth) throw new Error('HrmsAuthGuard did not run');
  return req.hrmsAuth;
}

@HrmsController('auth')
export class HrmsAuthController {
  constructor(
    private readonly auth: HrmsAuthService,
    private readonly tokens: HrmsTokenService,
  ) {}

  @Public()
  @Throttle({ default: LOGIN_RATE })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: HrmsLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionView> {
    return this.auth.login(dto, req, res);
  }

  // Profile → Security. Signed-in session only; setup also asks for the password.
  @HrmsSession()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  mfaSetup(
    @Body() dto: HrmsMfaSetupDto,
    @Req() req: HrmsAuthedRequest,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    return this.auth.mfaSetup(principalOf(req), dto.password);
  }

  @HrmsSession()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  mfaEnable(
    @Body() dto: HrmsMfaCodeDto,
    @Req() req: HrmsAuthedRequest,
  ): Promise<{ backupCodes: string[] }> {
    return this.auth.mfaEnable(principalOf(req), dto.code);
  }

  @HrmsSession()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('mfa/backup-codes')
  @HttpCode(HttpStatus.OK)
  mfaBackupCodes(
    @Body() dto: HrmsMfaCodeDto,
    @Req() req: HrmsAuthedRequest,
  ): Promise<{ backupCodes: string[] }> {
    return this.auth.mfaNewBackupCodes(principalOf(req), dto.code);
  }

  @HrmsSession()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async mfaDisable(@Body() dto: HrmsMfaCodeDto, @Req() req: HrmsAuthedRequest): Promise<void> {
    await this.auth.mfaDisable(principalOf(req), dto.code);
  }

  @Public()
  @Throttle({ default: REFRESH_RATE })
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.tokens.refresh(req, res);
  }

  @HrmsSession()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  switchOrg(
    @Body() dto: HrmsSwitchOrgDto,
    @Req() req: HrmsAuthedRequest & Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionView> {
    return this.auth.switchOrg(principalOf(req), dto.memberId, req, res);
  }

  @Public()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('accept-invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  async acceptInvite(@Body() dto: HrmsAcceptInviteDto): Promise<void> {
    await this.auth.acceptInvite(dto.token, dto.password);
  }

  @HrmsSession()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req, res);
  }

  @HrmsSession()
  @Throttle({ default: SENSITIVE_RATE })
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() dto: HrmsChangePasswordDto,
    @Req() req: HrmsAuthedRequest & Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(principalOf(req), dto, req, res);
  }

  @HrmsSession()
  @Get('me')
  me(@Req() req: HrmsAuthedRequest & Request): Promise<SessionView> {
    return this.auth.me(principalOf(req));
  }
}
