// ─── Direct command queue ──────────────────────────────────────────
// Short-lived requests from Live Fight. Queue state is separate from playbook.

export class DirectCommandQueue {
  constructor({ maxSize = 4 } = {}) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
    this._items = [];
    this._history = [];
  }

  enqueue(command) {
    if (!command || command.kind !== 'direct_command') {
      return { status: 'rejected', reason: 'invalid_command' };
    }
    if (this._items.length >= this.maxSize) {
      this._record(command, 'rejected', 'queue_full');
      return { status: 'rejected', reason: 'queue_full' };
    }
    const item = { ...command, status: 'queued' };
    this._items.push(item);
    this._record(item, 'queued');
    return { status: 'queued', command: item };
  }

  peek(fighterId, tick) {
    this._expire(tick);
    return this._items.find(item => item.fighterId === fighterId) || null;
  }

  lease(fighterId, tick) {
    this._expire(tick);
    const index = this._items.findIndex(item => item.fighterId === fighterId);
    if (index < 0) return { status: 'empty', command: null };
    const [command] = this._items.splice(index, 1);
    command.status = 'active';
    command.leasedAt = tick;
    this._record(command, 'active');
    return { status: 'leased', command };
  }

  complete(commandId, status, tick, reason = null) {
    const allowed = new Set(['executed', 'deferred', 'rejected', 'expired', 'superseded']);
    if (!allowed.has(status)) return false;
    const event = this._history.findLast(item => item.commandId === commandId);
    this._record({ ...(event || { commandId }) , completedAt: tick }, status, reason);
    return true;
  }

  supersedePending(fighterId, reason = 'newer_direct_command') {
    const kept = [];
    for (const item of this._items) {
      if (item.fighterId === fighterId) this._record(item, 'superseded', reason);
      else kept.push(item);
    }
    this._items = kept;
  }

  cancelAll(fighterId, tick, reason = 'cancelled') {
    const kept = [];
    for (const item of this._items) {
      if (item.fighterId === fighterId) this._record(item, 'superseded', reason);
      else kept.push(item);
    }
    this._items = kept;
  }

  expire(tick) { this._expire(tick); }

  clear() { this._items = []; this._history = []; }

  pending(fighterId = null) {
    return this._items.filter(item => fighterId === null || item.fighterId === fighterId)
      .map(item => ({ ...item }));
  }

  events() { return this._history.map(item => ({ ...item })); }

  _expire(tick) {
    const kept = [];
    for (const item of this._items) {
      if (tick >= item.expiresAt) this._record(item, 'expired', 'command_expired');
      else kept.push(item);
    }
    this._items = kept;
  }

  _record(command, status, reason = null) {
    this._history.push({
      commandId: command.commandId,
      fighterId: command.fighterId,
      actionId: command.actionId,
      status,
      reason,
      tick: command.completedAt ?? command.leasedAt ?? command.createdAt ?? 0,
    });
    if (this._history.length > 64) this._history.shift();
  }
}
