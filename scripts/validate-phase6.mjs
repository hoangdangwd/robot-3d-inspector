// Phase 6 timeout lifecycle and review/commit domain validation.
import assert from 'node:assert/strict';
import { TimeOutManager } from '../src/match/TimeOutManager.js';
import { PlaybookStore } from '../src/tactics/PlaybookStore.js';
import { validateTactic } from '../src/tactics/TacticSchema.js';
import { validateTacticPatch, applyTacticPatch } from '../src/tactics/TacticPatch.js';

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const tactic = {
  schemaVersion: 1, id: 'corner-escape', name: 'Corner Escape', goal: 'Leave the edge safely.',
  trigger: { type: 'near_edge' }, phases: [{ id: 'escape', sequence: [{ actionId: 'slip_left' }, { actionId: 'jab' }], branches: [] }],
  abort: [], repeatLimit: 1, timeoutTicks: 120,
};

console.log('\n── Time-out economy ──');
{
  const manager = new TimeOutManager();
  ok(manager.snapshot().remaining === 3, 'match starts with three Time-outs');
  const first = manager.open(42);
  ok(first.ok && first.remaining === 2 && manager.isPaused(), 'opening consumes one and pauses match');
  ok(!manager.open(43).ok, 'double open is rejected');
  const cancelled = manager.cancel();
  ok(cancelled.ok && cancelled.remaining === 2, 'cancel does not refund Time-out');
  ok(manager.open(50).ok, 'second Time-out can open');
  ok(manager.commit().ok && manager.snapshot().remaining === 1, 'commit closes active Time-out');
  ok(manager.open(60).ok && manager.commit().ok, 'third Time-out can be committed');
  ok(!manager.open(70).ok && manager.open(70).error === 'no_timeouts_remaining', 'fourth Time-out is rejected');
  manager.reset();
  ok(manager.snapshot().remaining === 3 && !manager.isPaused(), 'match reset restores three Time-outs');
}

console.log('\n── Review before commit ──');
{
  const validated = validateTactic(tactic);
  const store = new PlaybookStore({ capacity: 8 });
  const before = store.snapshot();
  const draft = structuredClone(validated.value);
  draft.name = 'Corner Escape Revised';
  ok(before.revision === 0 && store.snapshot().revision === 0, 'draft is separate from committed playbook');
  const invalid = store.commit([{ ...draft, phases: [{ id: 'bad', sequence: [{ actionId: 'not_real' }], branches: [] }] }], 0);
  ok(!invalid.ok && store.snapshot().revision === 0, 'invalid review cannot commit or partially mutate');
  const committed = store.commit([draft], 0);
  ok(committed.ok && committed.revision === 1 && committed.tactics[0].name === 'Corner Escape Revised', 'reviewed valid draft commits atomically');
  ok(store.commit([draft], 0).error === 'revision_conflict', 'stale commit cannot overwrite reviewed version');

  const patch = validateTacticPatch({ baseRevision: 1, operations: [{ type: 'replace_sequence', actionIds: ['slip_left', 'body_cross'] }] }, { baseRevision: 1 });
  ok(patch.ok, 'review patch accepts bounded operations');
  const patched = applyTacticPatch(committed.tactics[0], patch.value);
  ok(patched.ok && patched.value.phases[0].sequence[1].actionId === 'body_cross', 'review patch produces a new draft definition');
  ok(!validateTacticPatch({ baseRevision: 0, operations: [] }, { baseRevision: 1 }).ok, 'stale patch is rejected');
  ok(!validateTacticPatch({ baseRevision: 1, operations: [{ type: 'unknown_code', value: 'eval(1)' }] }, { baseRevision: 1 }).ok, 'untrusted patch operation is rejected');
}

console.log('\nPASS: ' + assertions + ' assertions. Phase 6 lifecycle validated.\n');
