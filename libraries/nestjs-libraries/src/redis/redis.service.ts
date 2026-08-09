import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
  private data: Map<string, any> = new Map();

  async get(key: string) {
    return this.data.get(key);
  }

  async set(key: string, value: any) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    this.data.delete(key);
    return 1;
  }

  async incr(key: string) {
    const next = Number(this.data.get(key) || 0) + 1;
    this.data.set(key, next);
    return next;
  }

  // Nothing here expires, so a counter set by one test would still be there for
  // the next one — `flushall` between tests is what keeps them independent.
  async expire(_key: string, _seconds: number) {
    return 1;
  }

  async flushall() {
    this.data.clear();
    return 'OK';
  }

  // Add other Redis methods as needed for your tests
}

// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
export const ioRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    })
  : (new MockRedis() as unknown as Redis); // Type cast to Redis to maintain interface compatibility
