import { Get, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './auth/public.decorator';
import { HrmsContextService } from './db/hrms-context';
import { HrmsController } from './hrms-controller.decorator';

@HrmsController('')
export class HrmsHealthController {
  constructor(private readonly context: HrmsContextService) {}

  @Public()
  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.context.tx.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
    return { status: 'ok' };
  }
}
