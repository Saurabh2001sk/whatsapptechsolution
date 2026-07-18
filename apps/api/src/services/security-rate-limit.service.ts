import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { env } from '../env';

type LimitOptions = {
  limit: number;
  windowMs: number;
  message?: string;
};

type MemoryEntry = {
  count: number;
  expiresAt: number;
};

const atomicRateLimitScript = `
local count = redis.call('INCR', KEYS[1])

if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

return count
`;

@Injectable()
export class SecurityRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly memoryStore = new Map<string, MemoryEntry>();

  constructor() {
    const redisUrl = env.redisUrl;

    if (env.isProduction && !redisUrl) {
      throw new Error(
        'REDIS_URL is required in production for rate limiting',
      );
    }

    this.redis = redisUrl
      ? new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
          retryStrategy(times) {
            if (!env.isProduction && times > 2) {
              return null;
            }

            return Math.min(times * 100, 2000);
          },
        })
      : null;

    this.redis?.on('error', (error) => {
      if (env.isProduction) {
        console.error(
          '[redis] Rate limiter Redis error:',
          error.message,
        );
      }
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async consume(
    scope: string,
    identifier: string,
    options: LimitOptions,
  ) {
    const cleanIdentifier = this.fingerprint(
      identifier || 'unknown',
    );
    const key = `security-rate:${scope}:${cleanIdentifier}`;

    const count = this.redis
      ? await this.consumeRedisSafe(key, options.windowMs)
      : this.consumeMemory(key, options.windowMs);

    if (count > options.limit) {
      throw new HttpException(
        options.message ||
          'Too many attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  getRequestIp(request: {
    ip?: string;
    socket?: {
      remoteAddress?: string;
    };
  }) {
    return (
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown-ip'
    );
  }

  fingerprint(value: string) {
    return createHash('sha256')
      .update(String(value))
      .digest('hex');
  }

  private async consumeRedisSafe(
    key: string,
    windowMs: number,
  ) {
    try {
      return await this.consumeRedis(key, windowMs);
    } catch (error) {
      if (env.isProduction) {
        throw error;
      }

      return this.consumeMemory(key, windowMs);
    }
  }

  private async consumeRedis(
    key: string,
    windowMs: number,
  ) {
    if (!this.redis) {
      return 1;
    }

    const safeWindowMs = Math.max(
      1,
      Math.floor(windowMs),
    );

    const result = await this.redis.eval(
      atomicRateLimitScript,
      1,
      key,
      String(safeWindowMs),
    );

    const count = Number(result);

    if (!Number.isFinite(count)) {
      throw new Error(
        'Redis rate limiter returned an invalid counter',
      );
    }

    return count;
  }

  private consumeMemory(
    key: string,
    windowMs: number,
  ) {
    const now = Date.now();
    const current = this.memoryStore.get(key);

    if (!current || current.expiresAt <= now) {
      this.memoryStore.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });

      return 1;
    }

    current.count += 1;
    this.memoryStore.set(key, current);

    return current.count;
  }
}