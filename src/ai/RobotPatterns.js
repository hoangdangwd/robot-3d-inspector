// Built-in personality habits, not player playbook entries. Sequence data uses
// the existing tactic schema/runtime; the coordinator only adds execution ACKs.
import { validateTactic } from '../tactics/TacticSchema.js';

const volt = validateTactic({
  schemaVersion: 1, id: 'volt_one_two', name: 'Volt one-two',
  goal: 'Probe with left jab, follow with right cross if still feasible.',
  priority: .78, trigger: { type: 'always' },
  phases: [{ id: 'one_two', sequence: [{ actionId: 'jab' }, { actionId: 'cross' }] }],
  abort: [], repeatLimit: 1, timeoutTicks: 120,
});
if (!volt.ok) throw new Error(volt.errors.join('; '));
export const VOLT_ONE_TWO = Object.freeze({
  tactic: volt.value, chance: .65, cooldownTicks: 150, retryTicks: 36,
  settleTicks: 18, minStaminaRatio: .35,
});
export function getRobotPattern(definitionId) {
  return definitionId.replace(/-/g, '_') === 'volt_kestrel' ? VOLT_ONE_TWO : null;
}
