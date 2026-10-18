import { ForbiddenException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Auth uses cookies, so block cross-site state-changing requests. A request
// without an Origin header (curl, server-to-server) is allowed through.
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigins: string[];

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.allowedOrigins = (config.get<string>('FRONTEND_URL') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const origin = req.headers.origin;

    if (
      origin !== undefined &&
      STATE_CHANGING_METHODS.has(req.method) &&
      !this.allowedOrigins.includes(origin)
    ) {
      throw new ForbiddenException('Cross-origin request blocked');
    }

    next();
  }
}
