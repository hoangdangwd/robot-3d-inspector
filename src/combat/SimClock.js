// ─── Fixed-step Simulation Clock ────────────────────────────────────
// Deterministic tick clock decoupled from render frame rate.
// No Three.js dependency. No network or model calls.

export class SimClock {
  /**
   * @param {object} [opts]
   * @param {number} [opts.tickRate=60]   - simulation ticks per second
   * @param {number} [opts.maxCatchUp=8]  - max ticks per update call (prevents spiral)
   */
  constructor({ tickRate = 60, maxCatchUp = 8 } = {}) {
    /** Seconds per tick */
    this.dt = 1 / tickRate;
    this.tickRate = tickRate;
    this.maxCatchUp = maxCatchUp;

    /** Current simulation tick (integer, starts at 0) */
    this.tick = 0;
    /** Accumulated wall-time not yet consumed (seconds) */
    this.accumulator = 0;
    /** Whether the simulation is paused */
    this.paused = false;
  }

  /**
   * Feed wall-clock delta (seconds) from the render loop.
   * Returns the number of simulation ticks that should be stepped.
   *
   * @param {number} wallDelta - seconds since last call (clamped internally)
   * @returns {number} ticks to step this frame (0 if paused or no time accumulated)
   */
  advance(wallDelta) {
    if (this.paused) return 0;
    // Clamp to avoid spiral after tab-away or debugger pause.
    const clamped = Math.min(Math.max(wallDelta, 0), this.maxCatchUp * this.dt);
    this.accumulator += clamped;

    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxCatchUp) {
      this.accumulator -= this.dt;
      this.tick++;
      steps++;
    }
    return steps;
  }

  /** Fraction of a tick remaining (for render interpolation, 0..1). */
  get alpha() {
    return this.accumulator / this.dt;
  }

  /** Current simulation time in seconds (tick × dt). */
  get time() {
    return this.tick * this.dt;
  }

  pause()  { this.paused = true; }
  resume() { this.paused = false; }

  /**
   * Reset to tick 0, clear accumulator.
   * Does NOT change pause state.
   */
  reset() {
    this.tick = 0;
    this.accumulator = 0;
  }
}
