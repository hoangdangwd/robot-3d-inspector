import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RobotFactory } from '../src/robots/RobotFactory.js';
import { createRobotAnimations } from '../src/robots/RobotAnimations.js';
import { Fighter } from '../src/combat/Fighter.js';
import { ROBOT_CATALOG, R15_PART_NAMES } from '../src/robots/robotCatalog.js';

assert.equal(ROBOT_CATALOG.length, 5);
assert.equal(new Set(ROBOT_CATALOG.map(r => r.id)).size, 5);
const signatures = new Set();
for (const robot of ROBOT_CATALOG) {
  const assembly = RobotFactory.create(robot);
  assert.deepEqual(Object.keys(assembly.parts).sort(), [...R15_PART_NAMES].sort());
  assembly.root.traverse(node => assert.ok(!node.isBone && !node.isSkinnedMesh));
  const bounds = new THREE.Box3().setFromObject(assembly.root);
  assert.ok(Math.abs(bounds.min.y) < 0.001, 'feet start on floor');
  assert.ok(Math.abs(bounds.max.y - robot.proportions.height) < 0.01, 'authored height');
  for (const value of Object.values(robot.stats)) assert.ok(value >= 0 && value <= 100);
  const clips = createRobotAnimations(robot);
  assert.equal(clips.length, 40);
  signatures.add(JSON.stringify(clips[4].tracks.map(t => Array.from(t.values))));
  for (const clip of clips) {
    assert.ok(clip.validate());
    assert.equal(clip.tracks.filter(t => t.name.endsWith('.quaternion')).length, 15, 'every clip owns a full pose');
    assert.ok(clip.userData.description);
    for (const track of clip.tracks) {
      const stride = track.getValueSize();
      for (let component = 0; component < stride && ['cycle', 'repeatable'].includes(clip.userData.playback); component++) {
        assert.ok(Math.abs(track.values[component] - track.values[track.values.length - stride + component]) < 1e-6, 'loop returns to the authored stance');
      }
      assert.ok(track.values.every(Number.isFinite));
      assert.ok(!track.name.endsWith('.scale'));
      assert.ok(assembly.parts[track.name.split('.')[0]]);
    }
  }
  const fighter = Fighter.fromFactory(robot, assembly, { platformY: 0 });
  for (let i = 0; i < clips.length; i++) {
    fighter.playAnimation(`clip_${i}`);
    fighter.update(0.3);
    fighter.stepFrame(1);
    const time = fighter.getCurrentTime();
    fighter.update(0.2);
    assert.equal(fighter.getCurrentTime(), time, 'frame stepping pauses playback');
    fighter.scrubToTime(fighter.getDuration() * 0.5);
    const pose = R15_PART_NAMES.flatMap(name => fighter.parts[name].quaternion.toArray());
    fighter.update(0.1);
    assert.deepEqual(R15_PART_NAMES.flatMap(name => fighter.parts[name].quaternion.toArray()), pose);
    fighter.resume();
    fighter.update(0.1);
    assert.ok(fighter.getCurrentTime() !== fighter.getDuration() * 0.5);
    // Sample the whole clip, not just its initial frame. Feet cannot sink into
    // the studio floor, and rigid parts retain unit local scale everywhere.
    for (let sample = 0; sample <= 24; sample++) {
      fighter.scrubToTime(fighter.getDuration() * sample / 24);
      for (const name of R15_PART_NAMES) {
        assert.deepEqual(fighter.parts[name].scale.toArray(), [1, 1, 1]);
        assert.ok(fighter.parts[name].matrixWorld.elements.every(Number.isFinite));
      }
      let lowest = Infinity;
      const vertex = new THREE.Vector3();
      for (const foot of [fighter.parts.LeftFoot, fighter.parts.RightFoot]) {
        for (const shell of foot.children) {
          const attribute = shell.geometry.attributes.position;
          for (let v = 0; v < attribute.count; v++) {
            vertex.fromBufferAttribute(attribute, v).applyMatrix4(shell.matrixWorld);
            lowest = Math.min(lowest, vertex.y);
          }
        }
      }
      if (clips[i].userData.grounding === 'body') {
        const minY = new THREE.Box3().setFromObject(fighter.root, true).min.y;
        assert.ok(Math.abs(minY) < .006, `body floor contact ${robot.id}/${i}: ${minY}`);
      } else assert.ok(lowest >= -0.006 && lowest < 0.06, `ground contact ${robot.id}/${i}: ${lowest}`);
    }
  }
  fighter.setLoop(false);
  fighter.playAnimation('clip_2', { crossFade: 0 });
  fighter.update(fighter.getDuration() + 1);
  assert.equal(fighter.isPaused, true, 'one-shot completion pauses');
  fighter.resume(); fighter.update(0.1);
  assert.ok(fighter.getCurrentTime() < fighter.getDuration(), 'resume replays completed one-shot');
  fighter.dispose();
}
assert.equal(signatures.size, 5, 'signatures must differ in motion, not only names or duration');
console.log('PASS: 5 fighters; 15 rigid pivots each; 200 full-pose clips; 5 distinct signature trajectories; pause/seek/step.');
