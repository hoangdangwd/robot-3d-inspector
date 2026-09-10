// Phase 4 local coaching validation: contracts, bilingual parser, queue, blackboard.
import assert from 'node:assert/strict';
import { parseCoachText } from '../src/coaching/LocalCommandParser.js';
import { DirectCommandQueue } from '../src/coaching/DirectCommandQueue.js';
import { CombatBlackboard } from '../src/ai/CombatBlackboard.js';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };

console.log('\n── Bilingual local command parser ──');
{
  const jab = parseCoachText('Jab him!', { language: 'en-US', fighterId: 'fighter_a', tick: 10 });
  ok(jab.kind === 'direct_command' && jab.actionId === 'jab', 'English jab becomes DirectCommand');

  const hook = parseCoachText('Đấm móc phải', { language: 'vi-VN', fighterId: 'fighter_a', tick: 11 });
  ok(hook.kind === 'direct_command' && hook.actionId === 'hook_right', 'Vietnamese hook becomes DirectCommand');

  const outside = parseCoachText('Stay outside', { language: 'en-US', fighterId: 'fighter_a', tick: 12 });
  ok(outside.kind === 'blackboard_override' && outside.changes.preferredDistance === 'far', 'English spacing becomes BlackboardOverride');

  const distance = parseCoachText('Giữ khoảng cách', { language: 'vi-VN', fighterId: 'fighter_a', tick: 13 });
  ok(distance.kind === 'blackboard_override' && distance.changes.preferredDistance === 'far', 'Vietnamese spacing becomes BlackboardOverride');

  const body = parseCoachText('Target the body', { language: 'en-US', fighterId: 'fighter_a', tick: 14 });
  ok(body.kind === 'blackboard_override' && body.changes.targetZone === 'body', 'target-zone override is structured data');

  const ambiguous = parseCoachText('Do something clever', { language: 'en-US', fighterId: 'fighter_a', tick: 15 });
  ok(ambiguous.kind === 'unrecognized', 'unknown text is not guessed into a tactic');

  const persistent = parseCoachText('When he hooks, counter body', { language: 'en-US', fighterId: 'fighter_a', tick: 16 });
  ok(persistent.kind === 'unrecognized' && persistent.reason === 'persistent_tactic_not_allowed_live', 'Live Fight cannot create a persistent tactic');
}

console.log('\n── Direct command lifecycle ──');
{
  const queue = new DirectCommandQueue({ maxSize: 2 });
  const first = parseCoachText('jab', { language: 'en-US', fighterId: 'fighter_a', tick: 0 });
  const second = parseCoachText('block', { language: 'en-US', fighterId: 'fighter_a', tick: 0 });
  const third = parseCoachText('dodge', { language: 'en-US', fighterId: 'fighter_a', tick: 0 });
  ok(queue.enqueue(first).status === 'queued', 'first command queued');
  ok(queue.enqueue(second).status === 'queued', 'second command queued');
  ok(queue.enqueue(third).status === 'rejected' && queue.enqueue(third).reason === 'queue_full', 'queue flood is rejected');
  const leased = queue.lease('fighter_a', 0);
  ok(leased.command.actionId === 'jab' && leased.command.status === 'active', 'oldest command is leased first');
  queue.complete(leased.command.commandId, 'executed', 1);
  ok(queue.events().some(event => event.status === 'executed'), 'command outcome is observable');
  const next = queue.lease('fighter_a', 1);
  ok(next.command.actionId === 'guard_high', 'block maps to legal guard action');

  const supersedeQueue = new DirectCommandQueue({ maxSize: 3 });
  const queuedJab = parseCoachText('jab', { language: 'en-US', fighterId: 'fighter_b', tick: 0 });
  const queuedDodge = parseCoachText('dodge', { language: 'en-US', fighterId: 'fighter_b', tick: 1 });
  supersedeQueue.enqueue(queuedJab);
  supersedeQueue.supersedePending('fighter_b');
  supersedeQueue.enqueue(queuedDodge);
  ok(supersedeQueue.pending('fighter_b')[0].actionId === 'roll', 'new direct request supersedes pending request');
  ok(supersedeQueue.events().some(event => event.status === 'superseded'), 'superseded command is observable');
}

console.log('\n── Blackboard lifecycle ──');
{
  const board = new CombatBlackboard({ fighterId: 'fighter_a' });
  const added = board.apply({
    kind: 'blackboard_override', commandId: 'override_1', fighterId: 'fighter_a',
    createdAt: 0, expiresAt: 30,
    changes: { preferredDistance: 'far', aggression: -0.4, targetZone: 'body' },
  });
  ok(added.status === 'active', 'override is accepted');
  const active = board.snapshot(10);
  ok(active.preferredDistance === 'far' && active.targetZone === 'body', 'active values are readable');
  ok(active.aggression < 0, 'numeric bias is applied');
  const expired = board.snapshot(31);
  ok(expired.preferredDistance === 'mid' && expired.targetZone === 'any', 'expired override returns to base');
  ok(board.definitionHash() === board.definitionHash(), 'blackboard does not mutate persistent playbook');
}

console.log(`\nPASS: ${assertions} assertions. Phase 4 local contracts validated.\n`);
