import type { Database } from '../../db/db.module';
import type { RedisService } from '../redis/redis.service';
import { CompanySubscriptionService } from './company-subscription.service';

function setup(cached: string | null, rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit,
  };
  const select = jest.fn(() => chain);
  const database = { select } as unknown as Database;
  const client = { get: jest.fn().mockResolvedValue(cached), set: jest.fn() };
  const del = jest.fn();
  const redis = { client, del } as unknown as RedisService;

  return { service: new CompanySubscriptionService(database, redis), select, client, del };
}

describe('CompanySubscriptionService', () => {
  it('answers from the cache without touching Postgres', async () => {
    const { service, select } = setup('1', []);
    await expect(service.isActive('c1')).resolves.toBe(true);
    expect(select).not.toHaveBeenCalled();
  });

  it('treats a cached "0" as inactive', async () => {
    const { service } = setup('0', [{ id: 's1' }]);
    await expect(service.isActive('c1')).resolves.toBe(false);
  });

  it('reads Postgres on a miss and caches an active result for 300 s', async () => {
    const { service, client } = setup(null, [{ id: 's1' }]);
    await expect(service.isActive('c1')).resolves.toBe(true);
    expect(client.set).toHaveBeenCalledWith('company:c1:subscription-active', '1', 'EX', 300);
  });

  it('caches an inactive result as "0"', async () => {
    const { service, client } = setup(null, []);
    await expect(service.isActive('c1')).resolves.toBe(false);
    expect(client.set).toHaveBeenCalledWith('company:c1:subscription-active', '0', 'EX', 300);
  });

  it('invalidate deletes the company key', async () => {
    const { service, del } = setup(null, []);
    await service.invalidate('c1');
    expect(del).toHaveBeenCalledWith('company:c1:subscription-active');
  });
});
