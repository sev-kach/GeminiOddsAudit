interface CacheEntry<T> {
  promise: Promise<T>;
  createdAt: number;
  settled: boolean;
}

export class TtlPromiseCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  getOrSet(key: string, factory: () => Promise<T>, shouldCacheResult?: (val: T) => boolean): Promise<T> {
    const now = Date.now();
    const existing = this.store.get(key);
    if (existing) {
      if (now - existing.createdAt < this.ttlMs) {
        return existing.promise;
      }
      this.store.delete(key);
    }

    const entry: CacheEntry<T> = {
      promise: Promise.resolve() as unknown as Promise<T>,
      createdAt: now,
      settled: false,
    };

    const promise = factory()
      .then((result) => {
        entry.settled = true;
        if (shouldCacheResult && !shouldCacheResult(result)) {
          if (this.store.get(key) === entry) {
            this.store.delete(key);
          }
        } else {
          entry.createdAt = Date.now();
        }
        return result;
      })
      .catch((err) => {
        if (this.store.get(key) === entry) {
          this.store.delete(key);
        }
        throw err;
      });

    entry.promise = promise;
    this.store.set(key, entry);
    return promise;
  }

  clear(key: string): void {
    this.store.delete(key);
  }
}
