/**
 * A tiny deterministic PRNG for the seed script.
 *
 * The seed script must produce the SAME rows every run (the task's determinism
 * rule), so it never touches Math.random or the wall clock. This is mulberry32
 * — a well-known 32-bit generator: fast, dependency-free, and fully repeatable
 * from a fixed integer seed. It is pure and unit-tested, so the "believable
 * fake data" is also *predictable* fake data.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Keep the state a positive 32-bit integer.
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick one element. Throws on an empty array so a bad fixture fails loudly. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    return items[this.int(0, items.length - 1)];
  }

  /**
   * Pick one element using integer weights (same length as items). Falls back
   * to a uniform pick if the weights are unusable.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new Error("Rng.weighted: empty array");
    const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
    if (total <= 0 || weights.length !== items.length) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i += 1) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** A round-ish integer between min and max, snapped to `step`. */
  roundInt(min: number, max: number, step: number): number {
    const raw = this.int(min, max);
    return Math.round(raw / step) * step;
  }

  /** A deterministic v4-shaped UUID drawn from this generator. */
  uuid(): string {
    const b = new Array<number>(16);
    for (let i = 0; i < 16; i += 1) b[i] = this.int(0, 255);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
    const hex = b.map((x) => x.toString(16).padStart(2, "0"));
    return (
      hex.slice(0, 4).join("") +
      "-" +
      hex.slice(4, 6).join("") +
      "-" +
      hex.slice(6, 8).join("") +
      "-" +
      hex.slice(8, 10).join("") +
      "-" +
      hex.slice(10, 16).join("")
    );
  }
}
