import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { HrmsDatabase } from './hrms-db.module';
import { HRMS_DB } from './hrms-db.tokens';

/** The four settings the database reads. An empty value means "not set". */
export interface HrmsRequestContext {
  orgId?: string | null;
  memberId?: string | null;
  userId?: string | null;
  ip?: string | null;
}

export type HrmsTransaction = Parameters<Parameters<HrmsDatabase['transaction']>[0]>[0];

// Queries inside one request must all use the same transaction, or the app.* settings
// would not apply to them. The interceptor opens it; services read it from here.
const current = new AsyncLocalStorage<HrmsTransaction>();

@Injectable()
export class HrmsContextService {
  constructor(@Inject(HRMS_DB) private readonly db: HrmsDatabase) {}

  /**
   * Runs `fn` in one transaction that starts with the four app.* settings (set_config with
   * is_local = true, so they end with the transaction). The transaction commits when `fn`
   * resolves and rolls back when it throws. Commit errors reject this promise too.
   */
  run<T>(ctx: HrmsRequestContext, fn: (tx: HrmsTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select
        set_config('app.org_id',    ${ctx.orgId ?? ''}, true),
        set_config('app.member_id', ${ctx.memberId ?? ''}, true),
        set_config('app.user_id',   ${ctx.userId ?? ''}, true),
        set_config('app.client_ip', ${ctx.ip ?? ''}, true)`);
      return current.run(tx, () => fn(tx));
    });
  }

  /**
   * System context for jobs and login lookups: no member id, so the database skips actor
   * checks. Pass an org id for per-org jobs; leave it out for platform-wide functions.
   */
  runSystem<T>(
    fn: (tx: HrmsTransaction) => Promise<T>,
    options: { orgId?: string; userId?: string } = {},
  ): Promise<T> {
    return this.run({ orgId: options.orgId, userId: options.userId }, fn);
  }

  /** The transaction of the request being handled. Throws outside a request. */
  get tx(): HrmsTransaction {
    const tx = current.getStore();
    if (!tx) throw new Error('No HRMS transaction: this code ran outside a request context.');
    return tx;
  }

  publishRealtime(): Promise<unknown> {
    return this.tx.execute(sql`select pg_notify('hrms_realtime', current_org_id()::text)`);
  }

  publishRealtimeTo(orgId: string): Promise<unknown> {
    return this.tx.execute(sql`select pg_notify('hrms_realtime', ${orgId})`);
  }

  publishPlatformRealtime(): Promise<unknown> {
    return this.tx.execute(sql`select pg_notify('hrms_realtime', 'platform')`);
  }
}
