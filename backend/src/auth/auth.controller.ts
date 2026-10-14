import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest, AuthUser, LoginUser, PublicUser } from './auth.types';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ALL_ROLES, Roles } from './decorators/roles.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

const LOGIN_RATE = { limit: 5, ttl: 2 * 60 * 1000 };
const REFRESH_RATE = { limit: 30, ttl: 2 * 60 * 1000 };
const CHANGE_PASSWORD_RATE = { limit: 5, ttl: 2 * 60 * 1000 };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: LOGIN_RATE })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() _body: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: PublicUser & { subscriptionActive?: boolean; companyTimezone?: string } }> {
    const user = req.user as LoginUser;
    await this.tokenService.issueTokens(user, req, res);

    const subscriptionActive = user.companyId
      ? await this.authService.getSubscriptionActive(user.companyId)
      : undefined;

    return {
      user: {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
        email: user.email,
        companyId: user.companyId,
        mustChangePassword: user.mustChangePassword,
        subscriptionActive,
      },
    };
  }

  @Public()
  @Throttle({ default: REFRESH_RATE })
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.tokenService.refresh(req, res);
  }

  @Roles(...ALL_ROLES)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.tokenService.logout(req, res);
  }

  @Roles(...ALL_ROLES)
  @Throttle({ default: CHANGE_PASSWORD_RATE })
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.changePassword(user.id, dto);
    // Every other session is signed out; this browser gets fresh tokens.
    await this.tokenService.revokeAllForUser(user.id);
    await this.tokenService.issueTokens(await this.authService.getLoginUser(user.id), req, res);
  }

  @Roles(...ALL_ROLES)
  @Get('me')
  async me(
    @CurrentUser() user: AuthUser,
  ): Promise<{ user: PublicUser & { subscriptionActive?: boolean; companyTimezone?: string } }> {
    return this.authService.me(user);
  }
}
