import { ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage, ThrottlerStorageRecord } from '@nestjs/throttler';
import Redis from 'ioredis';

const THROTTLE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local timeToExpire = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])

if blockTtl > 0 then
  return { count, timeToExpire, 1, blockTtl }
end

if count > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[3])
  blockTtl = redis.call('PTTL', KEYS[2])
  return { count, timeToExpire, 1, blockTtl }
end

return { count, timeToExpire, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly keyPrefix = 'office-ledger:throttle';

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${counterKey}:blocked`;

    try {
      const result = await this.redis.eval(
        THROTTLE_SCRIPT,
        2,
        counterKey,
        blockKey,
        Math.max(1, Math.ceil(ttl)),
        Math.max(0, Math.floor(limit)),
        Math.max(0, Math.ceil(blockDuration)),
      );

      if (!Array.isArray(result) || result.length !== 4) {
        throw new Error('Redis returned an invalid throttling result');
      }

      const [totalHits, timeToExpire, blocked, timeToBlockExpire] = result.map(Number);

      if (
        !Number.isFinite(totalHits) ||
        !Number.isFinite(timeToExpire) ||
        !Number.isFinite(blocked) ||
        !Number.isFinite(timeToBlockExpire)
      ) {
        throw new Error('Redis returned non-numeric throttling values');
      }

      return {
        totalHits,
        timeToExpire: Math.max(0, timeToExpire),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.max(0, timeToBlockExpire),
      };
    } catch {
      throw new ServiceUnavailableException('Rate limiting service is temporarily unavailable');
    }
  }
}
