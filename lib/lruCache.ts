/**
 * Minimal LRU map for the session-lifetime ephemeris caches. Reads refresh
 * recency; inserts beyond the capacity evict the least-recently-used entry.
 * Exists so module-level caches (sky-calendar months, electional day scans)
 * stay bounded however long a session browses — entries are small, so the
 * caps are generous rather than tight.
 */
export class LruMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("LruMap capacity must be >= 1");
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Map iteration is insertion-ordered — re-inserting marks recency.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value as K);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
