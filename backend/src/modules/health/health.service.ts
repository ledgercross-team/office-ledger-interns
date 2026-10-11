import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../db/db.module';

@Injectable()
export class HealthService {
  constructor(@Inject(DRIZZLE) private readonly database: Database) {}

  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.database.execute(sql`select 1`);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error' });
    }
  }
}
