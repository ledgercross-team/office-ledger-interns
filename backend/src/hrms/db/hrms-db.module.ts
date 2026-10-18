import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { prepareDatabaseUrl } from '../../config/database-url';
import { HrmsContextService } from './hrms-context';
import { HRMS_DB, HRMS_POOL } from './hrms-db.tokens';

export type HrmsDatabase = NodePgDatabase<typeof schema>;

@Injectable()
class HrmsPoolCloser implements OnApplicationShutdown {
  constructor(@Inject(HRMS_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

// A second connection to the HRMS database. It must be the hrms_api login: the owner skips
// row-level security.
@Global()
@Module({
  providers: [
    {
      provide: HRMS_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: prepareDatabaseUrl(config.getOrThrow<string>('DATABASE_URL')),
          max: 10,
        }),
    },
    {
      provide: HRMS_DB,
      inject: [HRMS_POOL],
      useFactory: (pool: Pool): HrmsDatabase => drizzle(pool, { schema }),
    },
    HrmsPoolCloser,
    HrmsContextService,
  ],
  exports: [HRMS_DB, HrmsContextService],
})
export class HrmsDbModule {}
