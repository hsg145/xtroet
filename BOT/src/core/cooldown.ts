/** Per-user and global cooldowns, all in-memory. */
export class CooldownMap {
  private last = new Map<number, number>();
  private ttlMs: number;

  constructor(ttlMs: number, maxEntries = 50_000) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  private maxEntries: number;

  /** true when the key is allowed now (and consumes the slot). */
  take(key: number, now = Date.now()): boolean {
    this.sweep(now);
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.ttlMs) return false;
    this.last.set(key, now);
    return true;
  }

  /** Read-only check. */
  allows(key: number, now = Date.now()): boolean {
    const prev = this.last.get(key);
    return prev === undefined || now - prev >= this.ttlMs;
  }

  reset(key: number): void {
    this.last.delete(key);
  }

  private sweep(now: number): void {
    if (this.last.size <= this.maxEntries) return;
    for (const [k, v] of this.last) {
      if (now - v > this.ttlMs) this.last.delete(k);
    }
    if (this.last.size > this.maxEntries) {
      const entries = [...this.last.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < entries.length / 2; i++) this.last.delete(entries[i]![0]);
    }
  }

  get size(): number {
    return this.last.size;
  }
}