import { type Database } from '../db/db.module';
import { companies } from '../db/schema/companies';
import { refreshTokens } from '../db/schema/refresh-tokens';
import { subscriptions } from '../db/schema/subscriptions';
import { users } from '../db/schema/users';

export interface FakeDbConfig {
  users?: Array<Record<string, any>>;
  companies?: Array<Record<string, any>>;
  subscriptions?: Array<Record<string, any>>;
  refreshTokens?: Array<Record<string, any>>;
}

export interface RecordedUpdate {
  table: unknown;
  set: unknown;
  where: unknown;
}

export interface RecordedInsert {
  table: unknown;
  values: unknown;
}

export interface FakeDatabase {
  rows: (table: unknown) => Array<Record<string, any>>;
  updates: RecordedUpdate[];
  inserts: RecordedInsert[];
  transactions: number;
}

function rowsFor(config: FakeDbConfig, table: unknown): Array<Record<string, any>> {
  if (table === users) return config.users ?? [];
  if (table === companies) return config.companies ?? [];
  if (table === subscriptions) return config.subscriptions ?? [];
  if (table === refreshTokens) return config.refreshTokens ?? [];
  return [];
}

function chain(rows: () => Array<Record<string, any>>) {
  return {
    where() {
      return this;
    },
    limit() {
      return this;
    },
    leftJoin() {
      return this;
    },
    execute() {
      return Promise.resolve(rows());
    },
  };
}

export function createFakeDatabase(config: FakeDbConfig): FakeDatabase {
  const db: any = {
    updates: [] as RecordedUpdate[],
    inserts: [] as RecordedInsert[],
    transactions: 0,
  };

  db.select = () => ({
    from: (table: unknown) => chain(() => rowsFor(config, table)),
  });

  db.insert = (table: unknown) => ({
    values: (values: unknown) => {
      db.inserts.push({ table, values });
      return {
        returning: () => Promise.resolve([{ id: 'inserted-id', ...(values as object) }]),
        execute: () => Promise.resolve([{ id: 'inserted-id', ...(values as object) }]),
      };
    },
  });

  db.update = (table: unknown) => ({
    set: (set: unknown) => ({
      where: (where: unknown) => ({
        execute: () => {
          db.updates.push({ table, set, where });
          return Promise.resolve([]);
        },
      }),
    }),
  });

  db.transaction = (work: (tx: unknown) => Promise<unknown>) => {
    db.transactions += 1;
    return Promise.resolve(work(db));
  };

  db.rows = (table: unknown) => rowsFor(config, table);

  return db as FakeDatabase;
}

/** Builds a pretend database typed as the real one (for constructor injection). */
export function fakeDatabase(config: FakeDbConfig): Database {
  return createFakeDatabase(config) as unknown as Database;
}

export function fakeRedisClient(): {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
} {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
}
