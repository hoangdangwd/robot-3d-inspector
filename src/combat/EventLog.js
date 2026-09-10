// ─── Combat Event Log ───────────────────────────────────────────────
// Ring-buffer for validated CombatEvents.
// Bounded memory. Export-friendly. No Three.js dependency.

import { createCombatEvent } from './CombatTypes.js';

export class EventLog {
  /**
   * @param {number} [capacity=2048] - max events before oldest are evicted
   */
  constructor(capacity = 2048) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`EventLog capacity must be a positive integer, got ${capacity}`);
    }
    /** @type {Array<Readonly<import('./CombatTypes.js').CombatEvent>>} */
    this._buffer = new Array(capacity);
    this._capacity = capacity;
    this._head = 0;   // next write index
    this._count = 0;  // total events stored
    this._total = 0;  // total events ever pushed (monotonic)
  }

  /** Number of events currently stored. */
  get length() { return this._count; }

  /** Total events ever pushed (including evicted). */
  get total() { return this._total; }

  /** Maximum capacity before eviction. */
  get capacity() { return this._capacity; }

  /**
   * Push a validated event. Validates through createCombatEvent.
   * @param {object} raw
   * @returns {Readonly<import('./CombatTypes.js').CombatEvent>}
   */
  push(raw) {
    const event = createCombatEvent(raw);
    this._buffer[this._head] = event;
    this._head = (this._head + 1) % this._capacity;
    if (this._count < this._capacity) this._count++;
    this._total++;
    return event;
  }

  /**
   * Read event at logical index (0 = oldest stored).
   * @param {number} index
   * @returns {Readonly<import('./CombatTypes.js').CombatEvent>|undefined}
   */
  at(index) {
    if (index < 0 || index >= this._count) return undefined;
    const start = this._count < this._capacity
      ? 0
      : this._head; // head points to oldest when full
    return this._buffer[(start + index) % this._capacity];
  }

  /**
   * Get the most recent event.
   * @returns {Readonly<import('./CombatTypes.js').CombatEvent>|undefined}
   */
  last() {
    return this._count > 0 ? this.at(this._count - 1) : undefined;
  }

  /**
   * Iterate all stored events oldest-first.
   * @returns {Generator<Readonly<import('./CombatTypes.js').CombatEvent>>}
   */
  *[Symbol.iterator]() {
    for (let i = 0; i < this._count; i++) {
      yield this.at(i);
    }
  }

  /**
   * Return all stored events as an array (oldest-first).
   * @returns {Array<Readonly<import('./CombatTypes.js').CombatEvent>>}
   */
  toArray() {
    return [...this];
  }

  /**
   * Return events pushed after a monotonic total-event cursor.
   * If the cursor is older than the retained ring buffer, only retained events
   * are returned; callers can detect loss by comparing `fromTotal`.
   * @param {number} totalCursor
   * @returns {{ events: Array<object>, fromTotal: number, toTotal: number, lost: boolean }}
   */
  after(totalCursor = 0) {
    const cursor = Number.isFinite(totalCursor) ? Math.max(0, Math.floor(totalCursor)) : 0;
    const firstRetainedTotal = this._total - this._count;
    const startTotal = Math.max(cursor, firstRetainedTotal);
    const startIndex = startTotal - firstRetainedTotal;
    return {
      events: this.toArray().slice(startIndex),
      fromTotal: startTotal,
      toTotal: this._total,
      lost: cursor < firstRetainedTotal,
    };
  }

  /**
   * Export stored events + metadata for replay/debug.
   * @returns {{ seed?: number, events: object[], total: number }}
   */
  export(seed) {
    return {
      ...(seed !== undefined ? { seed } : {}),
      total: this._total,
      events: this.toArray(),
    };
  }

  /** Clear all events. */
  clear() {
    this._buffer.fill(undefined);
    this._head = 0;
    this._count = 0;
    this._total = 0;
  }
}
