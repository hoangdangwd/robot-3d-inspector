import { getRobotDefinition } from '../robots/robotCatalog.js';
import { resolveMatchOutcome, resolveFighterLabels } from '../match/MatchSetup.js';

// ── icon system (inline SVG, no external deps) ─────────────────
const ICONS = {
  cube:    '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
  arrow:   '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  rotate:  '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  expand:  '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  grid:    '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  pause:   '<path d="M8 5v14M16 5v14"/>',
  play:    '<path d="m8 5 11 7-11 7V5Z"/>',
  loop:    '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
  prev:    '<path d="M15 18l-6-6 6-6"/>',
  next:    '<path d="M9 6l6 6-6 6"/>',
  idle:    '<path d="M9 4h6v5H9zM7 13h10v8M12 9v4M4 13v5m16-5v5"/>',
  guard:   '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="M12 7v9m-4-5h8"/>',
  punch:   '<path d="M3 10h6V7l3-3h6l3 4v8l-3 3h-7l-2-3H3M13 5v6m4-6v6M3 10v6"/>',
  kick:    '<circle cx="10" cy="4" r="2"/><path d="m4 12 5-4 4 4 7-4M9 8l-1 7-4 6m4-6 7 1 6-4"/>',
  victory: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 14v5m-5 2h10m-8-2h6"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  mouse:   '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7"/>',
  check:   '<path d="m5 12 4 4L19 6"/>',
  close:   '<path d="m6 6 12 12M6 18 18 6"/>',
};

const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
     ${ICONS[name] || ICONS.cube}
   </svg>`;

// Stat label map (Vietnamese)
const STAT_LABELS = {
  power:    'Sức mạnh',
  speed:    'Tốc độ',
  guard:    'Phòng thủ',
  range:    'Tầm đánh',
  mobility: 'Cơ động',
  armor:    'Giáp',
};

// Clip → icon mapping
const CLIP_ICONS = {
  IDLE:      'idle',
  DEFENSE:   'guard',
  STRIKE:    'punch',
  HEAVY:     'kick',
  SIGNATURE: 'victory',
  SHOWCASE:  'victory',
  MOVEMENT:  'rotate',
  ATTACK:    'punch',
  REACTION:  'info',
  RECOVERY:  'idle',
};

export class CombatHUD {
  constructor(options) {
    this.options = options;
    this.currentClipList = [];
    this.family = 'CHARACTER';
    this.visibleClips = [];
    this._buildShell();
    this._bindEvents();
  }

  // ── DOM construction ────────────────────────────────────────────
  _buildShell() {
    const shell = document.getElementById('app-shell');
    shell.innerHTML = `
<header class="topbar">
  <a class="brand" href="/" aria-label="Robot Foundry home">
    <span class="brand-mark">${icon('cube')}</span>ROBOT<span class="brand-light">FOUNDRY</span><span class="brand-period">®</span>
  </a>
  <nav class="top-nav">
    <button class="nav-item active" id="nav-lab">Hangar / Lab<span class="tag">01</span></button>
    <button class="nav-item nav-fight-highlight" id="nav-fight" aria-label="Vào đấu đối kháng"><span class="nav-fight-icon">⚔</span> Fight Mode<span class="tag tag-live">LIVE</span></button>
    <button class="nav-item nav-sandbox-highlight" id="nav-sandbox" aria-label="Mở Zombie Survival"><span class="nav-fight-icon">☣</span> Zombie Survival<span class="tag tag-live">BETA</span></button>
    <button class="nav-item" id="nav-history">History<span class="tag">03</span></button>
    <button class="nav-item" id="nav-about">The project ${icon('arrow')}</button>
  </nav>
  <div class="build-label">
    <span class="status-dot"></span> ARENA READY <span style="border-left:1px solid var(--line);padding-left:12px;margin-left:4px;color:#a2a597">BUILD .02</span>
  </div>
</header>

<main class="site-main">
  <section class="page-heading">
    <div class="heading-content">
      <div class="eyebrow">DESIGN. INSPECT. UNLEASH.</div>
      <h1>Meet your next <span>heavy metal.</span></h1>
      <p>Five fighters. Fifteen parts. Zero mercy. Chọn chiến binh và bước thẳng vào sàn đấu.</p>
      <div class="hero-actions">
        <button class="hero-fight-btn" id="hero-fight-btn" type="button">
          ⚔ VÀO SÀN ĐẤU (QUICK FIGHT)
        </button>
        <button class="hero-lab-btn" id="hero-lab-btn" type="button">
          🛡 SOI THÔNG SỐ ROBOT
        </button>
      </div>
    </div>
    <div class="lab-tag">
      ${icon('cube')}
      <span>ROBOT COMBAT ARENA<small>AUTONOMOUS BOXING / VOL. 002</small></span>
    </div>
  </section>

  <div class="lab-layout">
    <!-- ── Roster ─────────────────────────────────────────── -->
    <aside>
      <div class="section-heading">
        <h2>THE ROSTER</h2><span class="count">05</span>
      </div>
      <p class="section-desc">Pick your machine.</p>
      <div class="fighter-list" id="fighter-list"></div>
      <div class="roster-note">
        ${icon('info')}<span>Different by design.<br/>Dangerous by default.</span>
      </div>
    </aside>

    <!-- ── Workspace ──────────────────────────────────────── -->
    <div class="workspace">
      <div class="showcase">

        <!-- viewport -->
        <div class="viewport" id="viewport-host">
          <div id="viewport-anchor">
            <div id="canvas-container" aria-hidden="true"></div>
          </div>

          <div class="viewport-top">
            <span class="live-label"><span class="status-dot"></span> LIVE PREVIEW</span>
            <span class="view-number">UNIT <span id="unit-num">01</span> / 05</span>
          </div>

          <div class="watermark" id="watermark">FORGE</div>

          <!-- Fight HUD overlay (hidden in showcase mode) -->
          <div class="fight-hud" id="fight-hud" style="display:none">
            <div class="fight-bar fight-bar-a">
              <span class="fight-name" id="fight-name-a"><span class="fight-badge badge-you">YOU</span> <strong class="fighter-label-name">PLAYER</strong></span>
              <div class="fight-health-track"><div class="fight-health-fill" id="fight-hp-a"></div></div>
              <div class="fight-stamina-track"><div class="fight-stamina-fill" id="fight-sta-a"></div></div>
              <div class="fight-posture-track" title="Posture"><div class="fight-posture-fill" id="fight-pos-a"></div></div>
            </div>
            <div class="fight-status" id="fight-status">FIGHTING</div>
            <div class="fight-bar fight-bar-b">
              <span class="fight-name" id="fight-name-b"><span class="fight-badge badge-cpu">CPU</span> <strong class="fighter-label-name">OPPONENT</strong></span>
              <div class="fight-health-track"><div class="fight-health-fill" id="fight-hp-b"></div></div>
              <div class="fight-stamina-track"><div class="fight-stamina-fill" id="fight-sta-a"></div></div>
              <div class="fight-posture-track" title="Posture"><div class="fight-posture-fill" id="fight-pos-b"></div></div>
            </div>
          </div>

          <div class="sandbox-hud" id="sandbox-hud" style="display:none" aria-label="Zombie Survival status">
            <div class="sandbox-hud-top">
              <span class="sandbox-kicker"><span class="status-dot"></span> ZOMBIE SURVIVAL // 360°</span>
              <span class="sandbox-stat">HP <strong id="sandbox-hp">100</strong></span>
              <span class="sandbox-stat">ENERGY <strong id="sandbox-energy">100</strong></span>
              <span class="sandbox-stat">SCORE <strong id="sandbox-score">0</strong></span>
              <button id="sandbox-reset" type="button">RESET</button>
            </div>
            <div class="sandbox-hud-bottom">
              <span id="sandbox-heading">HEADING 12 O'CLOCK</span>
              <span id="sandbox-zombies">12 HOSTILES</span>
              <span id="sandbox-command-status" role="status" aria-live="polite">LOCAL READY · ROBOT AUTONOMOUS</span>
              <form id="sandbox-form">
                <input id="sandbox-input" maxlength="160" autocomplete="off" placeholder="Move east then fire north / Đi đông rồi bắn bắc" aria-label="Sandbox command" />
                <button id="sandbox-voice" type="button" aria-label="Toggle voice command">MIC</button>
                <button type="submit">COMMAND</button>
              </form>
            </div>
          </div>

          <!-- Result is a viewport-level overlay, not a child of the top HUD row. -->
          <div class="fight-result" id="fight-result" hidden aria-label="Match outcome dialog">
            <div class="result-banner banner-victory" id="result-banner">
              <div class="result-badge-wrap">
                <span class="result-kicker">KẾT QUẢ TRẬN ĐẤU <b>//</b> MATCH OUTCOME</span>
                <h2 class="result-title" id="result-title">VICTORY <span>//</span> CHIẾN THẮNG</h2>
                <span class="result-subtext" id="result-subtext">KNOCKOUT VICTORY · ĐO VÁN</span>
                <span id="fight-result-text" class="result-legacy-text" style="display:none"></span>
              </div>

              <div class="result-main-actions">
                <button id="result-rematch" class="btn-result-primary" type="button">ĐẤU LẠI <span>//</span> REMATCH</button>
                <button id="result-change-opponent" class="btn-result-secondary" type="button">ĐỔI ĐỐI THỦ</button>
                <button id="result-back-lab" class="btn-result-secondary" type="button">VỀ LAB <span>//</span> HANGAR</button>
              </div>

              <div class="result-replay-actions">
                <button id="replay-watch-last" class="btn-result-tiny" type="button">WATCH REPLAY</button>
                <button id="replay-export" class="btn-result-tiny" type="button">EXPORT REPLAY</button>
                <button id="replay-import-btn" class="btn-result-tiny" type="button">IMPORT JSON</button>
              </div>
            </div>
          </div>

          <section class="coach-panel" id="coach-panel" aria-label="Live coach controls" style="display:none">
            <div class="coach-panel-head">
              <span class="coach-kicker" id="coach-kicker">LIVE COACH / REACTIVE ONLY</span>
              <span class="coach-privacy">NO AUDIO SAVED</span>
            </div>
            <div class="coach-controls">
              <select id="coach-language" aria-label="Voice language">
                <option value="en-US">English</option>
                <option value="vi-VN">Tiếng Việt</option>
              </select>
              <button id="coach-mic" type="button" aria-pressed="false">MIC OFF</button>
              <button id="timeout-open" type="button">TIME-OUT <span id="timeout-count">3</span></button>
              <form id="coach-form">
                <input id="coach-input" maxlength="160" autocomplete="off" placeholder="Jab him / Giữ khoảng cách" aria-label="Coach command" />
                <button type="submit">SEND</button>
              </form>
            </div>
            <div class="coach-feedback" id="coach-feedback" role="status" aria-live="polite">TEXT READY · ROBOT AUTONOMOUS</div>
            <div class="capacity-meter" id="capacity-meter" title="Tactical capacity used / available"></div>
            <div class="adherence-feedback" id="adherence-feedback" role="status" aria-live="polite" hidden></div>
            <section class="timeout-editor" id="timeout-editor" hidden aria-label="Tactical time-out editor">
              <div class="timeout-editor-head"><strong>TIME-OUT / PLAYBOOK REVIEW</strong><span id="timeout-review-state">DRAFT — NOT COMMITTED</span></div>
              <div class="playbook-toolbar">
                <label>TACTIC<select id="tactic-select" aria-label="Select tactic"></select></label>
                <button id="tactic-new" type="button">NEW</button>
                <button id="tactic-delete" type="button">DELETE</button>
              </div>
              <div class="timeout-fields">
                <label>NAME<input id="tactic-name" maxlength="64" value="Right Hook Punish" /></label>
                <label>GOAL<input id="tactic-goal" maxlength="160" value="React to a committed hook with a legal counter." /></label>
                <label>PRIORITY<input id="tactic-priority" type="number" min="0" max="1" step="0.05" value="0.7" /></label>
                <label>TRIGGER<select id="tactic-trigger-action"><option value="hook_right">ENEMY RIGHT HOOK</option><option value="hook_left">ENEMY LEFT HOOK</option><option value="jab">ENEMY JAB</option><option value="overhand">ENEMY OVERHAND</option></select></label>
                <label>SCHEMA<select id="tactic-schema"><option value="1">ACTION SEQUENCE</option><option value="2">STRATEGY INTENTS</option></select></label>
                <label>METHODS / SEQUENCE<input id="tactic-sequence" maxlength="240" value="slip_left, body_cross" /></label>
                <label>REPEAT<input id="tactic-repeat" type="number" min="1" max="3" step="1" value="1" /></label>
                <label>TIMEOUT TICKS<input id="tactic-timeout" type="number" min="1" max="900" step="1" value="180" /></label>
                <label class="timeout-check"><input id="tactic-abort-edge" type="checkbox" checked /> ABORT NEAR EDGE</label>
              </div>
              <div class="timeout-diff" id="timeout-diff">Edit a tactic and preview the complete playbook diff before commit.</div>
              <div class="timeout-proposal"><input id="tactic-prompt" maxlength="180" placeholder="Ask for a patch, e.g. replace cross with jab" aria-label="Tactic patch request" /><button id="timeout-suggest" type="button">SUGGEST PATCH</button></div>
              <div class="timeout-actions"><button id="timeout-preview" type="button">PREVIEW DIFF</button><button id="timeout-cancel" type="button">CANCEL · NO REFUND</button><button id="timeout-commit" type="button" disabled>COMMIT TACTIC</button></div>
            </section>
          </section>
          <button class="fight-reset-btn" id="fight-reset" style="display:none">RESET FIGHT</button>

          <!-- Replay HUD overlay (active during replay playback) -->
          <div class="replay-hud" id="replay-hud" style="display:none">
            <div class="replay-hud-header">
              <span class="live-label"><span class="status-dot"></span> REPLAY PLAYBACK</span>
              <span class="replay-matchup" id="replay-matchup">FORGE TITAN vs AEGIS PRIME</span>
              <button class="replay-exit-btn" id="replay-exit-btn" type="button">EXIT REPLAY ✕</button>
            </div>
            <div class="replay-playback">
              <button class="step-btn" id="replay-prev" title="Back 60 ticks (1s)">-60</button>
              <button class="play-btn" id="replay-play-btn" aria-label="Pause">${icon('pause')}</button>
              <button class="step-btn" id="replay-step" title="Step 1 tick">+1</button>
              <button class="step-btn" id="replay-next" title="Forward 60 ticks (1s)">+60</button>
              <input id="replay-timeline" type="range" min="0" max="1000" value="0" step="1" aria-label="Replay timeline" />
              <span class="timecode" id="replay-timecode">0.00 / 0.00s</span>
              <div class="playback-divider"></div>
              <select id="replay-speed-select" aria-label="Replay speed">
                <option value="0.5">0.5×</option>
                <option value="1" selected>1× speed</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
            </div>
          </div>
          <input type="file" id="replay-file-input" accept=".json,application/json" style="display:none" />

          <!-- VS Setup overlay (character & opponent selection) -->
          <div class="vs-setup" id="vs-setup" style="display:none" aria-label="Versus match setup">
            <div class="vs-setup-inner">
              <div class="vs-header">
                <div class="vs-header-titles">
                  <span class="vs-kicker"><span class="status-dot"></span> MATCH SETUP // ĐỐI ĐẦU</span>
                  <h2 class="vs-heading">CHỌN ĐẤU THỦ</h2>
                </div>
                <button class="vs-close-btn" id="vs-close-btn" type="button" aria-label="Close setup">✕</button>
              </div>

              <div class="vs-roster-row">
                <!-- Player Side (Left) -->
                <div class="vs-fighter-card vs-card-player" id="vs-card-p1">
                  <div class="vs-role-badge badge-p1"><span class="badge-dot"></span> P1 // YOU (BẠN)</div>
                  <div class="vs-portrait-box">
                    <img class="vs-portrait-img" id="vs-portrait-p1" alt="P1 Robot Portrait" />
                  </div>
                  <div class="vs-meta">
                    <span class="vs-series" id="vs-series-p1">F-09</span>
                    <strong class="vs-name" id="vs-name-p1">FORGE // TITAN</strong>
                    <span class="vs-archetype" id="vs-archetype-p1">HEAVY BRAWLER</span>
                    <p class="vs-tagline" id="vs-tagline-p1">Built to walk through the hit.</p>
                  </div>
                  <div class="vs-stat-meters" id="vs-stats-p1">
                    <div class="vs-stat-row"><span class="vs-stat-label">PWR</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-p1-pwr"></div></div></div>
                    <div class="vs-stat-row"><span class="vs-stat-label">SPD</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-p1-spd"></div></div></div>
                    <div class="vs-stat-row"><span class="vs-stat-label">GRD</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-p1-grd"></div></div></div>
                    <div class="vs-stat-row"><span class="vs-stat-label">ARM</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-p1-arm"></div></div></div>
                  </div>
                </div>

                <!-- Center VS Badge -->
                <div class="vs-center-col">
                  <div class="vs-emblem-circle">
                    <span class="vs-emblem-text">VS</span>
                  </div>
                  <div class="vs-match-info">
                    <span class="vs-info-tag">1 ROUND · 180S</span>
                    <span class="vs-info-tag">AUTONOMOUS</span>
                    <span class="vs-info-tag">LIVE COACHING</span>
                  </div>
                </div>

                <!-- Opponent Side (Right) -->
                <div class="vs-fighter-card vs-card-cpu" id="vs-card-cpu">
                  <div class="vs-role-badge badge-cpu"><span class="badge-dot"></span> CPU // OPPONENT (ĐỐI THỦ)</div>
                  <div class="vs-opponent-picker">
                    <label for="vs-opponent-select" class="vs-picker-label">CHỌN ĐỐI THỦ:</label>
                    <div class="vs-picker-actions">
                      <select id="vs-opponent-select" class="vs-opponent-select" aria-label="Select CPU opponent"></select>
                      <button id="vs-random-btn" class="vs-random-btn" type="button" title="Chọn đối thủ ngẫu nhiên">🎲 RANDOM</button>
                    </div>
                  </div>
                  <div class="vs-portrait-box">
                    <img class="vs-portrait-img" id="vs-portrait-cpu" alt="CPU Robot Portrait" />
                  </div>
                  <div class="vs-meta">
                    <span class="vs-series" id="vs-series-cpu">A-12</span>
                    <strong class="vs-name" id="vs-name-cpu">AEGIS // PRIME</strong>
                    <span class="vs-archetype" id="vs-archetype-cpu">DEFENSIVE SENTINEL</span>
                    <p class="vs-tagline" id="vs-tagline-cpu">Hold the line. Own the exchange.</p>
                  </div>
                  <div class="vs-stat-meters" id="vs-stats-cpu">
                    <div class="vs-stat-row"><span class="vs-stat-label">PWR</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-cpu-pwr"></div></div></div>
                    <div class="vs-stat-row"><span class="vs-stat-label">SPD</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-cpu-spd"></div></div></div>
                    <div class="vs-stat-row"><span class="vs-stat-label">GRD</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-cpu-grd"></div></div></div>
                    <div class="vs-stat-row"><span class="vs-stat-label">ARM</span><div class="vs-stat-bar"><div class="vs-stat-fill" id="vs-cpu-arm"></div></div></div>
                  </div>
                </div>
              </div>

              <!-- Bottom Actions -->
              <div class="vs-actions-bar">
                <button class="vs-back-btn" id="vs-back-btn" type="button">✕ QUAY LẠI LAB</button>
                <button class="vs-fight-btn" id="vs-start-fight" type="button">⚔ BẮT ĐẦU TRẬN ĐẤU (FIGHT!)</button>
              </div>
            </div>
          </div>

          <span class="stage-corner corner-tl"></span>
          <span class="stage-corner corner-tr"></span>
          <span class="stage-corner corner-bl"></span>
          <span class="stage-corner corner-br"></span>

          <div class="stage-label">
            <span class="stage-label-line"></span>
            <span id="stage-id">F-09</span>
            <small>15-PART ARTICULATED BODY</small>
          </div>

          <div class="view-tools">
            <button id="btn-rotate" class="tool-button" title="Auto rotate" aria-pressed="false" aria-label="Toggle auto rotate">${icon('rotate')}</button>
            <button id="btn-grid"   class="tool-button active" title="Floor grid" aria-pressed="true"  aria-label="Toggle floor grid">${icon('grid')}</button>
            <button id="btn-reset"  class="tool-button" title="Reset camera" aria-label="Reset camera">${icon('expand')}</button>
          </div>

          <div class="viewport-bottom">
            <span>${icon('mouse')} DRAG TO ROTATE · SCROLL TO ZOOM</span>
            <span class="fps-label" id="fps-label">REAL-TIME / — FPS</span>
          </div>
        </div><!-- /viewport -->

        <!-- dossier -->
        <aside class="dossier" id="dossier">
          <div class="dossier-kicker">
            <span>FIGHTER PROFILE</span><span id="dossier-id">F-09 — RF</span>
          </div>
          <div class="fighter-role">
            <span class="role-dot" id="role-dot"></span>
            <span id="fighter-role">HEAVY BRAWLER</span>
          </div>
          <h2 id="fighter-name">FORGE<span id="fighter-sub">— F-09</span></h2>
          <p class="fighter-desc" id="fighter-desc"></p>
          <div class="class-tags" id="class-tags"></div>
          <div class="measurements">
            <div><span>HEIGHT</span><strong id="fighter-height">2.28 m</strong></div>
            <div><span>CHASSIS</span><strong>15 parts</strong></div>
          </div>
          <div class="stats" id="stat-bars"></div>
          <button class="signature" id="sig-btn" aria-label="Play signature move">
            <span class="sig-icon">${icon('victory')}</span>
            <div>
              <span>SIGNATURE MOVE</span>
              <span class="sig-name" id="sig-name">—</span>
            </div>
          </button>
          <button class="btn-dossier-fight" id="btn-dossier-fight" type="button" aria-label="Xuất trận với robot này">
            <span class="fight-swords">⚔</span> XUẤT TRẬN VỚI ROBOT NÀY (FIGHT!)
          </button>
          <div class="parts-badge">
            ${icon('cube')}<span><strong>15</strong> rigid body parts</span>
            <span class="parts-status">R15</span>
          </div>
        </aside>

      </div><!-- /showcase -->

      <!-- motion panel -->
      <section class="motion-panel">
        <div class="motion-heading">
          <div class="section-heading">
            <h2>MOTION LIBRARY</h2><span class="count" id="clip-count">06</span>
          </div>
          <span class="rigid-label"><span></span> RIGID PARTS. REAL ATTITUDE.</span>
        </div>

        <div class="motion-filters" id="motion-filters" role="group" aria-label="Nhóm animation">
          ${[['CHARACTER','Đặc trưng'],['MOVEMENT','Di chuyển'],['ATTACK','Tấn công'],['DEFENSE','Phòng thủ'],['REACTION','Trúng đòn'],['RECOVERY','Ngã / đứng dậy'],['ALL','Tất cả']].map(([id,label]) => `<button data-family="${id}" aria-pressed="${id === 'CHARACTER'}">${label}</button>`).join('')}
        </div>
        <div class="clip-grid" id="clip-grid"></div>
        <div class="motion-detail"><strong id="motion-phase">READY</strong><span id="motion-description"></span></div>
        <p class="motion-disclaimer">Preview tại chỗ · Marker không áp damage · 1–6 chọn sáu động tác đầu trong nhóm</p>

        <div class="playback">
          <button class="step-btn" id="btn-prev" aria-label="Previous frame">${icon('prev')}</button>
          <button class="play-btn" id="btn-play" aria-label="Pause">${icon('pause')}</button>
          <button class="step-btn" id="btn-next" aria-label="Next frame">${icon('next')}</button>
          <span class="playback-name" id="pb-name">Combat Idle <span>/ Playing</span></span>
          <input id="timeline" type="range" min="0" max="1000" value="0" step="1" aria-label="Animation timeline" />
          <span class="timecode" id="timecode">0.00 / 0.00s</span>
          <div class="playback-divider"></div>
          <button class="loop-btn active" id="btn-loop" aria-pressed="true" aria-label="Toggle loop">
            ${icon('loop')}<span>Loop</span>
          </button>
          <select id="speed-select" aria-label="Playback speed">
            <option value="0.5">0.5×</option>
            <option value="1" selected>1× speed</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </div>
      </section>
    </div><!-- /workspace -->
  </div><!-- /lab-layout -->

  <footer class="site-footer">
    <span><span class="footer-cross">+</span> NO SKINNING. NO SHORTCUTS. JUST STEEL.</span>
    <span>200 CLIPS / 5 CHASSIS <span class="footer-cross">↗</span></span>
  </footer>
</main>

<dialog id="about-dialog">
  <button id="btn-close-about" class="tool-button" aria-label="Close">${icon('close')}</button>
  <div class="eyebrow">ROBOT FOUNDRY / VOL. 002</div>
  <h2>Small parts.<br/>Big personalities.</h2>
  <p>A procedural robot fighting-game prototype. Each fighter is built from 15 independently articulated body parts, with armour and signature details attached to rigid joint groups.</p>
  <div class="about-specs">
    <span>01 Head</span><span>02 Torso segments</span>
    <span>06 Arm segments</span><span>06 Leg segments</span>
  </div>
  <p>Built with JavaScript and Three.js. No imported models, skeletons, or skinning. Choose a fighter, drag to inspect, and try the motion library.</p>
  <div class="dialog-hint">KEYBOARD: 1–6 select motion · SPACE play / pause · T auto-rotate · O reset camera</div>
</dialog>

<dialog id="history-dialog">
  <button id="btn-close-history" class="tool-button" aria-label="Close">${icon('close')}</button>
  <div class="eyebrow">ROBOT FOUNDRY / MATCH ARCHIVE</div>
  <h2>Match History &amp; Replays</h2>
  <p>Locally recorded bouts. Watch saved match replays offline or import replay files.</p>
  <div class="history-actions">
    <button id="btn-history-import" class="tool-button-text" type="button">${icon('arrow')} IMPORT REPLAY (.JSON)</button>
    <button id="btn-history-clear" class="tool-button-text" type="button">CLEAR ALL</button>
  </div>
  <div class="history-list" id="history-list"></div>
</dialog>

<div class="toast" id="toast" role="status"></div>
`;

    this._el = id => document.getElementById(id);
  }

  applySettings(settings = {}) {
    const language = settings.language === 'vi-VN' ? 'vi-VN' : 'en-US';
    const languageSelect = this._el('coach-language');
    if (languageSelect) languageSelect.value = language;

    const speed = Number.isFinite(settings.speed) ? Math.max(.25, Math.min(2, settings.speed)) : 1;
    const speedSelect = this._el('speed-select');
    if (speedSelect) speedSelect.value = String(speed);

    const loop = settings.loop !== false;
    const loopButton = this._el('btn-loop');
    if (loopButton) {
      loopButton.setAttribute('aria-pressed', String(loop));
      loopButton.classList.toggle('active', loop);
    }

    const grid = settings.gridVisible !== false;
    const gridButton = this._el('btn-grid');
    if (gridButton) {
      gridButton.setAttribute('aria-pressed', String(grid));
      gridButton.classList.toggle('active', grid);
    }
  }

  // ── Events ──────────────────────────────────────────────────────
  _bindEvents() {
    const { options } = this;
    const el = id => this._el(id);

    el('btn-play').addEventListener('click', () => options.onTogglePlay());
    el('btn-prev').addEventListener('click', () => options.onStepFrame(-1));
    el('btn-next').addEventListener('click', () => options.onStepFrame(1));
    el('btn-loop').addEventListener('click', () => {
      const loop = el('btn-loop').getAttribute('aria-pressed') !== 'true';
      el('btn-loop').setAttribute('aria-pressed', String(loop));
      el('btn-loop').classList.toggle('active', loop);
      options.onLoopToggle(loop);
    });
    el('timeline').addEventListener('input', e =>
      options.onScrub(Number(e.target.value) / 1000)
    );
    el('speed-select').addEventListener('change', e =>
      options.onSpeedChange(Number(e.target.value))
    );
    el('btn-rotate').addEventListener('click', () => {
      const pressed = options.onTurntableToggle();
      el('btn-rotate').classList.toggle('active', String(pressed) === 'true');
      el('btn-rotate').setAttribute('aria-pressed', String(pressed) === 'true');
    });
    el('btn-grid').addEventListener('click', () => {
      const active = el('btn-grid').getAttribute('aria-pressed') !== 'true';
      el('btn-grid').classList.toggle('active', active);
      el('btn-grid').setAttribute('aria-pressed', String(active));
      options.onGridToggle?.(active);
    });
    el('btn-reset').addEventListener('click', () => {
      options.onResetCamera();
      el('btn-rotate').classList.remove('active');
      el('btn-rotate').setAttribute('aria-pressed', 'false');
    });
    el('sig-btn').addEventListener('click', () => this.selectClip('signature'));
    el('motion-filters').addEventListener('click', event => {
      const button = event.target.closest('[data-family]');
      if (!button) return;
      this.family = button.dataset.family;
      this.renderClips();
    });

    // About dialog
    el('nav-about').addEventListener('click', () => el('about-dialog').showModal());
    el('btn-close-about').addEventListener('click', () => el('about-dialog').close());
    el('about-dialog').addEventListener('click', e => {
      const rect = el('about-dialog').getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom)
        el('about-dialog').close();
    });

    // Match history dialog
    el('nav-history').addEventListener('click', () => options.onOpenHistory?.());
    el('btn-close-history').addEventListener('click', () => el('history-dialog').close());
    el('history-dialog').addEventListener('click', e => {
      const rect = el('history-dialog').getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom)
        el('history-dialog').close();
    });
    el('btn-history-import').addEventListener('click', () => el('replay-file-input').click());
    el('replay-import-btn')?.addEventListener('click', () => el('replay-file-input').click());
    el('btn-history-clear').addEventListener('click', () => options.onClearHistory?.());
    el('replay-watch-last')?.addEventListener('click', () => options.onWatchLastReplay?.());

    // File input for replay import
    el('replay-file-input').addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const maxBytes = 2 * 1024 * 1024;
      if (file.size > maxBytes) {
        options.onReplayImportError?.('replay file too large');
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        options.onReplayImportFile?.(reader.result);
        event.target.value = '';
      };
      reader.onerror = () => {
        options.onReplayImportError?.('replay file could not be read');
        event.target.value = '';
      };
      reader.readAsText(file);
    });

    // Replay playback controls
    el('replay-play-btn').addEventListener('click', () => options.onReplayTogglePlay?.());
    el('replay-prev').addEventListener('click', () => options.onReplayStep?.(-60));
    el('replay-step').addEventListener('click', () => options.onReplayStep?.(1));
    el('replay-next').addEventListener('click', () => options.onReplayStep?.(60));
    el('replay-timeline').addEventListener('input', e => options.onReplayScrub?.(Number(e.target.value)));
    el('replay-speed-select').addEventListener('change', e => options.onReplaySpeed?.(Number(e.target.value)));
    el('replay-exit-btn').addEventListener('click', () => options.onReplayExit?.());

    el('nav-lab').addEventListener('click', () =>
      document.querySelector('.lab-layout')?.scrollIntoView({ behavior: 'smooth' })
    );
    el('hero-lab-btn')?.addEventListener('click', () =>
      document.querySelector('.lab-layout')?.scrollIntoView({ behavior: 'smooth' })
    );
    el('nav-fight').addEventListener('click', () => {
      options.onFightToggle?.();
    });
    el('nav-sandbox').addEventListener('click', () => {
      options.onSandboxToggle?.();
    });
    el('hero-fight-btn')?.addEventListener('click', () => {
      options.onFightToggle?.();
    });
    el('btn-dossier-fight')?.addEventListener('click', () => {
      options.onFightToggle?.();
    });

    // VS Setup controls
    el('vs-close-btn')?.addEventListener('click', () => {
      this._vsCallbacks?.onCancel?.();
    });
    el('vs-back-btn')?.addEventListener('click', () => {
      this._vsCallbacks?.onCancel?.();
    });
    el('vs-start-fight')?.addEventListener('click', () => {
      this._vsCallbacks?.onStartFight?.(this._vsOpponentDefId);
    });
    el('vs-opponent-select')?.addEventListener('change', e => {
      this._vsOpponentDefId = e.target.value;
      this._updateVsCards();
      this._vsCallbacks?.onSelectOpponent?.(this._vsOpponentDefId);
    });
    el('vs-random-btn')?.addEventListener('click', () => {
      if (this._vsCallbacks?.onRandomOpponent) {
        this._vsOpponentDefId = this._vsCallbacks.onRandomOpponent();
        const select = this._el('vs-opponent-select');
        if (select) select.value = this._vsOpponentDefId;
        this._updateVsCards();
      }
    });
    el('fight-reset').addEventListener('click', () => {
      options.onFightReset?.();
      this.showToast('FIGHT RESET');
    });
    el('sandbox-reset').addEventListener('click', () => {
      options.onSandboxReset?.();
      this.showToast('SANDBOX RESET');
    });
    el('sandbox-voice').addEventListener('click', () => options.onVoiceToggle?.());
    el('sandbox-form').addEventListener('submit', event => {
      event.preventDefault();
      const input = el('sandbox-input');
      const text = input.value.trim();
      if (!text) return;
      options.onSandboxCommand?.(text, el('coach-language').value);
      input.value = '';
    });
    el('result-rematch')?.addEventListener('click', () => {
      options.onFightReset?.();
      this.showToast('REMATCH STARTED · ĐẤU LẠI');
    });
    el('result-change-opponent')?.addEventListener('click', () => {
      options.onChangeOpponent?.();
    });
    el('result-back-lab')?.addEventListener('click', () => {
      options.onBackToLab?.();
    });
    el('replay-export').addEventListener('click', () => options.onReplayExport?.());
    el('coach-language').addEventListener('change', event => options.onCoachLanguage?.(event.target.value));
    el('coach-mic').addEventListener('click', () => options.onVoiceToggle?.());
    el('timeout-open').addEventListener('click', () => options.onTimeoutOpen?.());
    el('timeout-cancel').addEventListener('click', () => options.onTimeoutCancel?.());
    el('timeout-preview').addEventListener('click', () => options.onTimeoutPreview?.(this.getTimeoutDraft()));
    ['tactic-name', 'tactic-goal', 'tactic-priority', 'tactic-trigger-action', 'tactic-schema', 'tactic-sequence', 'tactic-repeat', 'tactic-timeout', 'tactic-abort-edge'].forEach(id => {
      el(id).addEventListener('input', () => options.onTimeoutDraftChanged?.());
      el(id).addEventListener('change', () => options.onTimeoutDraftChanged?.());
    });
    el('tactic-select').addEventListener('change', event => options.onTimeoutSelect?.(event.target.value));
    el('tactic-new').addEventListener('click', () => options.onTimeoutNew?.());
    el('tactic-delete').addEventListener('click', () => options.onTimeoutDelete?.());
    el('timeout-suggest').addEventListener('click', () => options.onTimeoutSuggest?.(el('tactic-prompt').value.trim()));
    el('timeout-commit').addEventListener('click', () => options.onTimeoutCommit?.());
    el('coach-form').addEventListener('submit', event => {
      event.preventDefault();
      const input = el('coach-input');
      const text = input.value.trim();
      if (!text) return;
      options.onCoachText?.(text, el('coach-language').value);
      input.value = '';
    });

    // Keyboard
    window.addEventListener('keydown', e => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || el('about-dialog').open) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.code === 'Space') { e.preventDefault(); options.onTogglePlay(); }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); options.onStepFrame(-1); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); options.onStepFrame(1);  }
      else if (e.code === 'KeyT') el('btn-rotate').click();
      else if (e.code === 'KeyO') el('btn-reset').click();
      else if (/^Digit[1-6]$/.test(e.code)) {
        const clip = this.visibleClips[Number(e.code.at(-1)) - 1];
        if (clip) this.selectClip(clip.key);
      }
    });
  }

  // ── Roster ──────────────────────────────────────────────────────
  populateRobotCatalog(catalog, selectedId) {
    const list = this._el('fighter-list');
    list.replaceChildren();

    catalog.forEach((robot, i) => {
      const btn = document.createElement('button');
      btn.className = `fighter-card${robot.id === selectedId ? ' selected' : ''}`;
      btn.dataset.robotId = robot.id;
      btn.setAttribute('aria-pressed', robot.id === selectedId);
      btn.style.setProperty('--accent', `#${robot.colors.accent.toString(16).padStart(6, '0')}`);

      // Portrait thumbnail: rendered later by main.js via setPortrait()
      btn.innerHTML = `
        <span class="card-number">0${i + 1}</span>
        <span class="card-check">${icon('check')}</span>
        <img class="fighter-thumb" id="thumb-${i}" alt="${robot.name} robot" />
        <span class="fighter-card-copy">
          <strong>${robot.shortName}</strong>
          <span>${robot.archetype}</span>
        </span>
        <span class="card-arrow">${icon('arrow')}</span>`;

      btn.addEventListener('click', () => this.options.onRobotChange(robot.id));
      list.appendChild(btn);
    });
  }

  // ── Active robot ────────────────────────────────────────────────
  setActiveRobot(robot) {
    const hex = c => `#${c.toString(16).padStart(6, '0')}`;
    const accent = hex(robot.colors.accent);
    document.documentElement.style.setProperty('--accent', accent);

    // Roster highlight
    document.querySelectorAll('[data-robot-id]').forEach((btn, i) => {
      const active = btn.dataset.robotId === robot.id;
      btn.classList.toggle('selected', active);
      btn.setAttribute('aria-pressed', active);
      // Stripe colour
      if (active) btn.style.setProperty('--accent', accent);
    });

    // Unit counter (index from catalog position)
    const unitStr = String(
      document.querySelectorAll('[data-robot-id]').length &&
      [...document.querySelectorAll('[data-robot-id]')].findIndex(b => b.dataset.robotId === robot.id) + 1
    ).padStart(2, '0');

    this._el('unit-num').textContent     = unitStr;
    this._el('watermark').textContent    = robot.shortName;
    this._el('stage-id').textContent     = robot.series;
    this._el('dossier-id').textContent   = `${robot.series} — RF`;
    this._el('fighter-role').textContent = robot.archetype;
    this._el('role-dot').style.background = accent;
    this._el('fighter-name').firstChild.textContent = robot.shortName;
    this._el('fighter-sub').textContent  = `— ${robot.series}`;
    this._el('fighter-desc').textContent = robot.tagline;
    this._el('fighter-height').textContent = `${robot.proportions.height.toFixed(2)} m`;
    this._el('sig-name').textContent     = robot.signature;

    // Class tags
    const tags = this._el('class-tags');
    tags.replaceChildren();
    [robot.archetype.split(' ')[0], robot.proportions.height >= 2.4 ? 'TALL' : 'COMPACT'].forEach(t => {
      const s = document.createElement('span');
      s.textContent = t; tags.appendChild(s);
    });

    // Stat bars
    const bars = this._el('stat-bars');
    bars.replaceChildren();
    for (const [key, value] of Object.entries(robot.stats)) {
      const div = document.createElement('div');
      div.className = 'stat';
      div.innerHTML = `
        <div class="stat-head">
          <span>${STAT_LABELS[key] ?? key}</span>
          <strong>${value}<small>/100</small></strong>
        </div>
        <div class="stat-track">
          <span style="width:${value}%;background:${accent}"></span>
        </div>`;
      bars.appendChild(div);
    }
  }

  // ── Clip list ───────────────────────────────────────────────────
  populateClipList(clips, active) {
    this.currentClipList = clips;
    this.activeClip = clips.find(c => c.key === active || c.id === active);
    this.renderClips();
    this.selectClipVisual(active);
  }

  renderClips() {
    const clips = this.currentClipList;
    this.visibleClips = clips.filter(c => this.family === 'ALL' || c.family === this.family);
    this._el('motion-filters').querySelectorAll('[data-family]').forEach(b => b.setAttribute('aria-pressed', b.dataset.family === this.family));
    const grid = this._el('clip-grid');
    grid.replaceChildren();

    this.visibleClips.forEach((clip, i) => {
      const btn = document.createElement('button');
      btn.className = 'clip-button';
      btn.dataset.clipKey = clip.key;
      btn.dataset.motionId = clip.id;
      btn.title = `${clip.duration.toFixed(2)}s · ${clip.description}`;
      const selected = clip.id === this.activeClip?.id;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', selected);
      const iconName = CLIP_ICONS[clip.category] ?? 'idle';
      btn.innerHTML = `
        <span class="clip-icon">${icon(iconName)}</span>
        <span>${clip.label}</span>
        <kbd>${i < 6 ? i + 1 : ''}</kbd>`;
      btn.addEventListener('click', () => this.selectClip(clip.key));
      grid.appendChild(btn);
    });

    this._el('clip-count').textContent = `${this.visibleClips.length} / ${clips.length}`;
  }

  selectClip(key) {
    this.options.onSelectClip(key);
    this.selectClipVisual(key);
  }

  selectClipVisual(key) {
    const clip = this.currentClipList.find(c => c.key === key || c.id === key);
    if (!clip) return;
    this.activeClip = clip;
    if (this.family !== 'ALL' && this.family !== clip.family) {
      this.family = clip.family;
      this.renderClips();
    }
    this._el('motion-description').textContent = clip.description;
    document.querySelectorAll('[data-clip-key]').forEach(btn => {
      const active = btn.dataset.clipKey === clip.key;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active);
    });

    this._el('pb-name').textContent = clip.label;
  }

  // ── Frame updates ───────────────────────────────────────────────
  update(state, fps) {
    const progress = state.duration > 0
      ? (state.currentTime / state.duration * 100).toFixed(1)
      : '0';

    const tl = this._el('timeline');
    tl.value = Math.round(state.currentTime / (state.duration || 1) * 1000);
    tl.style.setProperty('--progress', `${progress}%`);

    this._el('timecode').textContent =
      `${state.currentTime.toFixed(2)} / ${state.duration.toFixed(2)}s`;

    const paused = state.isPaused;
    const playBtn = this._el('btn-play');
    if (playBtn.getAttribute('aria-label') !== (paused ? 'Play' : 'Pause')) {
      playBtn.innerHTML = icon(paused ? 'play' : 'pause');
      playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    }
    const fraction = state.currentTime / (state.duration || 1);
    const clip = this.activeClip;
    const impacts = clip?.impacts || [];
    let phase = clip?.family || 'READY';
    if (impacts.length) {
      const next = impacts.find(t => fraction < t + .07);
      phase = next === undefined ? 'RECOVERY' : fraction < next - .12 ? 'WIND-UP' : fraction < next - .025 ? 'STRIKE' : 'IMPACT';
    }
    if (clip?.exit === 'down' && fraction >= .99) phase = 'DOWN';
    this._el('motion-phase').textContent = `${paused ? 'PAUSED · ' : ''}${phase}`;
    const loopButton = this._el('btn-loop');
    const forcedOnce = clip && ['once','hold'].includes(clip.playback);
    loopButton.disabled = Boolean(forcedOnce);
    loopButton.title = forcedOnce ? 'State transition: không lặp ngã / đứng dậy' : 'Lặp preview';

    this._el('fps-label').textContent = `REAL-TIME / ${Math.round(fps)} FPS`;
  }

  // ── Portrait thumbnails ─────────────────────────────────────────
  setPortrait(index, dataUrl) {
    if (!this._portraits) this._portraits = [];
    this._portraits[index] = dataUrl;
    const img = document.getElementById(`thumb-${index}`);
    if (img) img.src = dataUrl;
    this._syncVsPortraits();
  }

  // ── VS Setup UI ──────────────────────────────────────────────────
  showVsSetup({ playerDefId, opponentDefId, catalog, onSelectOpponent, onRandomOpponent, onStartFight, onCancel }) {
    this._vsCatalog = catalog;
    this._vsPlayerDefId = playerDefId;
    this._vsOpponentDefId = opponentDefId;
    this._vsCallbacks = { onSelectOpponent, onRandomOpponent, onStartFight, onCancel };

    const vsEl = this._el('vs-setup');
    if (!vsEl) return;

    // Populate opponent dropdown
    const select = this._el('vs-opponent-select');
    if (select) {
      select.innerHTML = '';
      catalog.forEach(robot => {
        const opt = document.createElement('option');
        opt.value = robot.id;
        opt.textContent = `${robot.shortName} (${robot.archetype})`;
        if (robot.id === opponentDefId) opt.selected = true;
        select.appendChild(opt);
      });
    }

    this._updateVsCards();

    vsEl.style.display = 'flex';
    document.querySelector('.site-main')?.classList.add('vs-setup-active');
  }

  hideVsSetup() {
    const vsEl = this._el('vs-setup');
    if (vsEl) vsEl.style.display = 'none';
    document.querySelector('.site-main')?.classList.remove('vs-setup-active');
  }

  _updateVsCards() {
    if (!this._vsCatalog) return;
    const p1Def = this._vsCatalog.find(r => r.id === this._vsPlayerDefId) || this._vsCatalog[0];
    const cpuDef = this._vsCatalog.find(r => r.id === this._vsOpponentDefId) || this._vsCatalog[1];

    this._renderVsCard('p1', p1Def);
    this._renderVsCard('cpu', cpuDef);
    this._syncVsPortraits();
  }

  _renderVsCard(prefix, def) {
    if (!def) return;
    const series = this._el(`vs-series-${prefix}`);
    const name = this._el(`vs-name-${prefix}`);
    const archetype = this._el(`vs-archetype-${prefix}`);
    const tagline = this._el(`vs-tagline-${prefix}`);
    const card = this._el(`vs-card-${prefix}`);

    if (series) series.textContent = def.series || '';
    if (name) name.textContent = def.name || def.shortName;
    if (archetype) archetype.textContent = def.archetype || '';
    if (tagline) tagline.textContent = def.tagline || '';
    if (card && def.colors?.accent) {
      card.style.setProperty('--card-accent', `#${def.colors.accent.toString(16).padStart(6, '0')}`);
    }

    const stats = def.stats || {};
    const pwr = this._el(`vs-${prefix}-pwr`);
    const spd = this._el(`vs-${prefix}-spd`);
    const grd = this._el(`vs-${prefix}-grd`);
    const arm = this._el(`vs-${prefix}-arm`);
    if (pwr) pwr.style.width = `${stats.power || 50}%`;
    if (spd) spd.style.width = `${stats.speed || 50}%`;
    if (grd) grd.style.width = `${stats.guard || 50}%`;
    if (arm) arm.style.width = `${stats.armor || 50}%`;
  }

  _syncVsPortraits() {
    if (!this._vsCatalog) return;
    const p1Idx = this._vsCatalog.findIndex(r => r.id === this._vsPlayerDefId);
    const cpuIdx = this._vsCatalog.findIndex(r => r.id === this._vsOpponentDefId);

    const p1Img = this._el('vs-portrait-p1');
    const cpuImg = this._el('vs-portrait-cpu');

    if (p1Img && p1Idx >= 0) {
      const src = this._portraits?.[p1Idx] || document.getElementById(`thumb-${p1Idx}`)?.src;
      if (src) p1Img.src = src;
    }
    if (cpuImg && cpuIdx >= 0) {
      const src = this._portraits?.[cpuIdx] || document.getElementById(`thumb-${cpuIdx}`)?.src;
      if (src) cpuImg.src = src;
    }
  }

  // ── Fight mode UI ───────────────────────────────────────────────
  setFightMode(active, options = {}) {
    this.hideVsSetup();
    // Toggle visibility of showcase vs fight elements
    document.querySelector('.site-main')?.classList.toggle('fight-mode-active', active);
    const showcaseEls = document.querySelectorAll('.dossier, .motion-panel, .page-heading, aside');
    showcaseEls.forEach(el => el.style.display = active ? 'none' : '');

    const fightHud = this._el('fight-hud');
    const fightReset = this._el('fight-reset');
    const sandboxHud = this._el('sandbox-hud');
    const watermark = this._el('watermark');
    if (sandboxHud) sandboxHud.style.display = 'none';
    if (fightHud) fightHud.style.display = active ? '' : 'none';
    if (fightReset) fightReset.style.display = active ? '' : 'none';
    if (watermark) watermark.style.display = active ? 'none' : '';

    // Nav button states
    document.getElementById('nav-lab')?.classList.toggle('active', !active);
    document.getElementById('nav-fight')?.classList.toggle('active', active);
    document.getElementById('nav-sandbox')?.classList.remove('active');

    // Playback controls hidden in fight mode
    const playback = document.querySelector('.playback');
    if (playback) playback.style.display = active ? 'none' : '';
    const coachPanel = this._el('coach-panel');
    if (coachPanel) coachPanel.style.display = active ? '' : 'none';

    // Update Coach context & fighter identity labels immediately
    const matchSetup = options.matchSetup;
    const playerDefId = matchSetup?.playerDefId || this._vsPlayerDefId || 'forge-titan';
    const opponentDefId = matchSetup?.opponentDefId || this._vsOpponentDefId || 'aegis-prime';
    const playerDef = getRobotDefinition(playerDefId);
    const opponentDef = getRobotDefinition(opponentDefId);
    const shortA = playerDef?.shortName || 'TITAN';
    const shortB = opponentDef?.shortName || 'PRIME';

    if (active) {
      const nameA = this._el('fight-name-a');
      const nameB = this._el('fight-name-b');
      if (nameA) {
        nameA.innerHTML = `<span class="fight-badge badge-you">YOU</span> <strong class="fighter-label-name">${shortA}</strong> · 100HP`;
      }
      if (nameB) {
        nameB.innerHTML = `<span class="fight-badge badge-cpu">CPU</span> <strong class="fighter-label-name">${shortB}</strong> · 100HP`;
      }
    }

    const kicker = this._el('coach-kicker');
    if (kicker) {
      kicker.textContent = active
        ? `COACHING ${shortA} (YOU) · CHỈ ĐẠO CHIẾN THUẬT`
        : 'LIVE COACH / REACTIVE ONLY';
    }
    const coachInput = this._el('coach-input');
    if (coachInput) {
      coachInput.placeholder = active
        ? `Ra lệnh cho ${shortA}: Jab him / Giữ khoảng cách...`
        : 'Jab him / Giữ khoảng cách';
    }

    if (!active) {
      this.setCoachFeedback('TEXT READY · ROBOT AUTONOMOUS');
    } else {
      this.setCoachFeedback(`SẴN SÀNG CHỈ ĐẠO ${shortA} (YOU) · ROBOT TỰ CHỦ CHIẾN ĐẤU`);
    }
  }

  // ── Sandbox mode UI ────────────────────────────────────────────
  setSandboxMode(active) {
    const showcaseEls = document.querySelectorAll('.dossier, .motion-panel, .page-heading, aside');
    showcaseEls.forEach(el => el.style.display = active ? 'none' : '');
    document.querySelector('.site-main')?.classList.toggle('fight-mode-active', active);
    this._el('sandbox-hud').style.display = active ? '' : 'none';
    this._el('fight-hud').style.display = 'none';
    this._el('coach-panel').style.display = 'none';
    this._el('fight-reset').style.display = 'none';
    this._el('watermark').style.display = active ? 'none' : '';
    document.getElementById('nav-lab')?.classList.toggle('active', !active);
    document.getElementById('nav-fight')?.classList.remove('active');
    document.getElementById('nav-sandbox')?.classList.toggle('active', active);
    if (active) this.setSandboxFeedback('JEV READY · ROBOT AUTONOMOUS · TEACH ME RULES');
  }

  setSandboxFeedback(message, tone = '') {
    const el = this._el('sandbox-command-status');
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  }

  updateSandboxHUD(state) {
    if (!state?.player) return;
    const p = state.player;
    this._el('sandbox-hp').textContent = `${Math.round(p.health)}`;
    this._el('sandbox-energy').textContent = `${Math.round(p.energy)}`;
    this._el('sandbox-score').textContent = `${state.score}`;
    this._el('sandbox-zombies').textContent = `${state.zombies.length} HOSTILES`;
    const hour = Math.round(((p.heading % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 6)) % 12 || 12;
    this._el('sandbox-heading').textContent = state.plan?.currentType
      ? `HEADING ${hour} O'CLOCK · MISSION ${state.plan.currentType.toUpperCase()}`
      : `HEADING ${hour} O'CLOCK`;
  }

  // ── Replay mode UI ──────────────────────────────────────────────
  setReplayMode(active, info = {}) {
    document.querySelector('.site-main')?.classList.toggle('fight-mode-active', active);
    const showcaseEls = document.querySelectorAll('.dossier, .motion-panel, .page-heading, aside');
    showcaseEls.forEach(el => el.style.display = active ? 'none' : '');

    const fightHud = this._el('fight-hud');
    const fightReset = this._el('fight-reset');
    const sandboxHud = this._el('sandbox-hud');
    const coachPanel = this._el('coach-panel');
    const replayHud = this._el('replay-hud');
    if (sandboxHud) sandboxHud.style.display = 'none';
    const watermark = this._el('watermark');
    const fightResult = this._el('fight-result');

    if (fightHud) fightHud.style.display = active ? '' : 'none';
    if (fightReset) fightReset.style.display = 'none';
    if (coachPanel) coachPanel.style.display = 'none';
    if (replayHud) replayHud.style.display = active ? '' : 'none';
    if (watermark) watermark.style.display = active ? 'none' : '';
    if (fightResult && !active) fightResult.hidden = true;

    if (active && info.matchup) {
      const matchupEl = this._el('replay-matchup');
      if (matchupEl) matchupEl.textContent = info.matchup;
    }

    document.getElementById('nav-lab')?.classList.toggle('active', !active);
    document.getElementById('nav-fight')?.classList.remove('active');
    document.getElementById('nav-sandbox')?.classList.remove('active');
  }

  updateReplayHUD(replayState) {
    if (!replayState) return;
    const { tick, totalTicks, isPlaying, state, defA, defB } = replayState;

    if (state) {
      const { a, b, matchStatus, winnerId } = state;
      const hpA = this._el('fight-hp-a');
      const hpB = this._el('fight-hp-b');
      const staA = this._el('fight-sta-a');
      const staB = this._el('fight-sta-b');
      const posA = this._el('fight-pos-a');
      const posB = this._el('fight-pos-b');
      const status = this._el('fight-status');

      if (hpA) hpA.style.width = `${(a.health / a.maxHealth) * 100}%`;
      if (hpB) hpB.style.width = `${(b.health / b.maxHealth) * 100}%`;
      if (staA) staA.style.width = `${(a.stamina / a.maxStamina) * 100}%`;
      if (staB) staB.style.width = `${(b.stamina / b.maxStamina) * 100}%`;
      if (posA) posA.style.width = `${a.maxPosture ? (a.posture / a.maxPosture) * 100 : 100}%`;
      if (posB) posB.style.width = `${b.maxPosture ? (b.posture / b.maxPosture) * 100 : 100}%`;

      const nameA = this._el('fight-name-a');
      const nameB = this._el('fight-name-b');
      if (nameA) nameA.textContent = `${(defA?.shortName || a.definitionId).replace(/_/g, ' ').toUpperCase()} · ${Math.round(a.health)}HP`;
      if (nameB) nameB.textContent = `${(defB?.shortName || b.definitionId).replace(/_/g, ' ').toUpperCase()} · ${Math.round(b.health)}HP`;

      if (status) {
        if (matchStatus === 'ko') {
          status.textContent = `KO — ${winnerId?.replace(/_/g, ' ').toUpperCase()} WINS`;
          status.classList.add('fight-ko');
        } else if (matchStatus === 'time') {
          status.textContent = `TIME — ${winnerId?.replace(/_/g, ' ').toUpperCase()} WINS`;
          status.classList.add('fight-ko');
        } else if (matchStatus === 'draw') {
          status.textContent = 'TIME — DRAW';
          status.classList.add('fight-ko');
        } else {
          status.textContent = `REPLAY · TICK ${tick} / ${totalTicks}`;
          status.classList.remove('fight-ko');
        }
      }

      const result = this._el('fight-result');
      const resultText = this._el('fight-result-text');
      if (result) {
        if (state.matchResult) {
          const winner = state.matchResult.winnerId?.replace(/_/g, ' ').toUpperCase();
          const reason = state.matchResult.reason === 'ko' ? 'KNOCKOUT' : state.matchResult.reason === 'time' ? 'DECISION' : 'DRAW';
          if (resultText) resultText.textContent = winner ? `REPLAY END · ${reason} · ${winner}` : `REPLAY END · ${reason}`;
          result.hidden = false;
        } else {
          result.hidden = true;
        }
      }
    }

    const timeline = this._el('replay-timeline');
    if (timeline) {
      timeline.max = String(totalTicks);
      timeline.value = String(tick);
    }
    const timecode = this._el('replay-timecode');
    if (timecode) {
      const curSec = (tick / 60).toFixed(1);
      const totalSec = (totalTicks / 60).toFixed(1);
      timecode.textContent = `${curSec}s / ${totalSec}s`;
    }
    const playBtn = this._el('replay-play-btn');
    if (playBtn) {
      playBtn.innerHTML = icon(isPlaying ? 'pause' : 'play');
      playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    }
  }

  // ── Match history modal ─────────────────────────────────────────
  openHistoryModal(results = [], replays = []) {
    const dialog = this._el('history-dialog');
    if (!dialog) return;
    const list = this._el('history-list');
    list.replaceChildren();

    if (!results || results.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'NO RECORDED MATCHES YET. ENTER FIGHT MODE TO RECORD BOUTS.';
      list.appendChild(empty);
    } else {
      results.forEach(match => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const date = new Date(match.savedAt || Date.now());
        const timeStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const defA = (match.definitionA || 'forge-titan').replace(/_/g, ' ').toUpperCase();
        const defB = (match.definitionB || 'aegis-prime').replace(/_/g, ' ').toUpperCase();
        const winner = match.winnerId ? match.winnerId.replace(/_/g, ' ').toUpperCase() : 'DRAW';
        const reason = match.reason === 'ko' ? 'KNOCKOUT' : match.reason === 'time' ? 'DECISION' : 'DRAW';
        const hpText = match.finalHealth && Number.isFinite(match.finalHealth.fighter_a) && Number.isFinite(match.finalHealth.fighter_b)
          ? `HP: ${Math.round(match.finalHealth.fighter_a)} vs ${Math.round(match.finalHealth.fighter_b)}`
          : '';
        const durText = match.tick ? `${Math.round(match.tick / 60)}s` : '';

        // Only an explicit matchId may associate a saved replay with a result.
        const savedReplayEntry = replays.find(r => r.matchId && r.matchId === match.id) || null;

        const main = document.createElement('div');
        main.className = 'history-item-main';
        const head = document.createElement('div');
        head.className = 'history-item-head';
        const time = document.createElement('span');
        time.className = 'history-time';
        time.textContent = timeStr;
        const outcome = document.createElement('span');
        outcome.className = `history-outcome outcome-${['ko', 'time', 'draw'].includes(match.reason) ? match.reason : 'ko'}`;
        outcome.textContent = `${reason} · ${winner}`;
        head.append(time, outcome);
        const matchup = document.createElement('div');
        matchup.className = 'history-matchup';
        matchup.textContent = `${defA} vs ${defB}`;
        const meta = document.createElement('div');
        meta.className = 'history-meta';
        meta.textContent = `${durText}${hpText ? ` · ${hpText}` : ''}`;
        main.append(head, matchup, meta);
        item.appendChild(main);

        if (savedReplayEntry) {
          const actions = document.createElement('div');
          actions.className = 'history-item-actions';
          const playButton = document.createElement('button');
          playButton.className = 'history-play-btn';
          playButton.type = 'button';
          playButton.textContent = '▶ WATCH';
          const exportButton = document.createElement('button');
          exportButton.className = 'history-export-btn';
          exportButton.type = 'button';
          exportButton.textContent = 'EXPORT';
          actions.append(playButton, exportButton);
          item.appendChild(actions);
          playButton.addEventListener('click', () => {
            dialog.close();
            this.options.onStartReplay?.(savedReplayEntry.replay);
          });
          exportButton.addEventListener('click', () => {
            this.options.onExportSavedReplay?.(savedReplayEntry.replay);
          });
        }

        list.appendChild(item);
      });
    }

    dialog.showModal();
  }

  getTimeoutDraft() {
    const schemaVersion = Number(this._el('tactic-schema')?.value || 1);
    const rawSequence = this._el('tactic-sequence')?.value.split(',').map(value => value.trim()).filter(Boolean) || [];
    const sequence = schemaVersion === 2 ? rawSequence.map(token => {
      const [type, value] = token.split(':').map(part => part.trim());
      if (type === 'counter') return { type: 'counter', response: value || 'strike', targetZone: 'any' };
      if (type === 'move') return { type: 'move', direction: value || 'hold' };
      if (type === 'wait_for') return { type: 'wait_for', signal: value || 'enemy_attack' };
      if (type === 'set_priority') return { type: 'set_priority', channel: value || 'aggression', value: 0.25 };
      return { type: 'action', actionId: value || type };
    }) : rawSequence;
    return {
      id: this._el('tactic-select')?.value || undefined,
      schemaVersion,
      name: this._el('tactic-name')?.value.trim() || '',
      goal: this._el('tactic-goal')?.value.trim() || '',
      priority: Number(this._el('tactic-priority')?.value || .7),
      triggerAction: this._el('tactic-trigger-action')?.value || 'hook_right',
      sequence,
      repeatLimit: Number(this._el('tactic-repeat')?.value || 1),
      timeoutTicks: Number(this._el('tactic-timeout')?.value || 180),
      abortNearEdge: Boolean(this._el('tactic-abort-edge')?.checked),
    };
  }

  openTimeoutEditor(tactics = [], selectedId = null) {
    const editor = this._el('timeout-editor');
    if (!editor) return;
    editor.hidden = false;
    const list = Array.isArray(tactics) ? tactics : tactics ? [tactics] : [];
    const selected = list.find(tactic => tactic.id === selectedId) || list[0] || null;
    const selector = this._el('tactic-select');
    selector.replaceChildren();
    list.forEach(tactic => {
      const option = document.createElement('option'); option.value = tactic.id; option.textContent = tactic.name || tactic.id; selector.appendChild(option);
    });
    if (selected) selector.value = selected.id;
    const schemaVersion = selected?.schemaVersion || 1;
    this._el('tactic-schema').value = String(schemaVersion);
    const value = selected?.phases?.[0]?.sequence?.map(step => step.actionId || `${step.intent?.type}:${step.intent?.direction || step.intent?.response || step.intent?.signal || step.intent?.actionId || ''}`).join(', ') || (schemaVersion === 2 ? 'counter:strike, move:out' : 'slip_left, body_cross');
    this._el('tactic-name').value = selected?.name || 'Right Hook Punish';
    this._el('tactic-goal').value = selected?.goal || '';
    this._el('tactic-priority').value = String(selected?.priority ?? .7);
    this._el('tactic-trigger-action').value = selected?.trigger?.actionId || 'hook_right';
    this._el('tactic-sequence').value = value;
    this._el('tactic-repeat').value = String(selected?.repeatLimit || 1);
    this._el('tactic-timeout').value = String(selected?.timeoutTicks || 180);
    this._el('tactic-abort-edge').checked = Boolean(selected?.abort?.some(condition => condition.type === 'near_edge')) || !selected;
    this._el('timeout-review-state').textContent = 'DRAFT — NOT COMMITTED';
    this._el('timeout-diff').textContent = 'Edit the bounded playbook and preview the complete diff before commit.';
    this._el('tactic-prompt').value = '';
    this._el('timeout-commit').disabled = true;
  }

  closeTimeoutEditor() {
    const editor = this._el('timeout-editor');
    if (editor) editor.hidden = true;
  }

  showTimeoutReview({ ok, message, diff = '', canCommit = false }) {
    this._el('timeout-review-state').textContent = ok ? 'REVIEW READY' : 'INVALID DRAFT';
    this._el('timeout-diff').textContent = message || diff || 'No changes.';
    this._el('timeout-commit').disabled = !canCommit;
  }

  showTimeoutProposal(tactics, message, selectedId = null) {
    this.openTimeoutEditor(tactics, selectedId);
    this.showTimeoutReview({ ok: true, message: `PROPOSAL ONLY · ${message}`, canCommit: true });
  }

  setVoiceState({ state, message }) {
    const button = this._el('coach-mic');
    if (!button) return;
    button.textContent = state === 'listening' ? 'STOP MIC' : 'MIC OFF';
    button.setAttribute('aria-pressed', String(state === 'listening'));
    button.dataset.state = state;
    if (message) this.setCoachFeedback(message);
  }

  setCoachFeedback(message, tone = '') {
    const feedback = this._el('coach-feedback');
    if (!feedback) return;
    feedback.textContent = String(message).slice(0, 220);
    feedback.dataset.tone = tone;
  }

  updateFightHUD(state, matchSetup = null) {
    if (!state) return;
    const { a, b, matchStatus, winnerId } = state;
    const timeoutCount = this._el('timeout-count');
    if (timeoutCount && state.timeout) timeoutCount.textContent = state.timeout.remaining;

    const hpA = this._el('fight-hp-a');
    const hpB = this._el('fight-hp-b');
    const staA = this._el('fight-sta-a');
    const staB = this._el('fight-sta-b');
    const posA = this._el('fight-pos-a');
    const posB = this._el('fight-pos-b');
    const status = this._el('fight-status');

    if (hpA) hpA.style.width = `${(a.health / a.maxHealth) * 100}%`;
    if (hpB) hpB.style.width = `${(b.health / b.maxHealth) * 100}%`;
    if (staA) staA.style.width = `${(a.stamina / a.maxStamina) * 100}%`;
    if (staB) staB.style.width = `${(b.stamina / b.maxStamina) * 100}%`;
    if (posA) {
      const pctA = a.maxPosture ? (a.posture / a.maxPosture) * 100 : 100;
      posA.style.width = `${pctA}%`;
      posA.style.opacity = pctA < 40 ? '1' : '0.5';
    }
    if (posB) {
      const pctB = b.maxPosture ? (b.posture / b.maxPosture) * 100 : 100;
      posB.style.width = `${pctB}%`;
      posB.style.opacity = pctB < 40 ? '1' : '0.5';
    }

    const nameA = this._el('fight-name-a');
    const nameB = this._el('fight-name-b');
    const defIdA = matchSetup?.playerDefId || a.definitionId.replace(/_/g, '-');
    const defIdB = matchSetup?.opponentDefId || b.definitionId.replace(/_/g, '-');
    const defA = getRobotDefinition(defIdA);
    const defB = getRobotDefinition(defIdB);
    const shortA = defA?.shortName || defIdA.replace(/_/g, ' ').toUpperCase();
    const shortB = defB?.shortName || defIdB.replace(/_/g, ' ').toUpperCase();

    if (nameA) {
      nameA.innerHTML = `<span class="fight-badge badge-you">YOU</span> <strong class="fighter-label-name">${shortA}</strong> · ${a.health}HP`;
      const barA = nameA.closest('.fight-bar-a');
      if (barA && defA?.colors?.accent) {
        barA.style.setProperty('--bar-accent', `#${defA.colors.accent.toString(16).padStart(6, '0')}`);
      }
    }
    if (nameB) {
      nameB.innerHTML = `<span class="fight-badge badge-cpu">CPU</span> <strong class="fighter-label-name">${shortB}</strong> · ${b.health}HP`;
      const barB = nameB.closest('.fight-bar-b');
      if (barB && defB?.colors?.accent) {
        barB.style.setProperty('--bar-accent', `#${defB.colors.accent.toString(16).padStart(6, '0')}`);
      }
    }

    if (status) {
      if (matchStatus === 'ko') {
        status.textContent = `KO — ${winnerId?.replace(/_/g, ' ').toUpperCase()} WINS`;
        status.classList.add('fight-ko');
      } else if (matchStatus === 'time') {
        status.textContent = `TIME — ${winnerId?.replace(/_/g, ' ').toUpperCase()} WINS`;
        status.classList.add('fight-ko');
      } else if (matchStatus === 'draw') {
        status.textContent = 'TIME — DRAW';
        status.classList.add('fight-ko');
      } else {
        const seconds = state.roundSecondsRemaining ?? 0;
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const remainder = (seconds % 60).toString().padStart(2, '0');
        status.textContent = `${minutes}:${remainder} · TICK ${state.tick}`;
        status.classList.remove('fight-ko');
      }
    }

    const result = this._el('fight-result');
    const resultText = this._el('fight-result-text');
    const resultTitle = this._el('result-title');
    const resultSubtext = this._el('result-subtext');
    const resultBanner = this._el('result-banner');

    if (result) {
      if (state.matchResult) {
        const setup = matchSetup || {
          playerDefId: a.definitionId.replace(/_/g, '-'),
          opponentDefId: b.definitionId.replace(/_/g, '-'),
          playerRole: 'fighter_a',
          opponentRole: 'fighter_b',
        };
        const outcome = resolveMatchOutcome(state.matchResult, setup);

        if (resultTitle) resultTitle.textContent = `${outcome.title} // ${outcome.headline}`;
        if (resultSubtext) resultSubtext.textContent = outcome.subtext;
        if (resultBanner) {
          resultBanner.className = `result-banner banner-${outcome.outcome}`;
        }
        if (resultText) {
          const winner = state.matchResult.winnerId?.replace(/_/g, ' ').toUpperCase();
          const reason = state.matchResult.reason === 'ko' ? 'KNOCKOUT' : state.matchResult.reason === 'time' ? 'DECISION' : 'DRAW';
          resultText.textContent = winner ? `${reason} · ${winner}` : reason;
        }
        result.hidden = false;
      } else {
        result.hidden = true;
      }
    }

    // Capacity meter for fighter A (the coached robot).
    if (state.coaching) this._updateCapacityMeter(state.coaching);
  }

  /** @param {object} coaching - from FightMode.getCoachingSnapshot() */
  _updateCapacityMeter(coaching) {
    const meter = this._el('capacity-meter');
    if (!meter) return;
    const pb = coaching.playbooks?.[0];
    if (!pb) return;
    const brainSnap = coaching.brains?.[0];
    const baseAdh = brainSnap?.baseAdherence !== undefined
      ? `BASE ADH ${Math.round((brainSnap.baseAdherence ?? .8) * 100)}%`
      : '';
    const costText = pb.totalCost !== undefined && pb.capacity !== undefined
      ? `CAPACITY ${pb.totalCost}/${pb.capacity} COST (${pb.tacticCount} TACTIC${pb.tacticCount === 1 ? '' : 'S'}, ${pb.remainingCapacity} REMAINING)`
      : (pb.tacticCount > 0 ? `TACTICS ${pb.tacticCount}` : 'NO TACTICS');
    const activeText = pb.activeCount > 0 ? ` · ACTIVE ${pb.activeCount}` : '';
    const overText = pb.isOverCapacity ? ' · ⚠ OVER CAPACITY' : '';

    meter.textContent = `${costText}${activeText} · ${baseAdh}${overText}`.trim();
    meter.title = `Playbook rev ${pb.revision} · Cost: ${pb.totalCost ?? 0}/${pb.capacity ?? 5} · Tactics: ${pb.tacticCount} · ${baseAdh}`;
    if (pb.isOverCapacity) meter.style.color = '#d33';
    else meter.style.color = '';

    // Show adherence miss feedback if the brain just had one.
    const miss = brainSnap?.lastAdherenceMiss;
    const feedbackEl = this._el('adherence-feedback');
    if (feedbackEl) {
      if (miss) {
        const label = _adherenceLabel(miss.reason);
        feedbackEl.textContent = `⚠ [ADHERENCE MISS] ${label} · ROLL ${miss.roll.toFixed(2)} VS REQUIRED ${miss.adherence.toFixed(2)}`;
        feedbackEl.hidden = false;
        clearTimeout(this._adherenceTimer);
        this._adherenceTimer = setTimeout(() => { feedbackEl.hidden = true; }, 4000);
      }
    }
  }

  // ── Toast ───────────────────────────────────────────────────────
  showToast(text) {
    const t = this._el('toast');
    t.textContent = text;
    t.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('visible'), 1800);
  }
}

// ── module helpers ─────────────────────────────────────────────────────

const ADHERENCE_LABELS = {
  staggered:            'STAGGERED (REACTION UNSTABLE)',
  exhausted:            'STAMINA DEPLETED',
  low_stamina:          'LOW STAMINA FATIGUE',
  tactic_too_complex:   'TACTIC TOO COMPLEX FOR CHASSIS',
  overloaded:           'TACTICAL OVERLOAD (MULTIPLE ACTIVE)',
  near_edge_disruption: 'RING-EDGE POSITION PRESSURE',
  random_miss:          'EXECUTION IMPERFECTION',
};

function _adherenceLabel(reason) {
  return ADHERENCE_LABELS[reason] ?? reason.toUpperCase().replace(/_/g, ' ');
}

