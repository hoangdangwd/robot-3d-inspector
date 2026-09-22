import * as THREE from 'three';
import { ShowcaseStudio } from './arena/ShowcaseStudio.js';
import { FightingStage } from './arena/FightingStage.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { FightCameraController } from './camera/FightCameraController.js';
import { Fighter } from './combat/Fighter.js';
import { CombatHUD } from './ui/CombatHUD.js';
import { FightMode } from './combat/FightMode.js';
import { getAction } from './combat/ActionRegistry.js';
import { ARENA_RADIUS } from './combat/CombatRules.js';
import { parseCoachText } from './coaching/LocalCommandParser.js';
import { parseSandboxCommand, parseSandboxPlanCommand } from './sandbox/SandboxCommandParser.js';
import { SandboxMode } from './sandbox/SandboxMode.js';
import * as SANDBOX_RULES from './sandbox/SandboxRules.js';
import { VoiceCoachController } from './coaching/VoiceCoachController.js';
import { validateTactic, validateTacticV2, validatePlaybook } from './tactics/TacticSchema.js';
import { validateTacticPatch, applyTacticPatch } from './tactics/TacticPatch.js';
import { RobotFactory } from './robots/RobotFactory.js';
import { ROBOT_CATALOG, getRobotDefinition } from './robots/robotCatalog.js';
import { MatchPersistence } from './persistence/MatchPersistence.js';
import { ReplayPlayer } from './match/ReplayPlayer.js';
import { createMatchSetup, pickRandomOpponent, resolveFighterLabels, resolveMatchOutcome } from './match/MatchSetup.js';

class RobotFoundryApp {
  constructor() {
    this.timer      = new THREE.Timer();
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.currentFps  = 0;
    this.hudElapsed  = 0;
    this.persistence = new MatchPersistence();
    const settings = this.persistence.loadSettings();
    this.speed = settings.speed;
    this.loop  = settings.loop;
    this.gridVisible = settings.gridVisible;
    this.reducedMotion = settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._lastSavedResultKey = '';
    this.activeRobotId = ROBOT_CATALOG[0].id;
    /** @type {'showcase'|'vs_setup'|'fight'|'replay'|'sandbox'} */
    this.mode = 'showcase';
    this.fightMode = null;
    this.sandboxMode = null;
    this.fightStage = null;
    this.replayPlayer = null;
    this.matchSetup = null;
    this._selectedOpponentId = null;
    this._coachRequestVersion = 0;
    this._timeoutDraft = null;
    this._timeoutPlaybookDraft = [];
    this._timeoutBaseRevision = 0;
    this._testSeed = 2026;
    this._testPaused = false;

    // ── Renderer ────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    // ── Scene / camera ──────────────────────────────────────────
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);

    // ── Studio (lighting + plinth, no dark background) ──────────
    this.studio = new ShowcaseStudio(this.scene, this.renderer);
    this.studio.setGridVisible(this.gridVisible);

    // ── Audio ───────────────────────────────────────────────────
    this.sound = new SoundEngine();

    // ── Camera controller ───────────────────────────────────────
    this.cameraController = new FightCameraController(this.camera, this.renderer.domElement);
    const controls = this.cameraController.controls;
    controls.minDistance    = 2.2;
    controls.maxDistance    = 28;
    controls.enablePan      = false;
    controls.autoRotateSpeed = 1.4;
    controls.maxPolarAngle  = Math.PI * 0.51;
    controls.minPolarAngle  = 0.35;

    // ── HUD (builds DOM including #canvas-container) ─────────────
    this.hud = new CombatHUD({
      onSelectClip:    key      => this.selectClip(key),
      onRobotChange:   id       => this.switchRobot(id),
      onScrub:         fraction => { this.fighter.scrubToTime(fraction * this.fighter.getDuration()); this.syncHUD(); },
      onTogglePlay:    ()       => { const playing = this.fighter.togglePlayPause(); this.syncHUD(); return playing; },
      onStepFrame:     dir      => { this.fighter.stepFrame(dir); this.syncHUD(); },
      onSpeedChange:   speed    => { this.speed = speed; this.persistence.saveSettings({ speed }); if (this.fighter) this.fighter.setPlaybackSpeed(speed); },
      onLoopToggle:    loop     => { this.loop = loop; this.persistence.saveSettings({ loop }); if (this.fighter) this.fighter.setLoop(loop); },
      onResetCamera:   ()       => this.resetCamera(),
      onTurntableToggle: ()     => this.cameraController.toggleTurntable(),
      onGridToggle:    visible  => { this.gridVisible = visible; this.persistence.saveSettings({ gridVisible: visible }); this.studio.setGridVisible(visible); },
      onFightToggle:   ()       => this.toggleFightMode(),
      onFightReset:    ()       => this.resetFightMode(),
      onSandboxToggle: ()       => this.toggleSandboxMode(),
      onSandboxReset:  ()       => this.resetSandboxMode(),
      onSandboxCommand:(text, language) => this.handleSandboxCommand(text, language),
      onChangeOpponent: ()      => {
        this.exitFightMode();
        this.openVsSetup();
      },
      onBackToLab:     ()       => this.exitFightMode(),
      onCoachText:     (text, language) => this.handleCoachText(text, language),
      onCoachLanguage: language => { this.persistence.saveSettings({ language }); this.voiceCoach?.setLanguage(language); },
      onVoiceToggle:   () => this.voiceCoach?.toggle(),
      onTimeoutOpen:   () => this.openTimeoutEditor(),
      onTimeoutCancel: () => this.cancelTimeoutEditor(),
      onTimeoutPreview: draft => this.previewTimeoutDraft(draft),
      onTimeoutDraftChanged: () => this.invalidateTimeoutDraftReview(),
      onTimeoutSelect: id => this.selectTimeoutTactic(id),
      onTimeoutNew: () => this.createTimeoutTactic(),
      onTimeoutDelete: () => this.deleteTimeoutTactic(),
      onTimeoutSuggest: prompt => this.requestTacticPatch(prompt),
      onTimeoutCommit: () => this.commitTimeoutDraft(),
      onReplayExport: () => this.exportCurrentReplay(),
      onOpenHistory: () => this.openHistory(),
      onClearHistory: () => {
        this.persistence.clearResults();
        this.persistence.clearReplays();
        this.openHistory();
        this.hud.showToast('HISTORY CLEARED');
      },
      onWatchLastReplay: () => this.watchLastMatchReplay(),
      onStartReplay: replay => this.startReplay(replay),
      onExportSavedReplay: replay => this.downloadReplay(replay),
      onReplayImportFile: text => this.importReplayFile(text),
      onReplayImportError: error => this.hud.showToast(`IMPORT FAILED: ${String(error).toUpperCase()}`),
      onReplayTogglePlay: () => this.replayPlayer?.togglePlay(),
      onReplayStep: ticks => this.replayPlayer?.step(ticks),
      onReplayScrub: tick => this.replayPlayer?.seekToTick(tick),
      onReplaySpeed: speed => this.replayPlayer?.setSpeed(speed),
      onReplayExit: () => this.stopReplay(),
    });

    this.hud.applySettings(settings);

    this.voiceCoach = new VoiceCoachController({
      language: settings.language,
      onFinal: (text, language) => this.mode === 'sandbox'
        ? this.handleSandboxCommand(text, language)
        : this.handleCoachText(text, language),
      onInterim: text => this.mode === 'sandbox'
        ? this.hud.setSandboxFeedback(`HEARING · ${text}`)
        : this.hud.setCoachFeedback(`HEARING · ${text}`),
      onStatus: status => {
        this.hud.setVoiceState(status);
        if (this.mode === 'sandbox') this.hud.setSandboxFeedback(`VOICE · ${String(status).toUpperCase()}`);
      },
    });

    this.hud.populateRobotCatalog(ROBOT_CATALOG, this.activeRobotId);

    // canvas-container is now in DOM (injected by CombatHUD); attach renderer.
    this.container = document.getElementById('canvas-container');
    this.container.appendChild(this.renderer.domElement);

    // Anchor element for resizing
    this.viewport = document.getElementById('viewport-host');

    this.resizeViewport();
    this.switchRobot(this.activeRobotId, false);

    // After first robot is built, render portrait thumbnails for all
    this._renderPortraits();

    this.resizeObserver = new ResizeObserver(() => this.resizeViewport());
    this.resizeObserver.observe(this.viewport);
    window.addEventListener('resize', () => this.resizeViewport());
    document.addEventListener('visibilitychange', () => this.timer.reset());

    document.getElementById('loading-overlay')?.remove();

    this.animate();
    this._installQaHooks();
    const reviewQuery = new URLSearchParams(window.location.search);
    if (reviewQuery.has('qa') && reviewQuery.get('pattern') === 'volt') {
      import('./ui/PatternReview.js').then(({ installPatternReview }) => installPatternReview(this));
    } else if (reviewQuery.has('qa') && reviewQuery.get('opponent') === 'volt') {
      this.enterFightMode({ defIdB: 'volt-kestrel' });
    }
  }

  _installQaHooks() {
    if (!new URLSearchParams(window.location.search).has('qa')) return;
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: async seed => {
        if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
        this._testSeed = seed;
        if (this.mode === 'fight' && this.fightMode) {
          this.exitFightMode();
          this.enterFightMode();
        }
        return { seed };
      },
      setState: async state => {
        if (!['showcase', 'active-play', 'fight', 'timeout', 'result'].includes(state)) {
          throw new Error(`Unknown QA state: ${state}`);
        }
        if (state === 'showcase') {
          if (this.mode === 'fight') this.exitFightMode();
          else if (this.mode === 'replay') this.stopReplay();
        } else {
          if (this.mode !== 'fight') this.enterFightMode();
          if (!this.fightMode) throw new Error('Fight mode unavailable');
          this.fightMode.reset();
          if (state === 'timeout') {
            const opened = this.fightMode.openTimeout();
            if (!opened.ok) throw new Error(opened.error);
            this.hud.openTimeoutEditor(opened.playbook, opened.playbook[0]?.id);
          } else if (state === 'result') {
            this.fightMode.sim.roundDurationTicks = this.fightMode.sim.clock.tick;
            this.fightMode.update(this.fightMode.sim.clock.dt);
          }
        }
        return { state };
      },
      setPausedForScreenshot: paused => {
        this._testPaused = Boolean(paused);
        if (this.mode === 'fight' && this.fightMode) {
          if (this._testPaused) this.fightMode.sim.clock.pause();
          else if (!this.fightMode.timeouts.active) this.fightMode.sim.clock.resume();
        } else if (this.fighter) {
          if (this._testPaused) this.fighter.pause();
          else if (!this.reducedMotion) this.fighter.resume();
        }
      },
      setReducedMotion: reduced => {
        this.reducedMotion = Boolean(reduced);
        if (this.fighter) {
          if (this.reducedMotion) this.fighter.pause();
          else if (!this._testPaused) this.fighter.resume();
        }
      },
      hideDebugUi: () => undefined,
    };
  }

  // ── Layout ───────────────────────────────────────────────────────
  resizeViewport() {
    // container is position:absolute inset:0 inside viewport-anchor – CSS handles size.
    // Read size from the container itself so it matches exactly what CSS laid out.
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false); // false = don't set canvas style size (CSS owns it)
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'fight' || this.mode === 'replay') this.frameFightArena();
    else if (this.mode === 'sandbox') this.frameSandboxArena();
    else if (this.fighter) this.fitCameraToFighter();
  }

  // ── Portrait thumbnails ──────────────────────────────────────────
  _renderPortraits() {
    const pw = 440, ph = 260;
    const pRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    pRenderer.setSize(pw, ph);
    pRenderer.setPixelRatio(1);
    pRenderer.toneMapping         = THREE.ACESFilmicToneMapping;
    pRenderer.toneMappingExposure = 1.35;
    pRenderer.setClearColor(0x000000, 0);

    const pScene = new THREE.Scene();
    pScene.environment = this.studio.environmentTexture;
    pScene.add(new THREE.HemisphereLight(0xfff8ec, 0x778073, 2.5));
    const pKey = new THREE.DirectionalLight(0xfff1de, 4);
    pKey.position.set(-3, 6, 6);
    pScene.add(pKey);

    const pCamera = new THREE.PerspectiveCamera(34, pw / ph, 0.1, 30);
    pCamera.position.set(4.2, 3.5, 7.5);
    pCamera.lookAt(0, 2.3, 0);

    ROBOT_CATALOG.forEach((def, i) => {
      const assembly = RobotFactory.create(def);
      const clone = assembly.root.clone(true);
      clone.visible = true;
      pScene.add(clone);
      pRenderer.render(pScene, pCamera);
      this.hud.setPortrait(i, pRenderer.domElement.toDataURL('image/png'));
      pScene.remove(clone);
      assembly.root.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
        }
      });
    });

    pRenderer.dispose();
  }

  // ── Zombie Survival Sandbox commands ───────────────────────────
  toggleSandboxMode() {
    if (this.mode === 'sandbox') this.exitSandboxMode();
    else this.enterSandboxMode();
  }

  enterSandboxMode() {
    if (this.mode === 'fight') this.exitFightMode();
    if (this.mode === 'replay') this.stopReplay();
    this.closeVsSetup();
    this.mode = 'sandbox';
    this._sandboxRequestVersion = (this._sandboxRequestVersion || 0) + 1;
    if (this.fighter) {
      this.scene.remove(this.fighter.group);
      this.fighter.dispose();
      this.fighter = null;
    }
    this.studio.setVisible(false);
    this.sandboxMode = new SandboxMode(this.scene, {
      defId: this.activeRobotId,
      seed: this._testSeed,
      onStateChange: state => this.hud.updateSandboxHUD(state),
    });
    this.hud.setSandboxMode(true);
    this.frameSandboxArena();
    this.hud.showToast('ZOMBIE SURVIVAL — JEV COMMAND LINK READY');
  }

  resetSandboxMode() {
    if (!this.sandboxMode) return;
    this._sandboxRequestVersion = (this._sandboxRequestVersion || 0) + 1;
    this.sandboxMode.reset();
    this.hud.setSandboxFeedback('SANDBOX RESET · LOCAL AUTONOMY ACTIVE');
  }

  exitSandboxMode() {
    if (this.mode !== 'sandbox') return;
    this._sandboxRequestVersion = (this._sandboxRequestVersion || 0) + 1;
    this.sandboxMode?.dispose();
    this.sandboxMode = null;
    this.mode = 'showcase';
    this.studio.setVisible(true);
    this.hud.setSandboxMode(false);
    this.switchRobot(this.activeRobotId, false);
    this.fitCameraToFighter();
    this.hud.showToast('SHOWCASE MODE');
  }

  async handleSandboxCommand(text, language = 'en-US') {
    if (!this.sandboxMode || this.mode !== 'sandbox') return { kind: 'unrecognized', reason: 'sandbox_not_active' };
    const tick = this.sandboxMode.getState().tick;
    const heading = this.sandboxMode.getState().player.heading;
    const localPlan = parseSandboxPlanCommand(text, { language, currentHeading: heading, tick });
    if (localPlan.kind === 'sandbox_plan') {
      const queued = this.sandboxMode.submitPlan(localPlan.plan);
      this.hud.setSandboxFeedback(queued.ok ? `LOCAL · ${localPlan.plan.steps.length}-STEP MISSION QUEUED` : `REJECTED · ${queued.error.toUpperCase()}`, queued.ok ? 'success' : 'error');
      return localPlan;
    }
    const local = parseSandboxCommand(text, { language, currentHeading: heading, tick });
    if (local.kind === 'sandbox_intent') {
      const queued = this.sandboxMode.submitIntent(local.intent);
      this.hud.setSandboxFeedback(queued.ok ? `LOCAL · ${local.intent.type.toUpperCase()} QUEUED` : `REJECTED · ${queued.error.toUpperCase()}`, queued.ok ? 'success' : 'error');
      return local;
    }

    const requestVersion = (this._sandboxRequestVersion || 0) + 1;
    this._sandboxRequestVersion = requestVersion;
    this.hud.setSandboxFeedback('ASKING JEV · ROBOT CONTINUES AUTONOMOUSLY');
    const remote = await this._interpretSandboxWithWorker(text, language, requestVersion, tick, heading);
    if (!remote || requestVersion !== this._sandboxRequestVersion || this.mode !== 'sandbox') return local;
    if (remote.error) {
      this.hud.setSandboxFeedback(remote.error.message || remote.error, 'error');
      return local;
    }
    if (remote.plan) {
      const queued = this.sandboxMode.submitPlan(remote.plan);
      this.hud.setSandboxFeedback(queued.ok ? `JEV · ${remote.plan.steps.length}-STEP MISSION QUEUED` : `REJECTED · ${queued.error.toUpperCase()}`, queued.ok ? 'success' : 'error');
      return remote;
    }
    const intent = remote.intent;
    const queued = this.sandboxMode.submitIntent(intent);
    this.hud.setSandboxFeedback(queued.ok ? `JEV · ${intent.type.toUpperCase()} QUEUED` : `REJECTED · ${queued.error.toUpperCase()}`, queued.ok ? 'success' : 'error');
    return remote;
  }

  async _interpretSandboxWithWorker(transcript, language, requestVersion, tick, heading) {
    const requestId = `sandbox_${requestVersion}_${Date.now().toString(36)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    try {
      const endpoint = this._coachEndpoint('/api/sandbox/interpret');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript, language, requestId, tick, currentHeading: heading }),
        signal: controller.signal,
      });
      return await response.json();
    } catch (error) {
      return { error: { code: 'NETWORK_ERROR', message: error.name === 'AbortError' ? 'JEV TIMEOUT · LOCAL CONTROL STILL ACTIVE' : 'JEV UNAVAILABLE · USE LOCAL COMMANDS' } };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Live coaching ────────────────────────────────────────────────
  async handleCoachText(text, language = 'en-US') {
    const fighterId = 'fighter_a';
    const tick = this.fightMode?.sim.clock.tick ?? 0;
    const result = parseCoachText(text, { language, fighterId, tick });
    const requestVersion = ++this._coachRequestVersion;
    if (!this.fightMode || this.mode !== 'fight') {
      this.hud.setCoachFeedback('ENTER FIGHT MODE TO COACH', 'error');
      return result;
    }
    if (this.fightMode.timeouts?.active) {
      this.hud.setCoachFeedback('TIME-OUT EDITOR ACTIVE · REVIEW OR CANCEL FIRST', 'error');
      return result;
    }
    if (result.kind !== 'unrecognized') return this._applyCoachIntent(result);
    if (result.reason === 'persistent_tactic_not_allowed_live') {
      this.hud.setCoachFeedback('LIVE ONLY: USE TIME-OUT FOR TACTICS', 'error');
      return result;
    }

    // Local parser is authoritative for known short calls. Worker is only a
    // slower interpretation fallback for an unknown phrase.
    this.hud.setCoachFeedback('ASKING COACH FALLBACK · COMBAT CONTINUES');
    const remote = await this._interpretWithWorker(text, language, requestVersion);
    if (!remote || requestVersion !== this._coachRequestVersion || this.mode !== 'fight') return result;
    if (remote.error) {
      this.hud.setCoachFeedback(remote.error, 'error');
      return result;
    }
    const remoteIntent = remote.intent || remote;
    const liveTick = this.fightMode.sim.clock.tick;
    const normalizedIntent = {
      ...remoteIntent,
      createdAt: liveTick,
      expiresAt: liveTick + Math.max(6, Math.min(600, Number(remoteIntent.expiresAt) || 18)),
    };
    return this._applyCoachIntent(normalizedIntent);
  }

  _applyCoachIntent(result) {
    if (!result || !this.fightMode || this.mode !== 'fight') return result;
    if (result.kind === 'direct_command') {
      const queued = this.fightMode.enqueueDirectCommand(result);
      const confidence = Math.round((result.confidence ?? 0) * 100);
      if (queued.status === 'queued') {
        this.hud.setCoachFeedback(`QUEUED · ${result.actionId.toUpperCase()} · ${confidence}% · REQUEST ONLY`, 'success');
      } else {
        this.hud.setCoachFeedback(`COMMAND REJECTED · ${queued.reason.replaceAll('_', ' ').toUpperCase()}`, 'error');
      }
      return result;
    }
    const applied = this.fightMode.applyBlackboardOverride(result);
    if (applied.status === 'active') {
      const confidence = Math.round((result.confidence ?? 0) * 100);
      this.hud.setCoachFeedback(`OVERRIDE ACTIVE · ${Object.keys(result.changes).join(' / ').toUpperCase()} · ${confidence}%`, 'success');
    } else {
      this.hud.setCoachFeedback(`OVERRIDE REJECTED · ${applied.reason.toUpperCase()}`, 'error');
    }
    return result;
  }

  _coachEndpoint(route) {
    // When running in local development (Vite dev server on localhost / 127.0.0.1),
    // route through Vite's reverse proxy using relative URL to avoid browser CORS preflight blocks.
    if (import.meta.env.DEV || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))) {
      return route;
    }
    const configured = String(import.meta.env.VITE_COACH_API_URL || '').replace(/\/$/, '');
    if (!configured) return route;
    return `${configured.replace(/\/api\/coach\/interpret$/, '')}${route}`;
  }

  async _interpretWithWorker(transcript, language, requestVersion) {
    const requestId = `coach_${requestVersion}_${Date.now().toString(36)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const endpoint = this._coachEndpoint('/api/coach/interpret');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({ transcript: String(transcript).slice(0, 256), language, requestId }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (requestVersion !== this._coachRequestVersion) return null;
      if (!response.ok) return { error: payload?.error?.message || 'COACH FALLBACK UNAVAILABLE — USE SHORT COMMANDS' };
      const intent = payload?.intent;
      if (!this._isSafeWorkerIntent(intent, requestId)) return { error: 'COACH FALLBACK RETURNED INVALID INTENT' };
      return { intent };
    } catch (error) {
      if (error?.name === 'AbortError') return { error: 'COACH FALLBACK TIMEOUT — LOCAL COMBAT CONTINUES' };
      return { error: 'COACH FALLBACK OFFLINE — USE SHORT COMMANDS' };
    } finally {
      clearTimeout(timer);
    }
  }

  _isSafeWorkerIntent(intent, requestId) {
    if (!intent || !['direct_command', 'blackboard_override'].includes(intent.kind)) return false;
    if (intent.commandId !== `remote_${requestId}`) return false;
    if (!Number.isFinite(intent.confidence) || intent.confidence < .7 || intent.confidence > 1) return false;
    if (intent.kind === 'direct_command') return Boolean(getAction(intent.actionId));
    if (!intent.changes || typeof intent.changes !== 'object') return false;
    return Object.keys(intent.changes).length > 0;
  }

  // ── Time-out / tactical editor ──────────────────────────────────
  openTimeoutEditor() {
    if (!this.fightMode) return;
    this.voiceCoach?.stop();
    const result = this.fightMode.openTimeout();
    if (!result.ok) {
      this.hud.setCoachFeedback(`TIME-OUT REJECTED · ${result.error.replaceAll('_', ' ').toUpperCase()}`, 'error');
      return;
    }
    this._coachRequestVersion++;
    this._timeoutBaseRevision = this.fightMode.getCoachingSnapshot().playbooks.find(item => item.fighterId === 'fighter_a')?.revision ?? 0;
    this._timeoutPlaybookDraft = structuredClone(result.playbook || []);
    if (!this._timeoutPlaybookDraft.length) {
      this._timeoutPlaybookDraft.push({ schemaVersion: 2, id: 'right-hook-punish', name: 'Right Hook Punish', goal: 'React to a committed hook with a legal counter.', priority: .7,
        trigger: { type: 'enemy_attack_start', actionId: 'hook_right' },
        phases: [{ id: 'response', sequence: [{ intent: { type: 'counter', response: 'strike', targetZone: 'any' } }], branches: [] }],
        abort: [{ type: 'near_edge' }], repeatLimit: 1, timeoutTicks: 180 });
    }
    this._timeoutDraft = this._timeoutPlaybookDraft[0] || null;
    this._timeoutReviewed = false;
    this.hud.openTimeoutEditor(this._timeoutPlaybookDraft);
    this.hud.setCoachFeedback(`TIME-OUT OPEN · ${result.remaining} REMAINING`);
  }

  cancelTimeoutEditor() {
    if (!this.fightMode) return;
    const result = this.fightMode.cancelTimeout();
    this._timeoutDraft = null;
    this._timeoutPlaybookDraft = [];
    this._timeoutReviewed = false;
    this.hud.closeTimeoutEditor();
    this.hud.setCoachFeedback(result.ok ? 'TIME-OUT CANCELLED · NO REFUND' : `TIME-OUT ERROR · ${result.error}`, result.ok ? '' : 'error');
  }

  _buildTacticDraft(draft, base = null) {
    const schemaVersion = Number(draft.schemaVersion || base?.schemaVersion || 1);
    const source = base ? structuredClone(base) : {
      schemaVersion, id: draft.id || `tactic-${Date.now().toString(36)}`,
      goal: '', priority: .7, phases: [{ id: 'response', sequence: [], branches: [] }],
      abort: [], repeatLimit: 1, timeoutTicks: 180,
    };
    source.schemaVersion = schemaVersion;
    source.name = draft.name;
    source.goal = draft.goal || '';
    source.priority = draft.priority;
    source.trigger = { type: 'enemy_attack_start', actionId: draft.triggerAction };
    source.repeatLimit = draft.repeatLimit;
    source.timeoutTicks = draft.timeoutTicks;
    source.phases[0] = {
      ...source.phases[0],
      sequence: schemaVersion === 2 ? draft.sequence.map(intent => ({ intent })) : draft.sequence.map(actionId => ({ actionId })),
      branches: source.phases[0].branches || [],
    };
    source.abort = draft.abortNearEdge ? [{ type: 'near_edge' }] : [];
    return source;
  }

  selectTimeoutTactic(id) {
    const tactic = this._timeoutPlaybookDraft.find(item => item.id === id);
    if (!tactic) return;
    this._timeoutDraft = structuredClone(tactic);
    this._timeoutReviewed = false;
    this.hud.openTimeoutEditor(this._timeoutPlaybookDraft, id);
    this.invalidateTimeoutDraftReview();
  }

  createTimeoutTactic() {
    if (!this.fightMode?.timeouts?.active) return;
    const id = `tactic-${Date.now().toString(36)}`;
    const tactic = { schemaVersion: 2, id, name: 'New Strategy', goal: '', priority: .7,
      trigger: { type: 'enemy_attack_start', actionId: 'hook_right' },
      phases: [{ id: 'response', sequence: [{ intent: { type: 'counter', response: 'strike', targetZone: 'any' } }], branches: [] }],
      abort: [], repeatLimit: 1, timeoutTicks: 180 };
    this._timeoutPlaybookDraft.push(tactic);
    this._timeoutDraft = structuredClone(tactic);
    this._timeoutReviewed = false;
    this.hud.openTimeoutEditor(this._timeoutPlaybookDraft, id);
    this.invalidateTimeoutDraftReview();
  }

  deleteTimeoutTactic() {
    if (!this.fightMode?.timeouts?.active || !this._timeoutDraft) return;
    this._timeoutPlaybookDraft = this._timeoutPlaybookDraft.filter(item => item.id !== this._timeoutDraft.id);
    this._timeoutDraft = this._timeoutPlaybookDraft[0] ? structuredClone(this._timeoutPlaybookDraft[0]) : null;
    this._timeoutReviewed = false;
    this.hud.openTimeoutEditor(this._timeoutPlaybookDraft);
    this.invalidateTimeoutDraftReview();
  }

  invalidateTimeoutDraftReview() {
    if (!this.fightMode?.timeouts?.active) return;
    this._timeoutReviewed = false;
    this.hud.showTimeoutReview({
      ok: false,
      message: 'DRAFT CHANGED · PREVIEW AGAIN BEFORE COMMIT',
    });
  }

  previewTimeoutDraft(draft) {
    const candidate = this._buildTacticDraft(draft, this._timeoutDraft);
    const result = candidate.schemaVersion === 2 ? validateTacticV2(candidate) : validateTactic(candidate);
    if (!result.ok) {
      this._timeoutDraft = null;
      this._timeoutReviewed = false;
      this.hud.showTimeoutReview({ ok: false, message: `INVALID · ${result.errors.join(' / ')}` });
      return result;
    }
    this._timeoutDraft = result.value;
    this._timeoutPlaybookDraft = this._timeoutPlaybookDraft.filter(item => item.id !== result.value.id).concat(result.value);
    this._timeoutReviewed = true;
    this.hud.showTimeoutReview({
      ok: true,
      message: `ADD/REPLACE ${result.value.name} · COST ${result.cost} · PLAYBOOK ${this._timeoutPlaybookDraft.length} TACTICS`,
      canCommit: true,
    });
    return result;
  }

  async requestTacticPatch(prompt) {
    if (!this.fightMode?.timeouts?.active || !prompt) return;
    let base = this._timeoutDraft || this.fightMode.getPlaybook('fighter_a')[0];
    if (!base) {
      const preview = this.previewTimeoutDraft(this.hud.getTimeoutDraft());
      if (!preview.ok) return;
      base = this._timeoutDraft;
    }
    const version = ++this._coachRequestVersion;
    const requestId = `patch_${version}_${Date.now().toString(36)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const endpoint = this._coachEndpoint('/api/coach/tactic-patch');
    this.hud.setCoachFeedback('PROPOSING PATCH · REVIEW REQUIRED');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({ transcript: prompt.slice(0, 256), language: document.querySelector('#coach-language')?.value || 'en-US', requestId, baseRevision: this._timeoutBaseRevision, tactic: base }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (version !== this._coachRequestVersion || !this.fightMode?.timeouts?.active) return;
      if (!response.ok) {
        this.hud.showTimeoutReview({ ok: false, message: `PROPOSAL FAILED · ${payload?.error?.message || 'WORKER UNAVAILABLE'}` });
        return;
      }
      const patchResult = validateTacticPatch(payload?.patch, { baseRevision: this._timeoutBaseRevision });
      const preview = patchResult.ok ? applyTacticPatch(base, patchResult.value) : patchResult;
      if (!preview.ok) {
        this.hud.showTimeoutReview({ ok: false, message: `INVALID PROPOSAL · ${preview.error || preview.errors?.join(' / ')}` });
        return;
      }
      this._timeoutDraft = preview.value;
      this._timeoutPlaybookDraft = this._timeoutPlaybookDraft.filter(item => item.id !== preview.value.id).concat(preview.value);
      this._timeoutReviewed = true;
      this.hud.showTimeoutProposal(this._timeoutPlaybookDraft, `${preview.value.name} · PROPOSAL REVIEW`);
    } catch (error) {
      if (version === this._coachRequestVersion) this.hud.showTimeoutReview({ ok: false, message: error?.name === 'AbortError' ? 'PROPOSAL TIMEOUT · MANUAL EDITOR AVAILABLE' : 'PROPOSAL OFFLINE · MANUAL EDITOR AVAILABLE' });
    } finally {
      clearTimeout(timer);
    }
  }

  commitTimeoutDraft() {
    if (!this.fightMode || !this._timeoutDraft || !this._timeoutReviewed) {
      return { ok: false, error: 'review_required' };
    }
    const selected = this._timeoutDraft.schemaVersion === 2 ? validateTacticV2(this._timeoutDraft) : validateTactic(this._timeoutDraft);
    if (!selected.ok) {
      this._timeoutReviewed = false;
      this.hud.showTimeoutReview({ ok: false, message: `INVALID REVIEW · ${selected.errors.join(' / ')}` });
      return selected;
    }
    const nextDrafts = this._timeoutPlaybookDraft.filter(tactic => tactic.id !== selected.value.id).concat(selected.value);
    const playbook = validatePlaybook(nextDrafts, { capacity: this.fightMode.brains[0].profile.tacticalCapacity });
    if (!playbook.ok) {
      this._timeoutReviewed = false;
      this.hud.showTimeoutReview({ ok: false, message: `PLAYBOOK INVALID · ${playbook.errors.join(' / ')}` });
      return playbook;
    }
    const next = playbook.value;
    const revision = this.fightMode.getCoachingSnapshot().playbooks.find(item => item.fighterId === 'fighter_a')?.revision ?? 0;
    const result = this.fightMode.commitTimeout(next, revision);
    if (!result.ok) {
      this.hud.showTimeoutReview({ ok: false, message: `COMMIT FAILED · ${result.error}` });
      return result;
    }
    this._timeoutDraft = null;
    this._timeoutPlaybookDraft = [];
    this._timeoutReviewed = false;
    this.hud.closeTimeoutEditor();
    this.hud.setCoachFeedback(`PLAYBOOK COMMITTED · ${result.remaining} TIME-OUTS REMAIN`, 'success');
    return result;
  }

  _persistMatchResult(state) {
    const key = `${state.matchResult.reason}:${state.matchResult.tick}:${state.winnerId ?? 'draw'}`;
    if (key === this._lastSavedResultKey) return;
    this._lastSavedResultKey = key;
    const savedResult = this.persistence.saveResult({
      reason: state.matchResult.reason,
      winnerId: state.winnerId,
      finalHealth: state.matchResult.finalHealth,
      tick: state.matchResult.tick,
      definitionA: state.a.definitionId,
      definitionB: state.b.definitionId,
    });
    if (savedResult.ok && this.fightMode) {
      this.persistence.saveReplay(this.fightMode.exportReplay(), { matchId: savedResult.value.id });
    }
  }

  exportCurrentReplay() {
    if (!this.fightMode) return;
    const replay = this.fightMode.exportReplay();
    const exported = this.persistence.exportReplay(replay);
    if (!exported.ok) return;
    const blob = new Blob([exported.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `robot-foundry-replay-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.hud.setCoachFeedback('REPLAY EXPORTED · NO MODEL REQUIRED', 'success');
  }

  // ── History & Replay ────────────────────────────────────────────────
  openHistory() {
    const results = this.persistence.listResults();
    const replays = this.persistence.listReplays();
    this.hud.openHistoryModal(results, replays);
  }

  downloadReplay(replay) {
    const exported = this.persistence.exportReplay(replay);
    if (!exported.ok) return;
    const blob = new Blob([exported.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `robot-foundry-replay-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.hud.showToast('REPLAY DOWNLOADED');
  }

  importReplayFile(text) {
    const result = this.persistence.importReplay(text);
    if (!result.ok) {
      this.hud.showToast(`IMPORT FAILED: ${result.error.toUpperCase()}`);
      return;
    }
    this.startReplay(result.replay);
  }

  watchLastMatchReplay() {
    const replays = this.persistence.listReplays();
    if (replays[0]?.replay) {
      this.startReplay(replays[0].replay);
      return;
    }
    if (this.fightMode) {
      const replay = this.fightMode.exportReplay();
      this.startReplay(replay);
    }
  }

  startReplay(replayLog) {
    if (this.mode === 'fight') {
      this.exitFightMode();
    } else if (this.mode === 'sandbox') {
      this.exitSandboxMode();
    }
    if (this.fighter) {
      this.scene.remove(this.fighter.group);
      this.fighter.dispose();
      this.fighter = null;
    }
    if (this.replayPlayer) {
      this.replayPlayer.dispose();
      this.replayPlayer = null;
    }

    this.mode = 'replay';
    this.showFightArena();
    try {
      this.replayPlayer = new ReplayPlayer(this.scene, replayLog, {
        onStateChange: state => this.hud.updateReplayHUD(state),
      });
    } catch (err) {
      this.hud.showToast(`CANNOT PLAY REPLAY: ${err.message}`);
      this.mode = 'showcase';
      this.hideFightArena();
      this.switchRobot(this.activeRobotId, false);
      return;
    }

    this.frameFightArena();

    const matchup = `${this.replayPlayer.defA.shortName} vs ${this.replayPlayer.defB.shortName}`;
    this.hud.setReplayMode(true, { matchup });
    this.hud.showToast(`REPLAY — ${matchup}`);
  }

  stopReplay() {
    if (this.replayPlayer) {
      this.replayPlayer.dispose();
      this.replayPlayer = null;
    }
    this.mode = 'showcase';
    this.hideFightArena();
    this.hud.setReplayMode(false);
    this.switchRobot(this.activeRobotId, false);
    this.fitCameraToFighter();
    this.hud.showToast('SHOWCASE MODE');
  }

  // ── Fight mode ──────────────────────────────────────────────────────
  toggleFightMode() {
    if (this.mode === 'showcase') {
      this.openVsSetup();
    } else if (this.mode === 'vs_setup') {
      this.closeVsSetup();
    } else if (this.mode === 'fight') {
      this.exitFightMode();
    } else if (this.mode === 'sandbox') {
      this.exitSandboxMode();
      this.openVsSetup();
    } else {
      this.exitFightMode();
    }
  }

  openVsSetup() {
    if (this.mode === 'fight' || this.mode === 'replay') return;
    this.mode = 'vs_setup';
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    const playerDefId = this.activeRobotId || 'forge-titan';
    if (!this._selectedOpponentId || this._selectedOpponentId === playerDefId) {
      this._selectedOpponentId = pickRandomOpponent(playerDefId, ROBOT_CATALOG);
    }
    this.hud.showVsSetup({
      playerDefId,
      opponentDefId: this._selectedOpponentId,
      catalog: ROBOT_CATALOG,
      onSelectOpponent: (opponentId) => {
        this._selectedOpponentId = opponentId;
      },
      onRandomOpponent: () => {
        this._selectedOpponentId = pickRandomOpponent(this.activeRobotId, ROBOT_CATALOG);
        return this._selectedOpponentId;
      },
      onStartFight: (opponentId) => {
        const opp = opponentId || this._selectedOpponentId;
        this.closeVsSetup();
        this.enterFightMode({
          defIdA: this.activeRobotId,
          defIdB: opp,
        });
      },
      onCancel: () => {
        this.closeVsSetup();
      },
    });
  }

  closeVsSetup() {
    if (this.mode === 'vs_setup') {
      this.mode = 'showcase';
    }
    this.hud.hideVsSetup();
  }

  enterFightMode({ defIdA, defIdB, review = false } = {}) {
    this.closeVsSetup();
    this._lastSavedResultKey = '';
    this.mode = 'fight';

    const resolvedA = defIdA || this.activeRobotId || 'forge-titan';
    const resolvedB = defIdB || this._selectedOpponentId || (resolvedA === 'forge-titan' ? 'aegis-prime' : 'forge-titan');
    this.matchSetup = createMatchSetup({ playerDefId: resolvedA, opponentDefId: resolvedB });

    // Remove showcase fighter
    if (this.fighter) {
      this.scene.remove(this.fighter.group);
      this.fighter.dispose();
      this.fighter = null;
    }

    // Replace the inspection plinth with a dedicated arena whose visible mat
    // extends beyond the authoritative movement boundary.
    this.showFightArena();

    // Hide showcase UI
    this.hud.setFightMode(true, { matchSetup: this.matchSetup });

    // Create fight mode with two robots
    this.fightMode = new FightMode(this.scene, {
      defIdA: resolvedA,
      defIdB: resolvedB,
      seed: this._testSeed,
      onStateChange: (state) => {
        this.hud.updateFightHUD(state, this.matchSetup);
        if (!review && state.matchResult) this._persistMatchResult(state);
      },
    });

    // Camera: wider view to see both fighters
    // Oblique gameplay angle keeps the two fighters readable instead of
    // stacking them on the camera's Z axis.
    this.cameraController.setFighters(this.fightMode.fighterA, this.fightMode.fighterB);
    this.frameFightArena();

    const labels = resolveFighterLabels(this.matchSetup, ROBOT_CATALOG);
    this.hud.showToast(review ? 'ANIMATOR REVIEW — Volt vs Aegis · NOT A MATCH' : `FIGHT MODE — ${labels.player.shortName} (YOU) vs ${labels.opponent.shortName} (CPU)`);
  }

  resetFightMode() {
    this._coachRequestVersion++;
    this._lastSavedResultKey = '';
    const resultEl = document.getElementById('fight-result');
    if (resultEl) resultEl.hidden = true;
    this.fightMode?.reset();
    this.hud.closeTimeoutEditor();
    this._timeoutDraft = null;
    this.hud.setCoachFeedback('FIGHT RESET · COACHING CLEARED');
  }

  exitFightMode() {
    this.closeVsSetup();
    this.matchSetup = null;
    this._coachRequestVersion++;
    if (this.fightMode?.timeouts?.active) this.fightMode.cancelTimeout();
    this.hud.closeTimeoutEditor();
    this.voiceCoach?.stop();
    this.mode = 'showcase';

    if (this.fightMode) {
      this.fightMode.dispose();
      this.fightMode = null;
    }

    // Restore showcase UI and inspection environment.
    this.hideFightArena();
    this.hud.setFightMode(false);

    // Rebuild showcase fighter
    this.switchRobot(this.activeRobotId, false);
    this.fitCameraToFighter();

    this.hud.showToast('SHOWCASE MODE');
  }

  // ── Robot switching ──────────────────────────────────────────────
  switchRobot(id, announce = true) {
    const definition = getRobotDefinition(id);
    const previousId = this.fighter?.currentMeta.id ?? 'idle';

    const next = Fighter.fromFactory(definition, RobotFactory.create(definition));
    next.setPlaybackSpeed(this.speed);
    next.setLoop(this.loop);
    next.playAnimation(previousId, { crossFade: 0 });
    if (this.reducedMotion) next.pause();

    if (this.fighter) {
      this.scene.remove(this.fighter.group);
      this.fighter.dispose();
    }

    this.fighter = next;
    this.scene.add(next.group);
    this.activeRobotId = definition.id;

    this.studio.setAccent(definition.colors.accent);
    this.cameraController.setFighters(next, null);
    this.fitCameraToFighter();

    this.hud.setActiveRobot(definition);
    this.hud.populateClipList(next.clipList, next.currentClipName);
    this.syncHUD();

    if (announce) this.hud.showToast(`${definition.series} / ${definition.shortName} · CHASSIS ONLINE`);
  }

  selectClip(key) {
    if (!this.fighter.playAnimation(key)) return;
    this.hud.selectClipVisual(key);
    if (navigator.userActivation?.hasBeenActive) this.sound.playUIClick(0.7);
    this.syncHUD();
  }

  // ── Camera ───────────────────────────────────────────────────────
  frameSandboxArena() {
    const radius = SANDBOX_RULES.SANDBOX_ARENA_RADIUS;
    const fov = 42;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const tangent = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const distance = Math.max(6 / tangent, radius / (tangent * Math.max(this.camera.aspect, 0.55))) * 1.05;
    const target = new THREE.Vector3(0, 1.1, 0);
    const direction = new THREE.Vector3(0.62, 0.66, 0.48).normalize();
    const position = target.clone().addScaledVector(direction, distance);
    this.cameraController.defaultPos.copy(position);
    this.cameraController.defaultTarget.copy(target);
    this.cameraController.controls.target.copy(target);
    this.camera.position.copy(position);
    this.camera.lookAt(target);
    this.cameraController.controls.update(0);
  }

  showFightArena() {
    if (!this.fightStage) {
      this.fightStage = new FightingStage(this.scene, {
        playableRadius: ARENA_RADIUS,
        stagePadding: 1.5,
      });
    }
    this.fightStage.group.visible = true;
    this.studio.setVisible(false);
  }

  hideFightArena() {
    if (this.fightStage) this.fightStage.group.visible = false;
    this.studio.setVisible(true);
  }

  frameFightArena() {
    const radius = this.fightStage?.stageRadius ?? (ARENA_RADIUS + 1.5);
    const fov = 40;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    const tangent = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const distance = Math.max(
      4.2 / tangent,
      (radius + 0.45) / (tangent * Math.max(this.camera.aspect, 0.55)),
    ) * 1.08;
    const target = new THREE.Vector3(0, 0.9, 0);
    const direction = new THREE.Vector3(0.58, 0.38, 0.72).normalize();
    const position = target.clone().addScaledVector(direction, distance);

    this.cameraController.defaultPos.copy(position);
    this.cameraController.defaultTarget.copy(target);
    this.cameraController.controls.target.copy(target);
    this.camera.position.copy(position);
    this.camera.lookAt(target);
    this.cameraController.controls.update(0);
  }

  fitCameraToFighter() {
    this.camera.fov = 35;
    this.camera.updateProjectionMatrix();
    const height   = 2.58;
    const fov      = THREE.MathUtils.degToRad(this.camera.fov);
    const width    = 3.34;
    const distance = Math.max(
      height * 1.45 / (2 * Math.tan(fov / 2)),
      width  / (2 * Math.tan(fov / 2) * this.camera.aspect)
    );
    const target   = new THREE.Vector3(0, height * 0.50, 0);
    const position = new THREE.Vector3(distance * 0.22, height * 0.60 + distance * 0.07, distance);

    this.cameraController.defaultPos.copy(position);
    this.cameraController.defaultTarget.copy(target);
    this.cameraController.controls.target.copy(target);
    this.camera.position.copy(position);
    this.camera.lookAt(target);
    this.cameraController.controls.update(0);
  }

  resetCamera() {
    if (this.mode === 'fight' || this.mode === 'replay') this.frameFightArena();
    else if (this.mode === 'sandbox') this.frameSandboxArena();
    else this.fitCameraToFighter();
    this.cameraController.resetCamera();
  }

  // ── HUD sync ─────────────────────────────────────────────────────
  syncHUD() {
    if (this.mode === 'fight' || !this.fighter) return;
    this.hud.update({
      currentTime: this.fighter.getCurrentTime(),
      duration:    this.fighter.getDuration(),
      isPaused:    this.fighter.isPaused,
    }, this.currentFps);
  }

  // ── Loop ─────────────────────────────────────────────────────────
  animate = () => {
    requestAnimationFrame(this.animate);
    this.timer.update();
    const delta = Math.min(0.1, this.timer.getDelta());

    if (this.mode === 'fight' && this.fightMode) {
      this.fightMode.update(delta);
    } else if (this.mode === 'replay' && this.replayPlayer) {
      this.replayPlayer.update(delta);
    } else if (this.mode === 'sandbox' && this.sandboxMode) {
      this.sandboxMode.update(delta);
    } else if (this.fighter) {
      this.fighter.update(delta);
    }

    this.cameraController.update(delta);
    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime > 500) {
      this.currentFps  = this.frameCount * 1000 / (now - this.lastFpsTime);
      this.frameCount  = 0;
      this.lastFpsTime = now;
    }

    this.hudElapsed += delta;
    if (this.hudElapsed > 0.08) {
      if (this.mode === 'sandbox' && this.sandboxMode) this.hud.updateSandboxHUD(this.sandboxMode.getState());
      else this.syncHUD();
      this.hudElapsed = 0;
    }
  };
}

try {
  window.__app = new RobotFoundryApp();
} catch (error) {
  console.error(error);
  const msg = document.querySelector('.loading-sub');
  if (msg) msg.textContent = `Cannot init WebGL: ${error.message}. Enable hardware acceleration and reload.`;
}
