// ─── Match Time-out lifecycle ──────────────────────────────────────
// Three scarce tactical editing windows per match. No UI or network state.

export const MAX_TIMEOUTS_PER_MATCH = 3;

export class TimeOutManager {
  constructor({ max = MAX_TIMEOUTS_PER_MATCH } = {}) {
    this.max = Math.max(1, Math.floor(max));
    this.reset();
  }

  open(tick = 0) {
    if (this.active) return { ok: false, error: 'already_open' };
    if (this.remaining <= 0) return { ok: false, error: 'no_timeouts_remaining' };
    this.remaining--;
    this.active = {
      id: `timeout_${this.max - this.remaining}`,
      openedAtTick: tick,
      status: 'open',
    };
    return { ok: true, timeout: { ...this.active }, remaining: this.remaining };
  }

  cancel() {
    if (!this.active) return { ok: false, error: 'not_open' };
    const closed = { ...this.active, status: 'cancelled' };
    this.active = null;
    return { ok: true, timeout: closed, remaining: this.remaining };
  }

  commit() {
    if (!this.active) return { ok: false, error: 'not_open' };
    const closed = { ...this.active, status: 'committed' };
    this.active = null;
    return { ok: true, timeout: closed, remaining: this.remaining };
  }

  reset() {
    this.remaining = this.max;
    this.active = null;
  }

  isPaused() { return Boolean(this.active); }

  snapshot() {
    return {
      max: this.max,
      remaining: this.remaining,
      active: this.active ? { ...this.active } : null,
    };
  }
}
