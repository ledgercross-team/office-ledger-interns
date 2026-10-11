import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
@SkipThrottle({ auth: true })
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  check(): Promise<{ status: 'ok' }> {
    return this.healthService.check();
  }
}
