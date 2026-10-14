import { Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { RedisService } from '../modules/redis/redis.service';
import { Public } from './auth/public.decorator';
import { HrmsContextService } from './db/hrms-context';
import { HrmsController } from './hrms-controller.decorator';

@HrmsController('')
export class HrmsHealthController {
  constructor(
    private readonly context: HrmsContextService,
    // Provided by the global RedisModule of the application; absent in module-level tests.
    @Optional() private readonly redis?: RedisService,
  ) {}

  @Public()
  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.context.tx.execute(sql`select 1`), this.redis?.ping()]);
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
    return { status: 'ok' };
  }
}
