// ─── Seeded PRNG ────────────────────────────────────────────────────
// Deterministic random number generator isolated from Math.random().
// Uses a 32-bit xoshiro128** variant for speed and reproducibility.
// No Three.js dependency. No side effects on global state.

export class SeededRNG {
  /**
   * @param {number} seed - unsigned 32-bit integer seed
   */
  constructor(seed) {
    // splitmix32 to expand a single seed into four state words
    seed = seed >>> 0;
    const sm = (s) => { s = (s + 0x9e3779b9) >>> 0; let t = s ^ (s >>> 16); t = Math.imul(t, 0x21f0aaad); t = t ^ (t >>> 15); t = Math.imul(t, 0x735a2d97); return (t ^ (t >>> 15)) >>> 0; };
    this.s = new Uint32Array([sm(seed), sm(seed + 1), sm(seed + 2), sm(seed + 3)]);
    // Ensure at least one bit is set
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[3] = 1;
    this._seed = seed;
    this._calls = 0;
  }

  /** @returns {number} unsigned 32-bit integer */
  nextU32() {
    const s = this.s;
    let result = Math.imul(s[1] * 5, 1) << 7 | (Math.imul(s[1] * 5, 1) >>> 25);
    result = Math.imul(result, 9);
    result = result >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11 | s[3] >>> 21);
    this._calls++;
    return result;
  }

  /** @returns {number} float in [0, 1) */
  next() {
    return this.nextU32() / 0x100000000;
  }

  /**
   * Integer in [min, max] inclusive.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    if (min > max) return min;
    return min + (this.nextU32() % (max - min + 1));
  }

  /**
   * Float in [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextFloat(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * Pick a random element from an array.
   * @template T
   * @param {T[]} arr
   * @returns {T|undefined}
   */
  pick(arr) {
    if (!arr.length) return undefined;
    return arr[this.nextU32() % arr.length];
  }

  /** The original seed used to construct this instance. */
  get seed() { return this._seed; }

  /** Number of values consumed so far. */
  get calls() { return this._calls; }

  /**
   * Create a new RNG with the same seed, replaying to the same position.
   * Useful for deterministic test replay.
   * @returns {SeededRNG}
   */
  clone() {
    const c = new SeededRNG(0);
    c.s.set(this.s);
    c._seed = this._seed;
    c._calls = this._calls;
    return c;
  }

  /** Fork a child RNG with a derived seed (does not consume parent sequence). */
  fork() {
    return new SeededRNG(this._seed ^ (this._calls * 2654435761 >>> 0));
  }
}
