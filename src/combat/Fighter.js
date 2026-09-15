import * as THREE from 'three';
import { createRobotAnimations } from '../robots/RobotAnimations.js';

// Presentation only. Future combat simulation supplies legal animation intents;
// this inspector never applies damage or decides hit outcomes.
export class Fighter {
  constructor(definition, { root, parts, materials, initialPos, platformY = 0, facingAngle = 0 } = {}) {
    this.definition = definition;
    this.root = root; this.parts = parts; this.materials = materials;
    this.group = new THREE.Group();
    this.group.position.copy(initialPos || new THREE.Vector3(0, platformY, 0));
    this.group.rotation.y = facingAngle;
    this.group.add(root);
    this.baseRootY = root.position.y;
    this.baseRootPosition = root.position.clone();
    this.mixer = new THREE.AnimationMixer(root);
    this.animations = createRobotAnimations(definition);
    this.actions = new Map();
    this.isPaused = false; this.loopEnabled = true; this.playbackSpeed = 1;
    this.tmpBox = new THREE.Box3();
    this.solePoint = new THREE.Vector3();
    this.supportAnchor = new THREE.Vector3();
    this.supportAnchors = new Map();
    this.clipList = this.animations.map((clip, index) => {
      const meta = { ...clip.userData, key: `clip_${index}`, index, duration: clip.duration };
      this.actions.set(meta.key, { clip, meta, action: this.mixer.clipAction(clip) });
      return meta;
    });
    // Cache deterministic, group-local toe anchors at each clip's entry pose.
    // Never capture a world anchor from the previous action: that accumulates
    // drift on switches and pins a moving/turning simulation fighter in space.
    for (const { action, meta } of this.actions.values()) {
      if (!meta.support) continue;
      action.reset().play();
      this.mixer.update(0);
      this.root.position.copy(this.baseRootPosition);
      this.group.updateMatrixWorld(true);
      this.solePoint.set(0, 0, definition.proportions.foot[2] * .3);
      this.parts[meta.support].localToWorld(this.solePoint);
      this.group.worldToLocal(this.solePoint);
      this.supportAnchors.set(meta.id, this.solePoint.clone());
      action.stop();
    }
    this.mixer.addEventListener('finished', event => {
      if (event.action === this.currentAction) this.isPaused = true;
    });
    this.playAnimation('clip_0', { crossFade: 0 });
  }

  static fromFactory(definition, assembly, options = {}) {
    return new Fighter(definition, { ...assembly, ...options });
  }

  playAnimation(key, { crossFade = 0.09 } = {}) {
    const entry = this.actions.get(key) || [...this.actions.values()].find(e => e.meta.id === key);
    if (!entry) return false;
    const previous = this.currentAction;
    // Retire old fades on rapid switches. Only two actions can influence a pose.
    for (const { action } of this.actions.values()) {
      if (action !== previous && action !== entry.action) action.stop();
    }
    const action = entry.action;
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    const repeatable = ['cycle', 'repeatable'].includes(entry.meta.playback);
    action.setLoop(this.loopEnabled && repeatable ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.play();
    if (previous && previous !== action) {
      // Do not blend unrelated standing/down poses when inspecting state clips.
      if (this.currentMeta?.exit !== entry.meta.entry) crossFade = 0;
      if (crossFade > 0) previous.crossFadeTo(action, crossFade, false);
      else previous.stop();
    }
    this.currentAction = action;
    this.currentClip = entry.clip;
    this.currentCombatPhase = null;
    this.currentMeta = entry.meta;
    this.currentClipName = entry.meta.key;
    this.isPaused = false;
    this.mixer.update(0);
    this.groundFeet();
    return true;
  }

  pause() { this.isPaused = true; }
  resume() {
    if (this.getCurrentTime() >= this.getDuration()) this.currentAction.time = 0;
    this.currentAction.paused = false;
    this.isPaused = false;
  }
  togglePlayPause() {
    if (this.isPaused) this.resume(); else this.pause();
    return !this.isPaused;
  }

  scrubToTime(seconds) {
    if (!Number.isFinite(seconds)) return;
    this.pause();
    for (const { action } of this.actions.values()) {
      action.stopFading(); action.stopWarping();
      if (action !== this.currentAction) action.stop();
    }
    this.currentAction.enabled = true;
    this.currentAction.paused = false;
    this.currentAction.setEffectiveWeight(1).setEffectiveTimeScale(1);
    this.currentAction.time = THREE.MathUtils.clamp(seconds, 0, this.getDuration());
    this.mixer.update(0);
    this.groundFeet();
  }

  stepFrame(direction = 1, fps = 30) {
    this.scrubToTime(this.getCurrentTime() + direction / fps);
  }
  setPlaybackSpeed(speed) {
    if (!Number.isFinite(speed) || speed <= 0 || speed > 4) return;
    this.playbackSpeed = speed;
    this.mixer.timeScale = speed;
  }

  /**
   * Put a combat clip at the simulation's current phase instead of restarting
   * it every time STARTUP/ACTIVE/RECOVERY changes. The simulation owns the
   * timing; this only maps that timing onto the authored anticipation/contact/
   * recoil performance.
   */
  syncCombatAnimation(key, phase, phaseTick, phaseDuration, phaseBoundaries) {
    const entry = this.actions.get(key) || [...this.actions.values()].find(e => e.meta.id === key);
    if (!entry) return false;
    if (this.currentMeta?.id !== entry.meta.id) this.playAnimation(entry.meta.id, { crossFade: 0 });

    phaseBoundaries ||= entry.meta.phases || { startup: .40, active: .48 };
    const safeDuration = Math.max(1, phaseDuration);
    const progress = THREE.MathUtils.clamp(phaseTick / safeDuration, 0, 1);
    let normalized;
    if (phase === 'startup') normalized = phaseBoundaries.startup * progress;
    else if (phase === 'active') {
      const start = phaseBoundaries.startup;
      const end = phaseBoundaries.active;
      normalized = start + (end - start) * progress;
    } else if (phase === 'recovery') {
      const start = phaseBoundaries.active;
      normalized = start + (1 - start) * progress;
    } else normalized = progress;

    // scrubToTime leaves wall-clock playback paused. Advancing the mixer again
    // in FightMode would move the pose ahead of its authoritative phase tick.
    this.scrubToTime(normalized * this.currentClip.duration);
    this.currentCombatPhase = phase;
    return true;
  }
  setLoop(loop) {
    this.loopEnabled = Boolean(loop);
    const repeatable = ['cycle', 'repeatable'].includes(this.currentMeta.playback);
    this.currentAction.setLoop(this.loopEnabled && repeatable ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  }
  getCurrentTime() { return this.currentAction.time; }
  getDuration() { return this.currentClip.duration; }
  getFrameIndex(fps = 30) { return Math.floor(this.getCurrentTime() * fps); }
  getTotalFrames(fps = 30) { return Math.round(this.getDuration() * fps); }
  getPartCount() { return Object.keys(this.parts).length; }
  getHeadPos() { return this.parts.Head.getWorldPosition(new THREE.Vector3()); }
  getChestPos() { return this.parts.UpperTorso.getWorldPosition(new THREE.Vector3()); }
  getBounds() { return this.tmpBox.setFromObject(this.group); }

  groundFeet() {
    this.root.position.copy(this.baseRootPosition);
    this.group.updateMatrixWorld(true);
    const anchor = this.supportAnchors.get(this.currentMeta?.id);
    if (anchor && this.currentMeta?.grounding !== 'body') {
      this.solePoint.set(0, 0, this.definition.proportions.foot[2] * .3);
      this.parts[this.currentMeta.support].localToWorld(this.solePoint);
      this.group.worldToLocal(this.solePoint);
      this.root.position.x += anchor.x - this.solePoint.x;
      this.root.position.z += anchor.z - this.solePoint.z;
      this.group.updateMatrixWorld(true);
    }
    if (this.currentMeta?.grounding === 'body') {
      // Falling cannot be grounded by the soles: that would lift a horizontal
      // body into the air. Bounds are only used for the three down-state clips.
      this.tmpBox.setFromObject(this.root, true);
      this.root.position.y += this.group.position.y - this.tmpBox.min.y;
      this.group.updateMatrixWorld(true);
      return;
    }
    const [w, h, d] = this.definition.proportions.foot;
    let lowest = Infinity;
    // Sample actual bevelled sole corners (not the joint origin). This keeps
    // crouches planted without dragging the raised knee back to the ground.
    for (const side of ['LeftFoot', 'RightFoot']) {
      for (const x of [-w / 2, w / 2]) for (const z of [-d * 0.30, d * 0.70]) {
        this.solePoint.set(x, -h * 0.99 - Math.min(w, h * 0.48, d) * 0.075, z);
        this.parts[side].localToWorld(this.solePoint);
        lowest = Math.min(lowest, this.solePoint.y);
      }
    }
    this.root.position.y += this.group.position.y - lowest;
    this.group.updateMatrixWorld(true);
  }

  update(delta) {
    if (!this.isPaused) {
      this.mixer.update(delta);
      this.groundFeet();
    }
  }

  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root);
    const geometries = new Set();
    this.root.traverse(node => { if (node.geometry) geometries.add(node.geometry); });
    geometries.forEach(g => g.dispose());
    Object.values(this.materials).forEach(m => m.dispose());
  }
}
