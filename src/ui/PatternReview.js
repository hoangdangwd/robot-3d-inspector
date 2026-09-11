import { VoltPatternScenario, VOLT_REVIEW_CASES } from '../ai/VoltPatternScenario.js';

// QA-only, installed via ?qa&pattern=volt. No storage writes or coach API calls.
export function installPatternReview(app) {
  const panel = document.createElement('section');
  panel.id = 'pattern-review';
  panel.setAttribute('aria-label', 'Volt pattern review');
  Object.assign(panel.style, { position: 'fixed', top: '12px', right: '12px', zIndex: '100',
    maxWidth: 'min(440px, calc(100vw - 24px))', maxHeight: '85vh', overflow: 'auto',
    background: '#101820ee', color: '#edf5ff', padding: '16px', font: '13px monospace', border: '1px solid #52e7dd' });
  panel.innerHTML = `<strong>VOLT · JAB → CROSS · ANIMATOR REVIEW</strong>
    <p>Fixture, không phải trận đấu/coaching. A = Volt, B = Aegis.<br>Clip hiện chưa phase-sync; tick/phase/contact bên dưới là ground truth.</p>
    <label>Response <select id="pattern-case"></select></label>
    <p><button id="pattern-reset">Reset</button> <button id="pattern-play">Play</button>
    <button id="pattern-step">+1 tick</button> <button id="pattern-next">+6 ticks</button></p>
    <label>Speed <select id="pattern-speed"><option value="0.25">0.25×</option><option value="1">1×</option></select></label>
    <pre id="pattern-status" style="white-space:pre-wrap"></pre>
    <p>Orbit/zoom bằng chuột như thường. Kiểm tra trái/phải theo cơ thể robot, không theo màn hình.</p>
    <a href="/">Thoát review</a>`;
  document.body.append(panel);
  // Isolate review from normal navigation/coaching controls. Exit reloads the app.
  for (const selector of ['.top-nav', '#timeout-editor', '#history-panel']) {
    const element = document.querySelector(selector);
    if (element) element.style.display = 'none';
  }
  const select = panel.querySelector('#pattern-case');
  for (const value of VOLT_REVIEW_CASES) {
    const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option);
  }
  let fight, scenario, playing = false, speed = .25, renderedKey = '';
  const render = () => {
    const sim = fight.sim;
    const key = `${sim.currentTick}:${playing}`;
    if (key === renderedKey) return;
    renderedKey = key;
    const contacts = sim.log.toArray().filter(e => e.type === 'contact_resolved');
    panel.querySelector('#pattern-status').textContent = [
      `Tick ${sim.currentTick} / 120 · ${playing ? 'PLAYING' : 'PAUSED'}`,
      `A ${sim.fighterA.actionId} / ${sim.fighterA.actionPhase}`,
      `B ${sim.fighterB.actionId} / ${sim.fighterB.actionPhase}`,
      `HP B: ${sim.fighterB.health} · Distance: ${sim.getDistance().toFixed(2)}m`,
      ...scenario.history.map(e => `${e.tick}: ${e.type} — ${e.reason}`),
      ...contacts.map(e => `${e.tick}: ${e.data.actionId} → ${e.data.result}${e.data.defenseId ? ` (${e.data.defenseId})` : ''}`),
    ].join('\n');
    panel.querySelector('#pattern-play').textContent = playing ? 'Pause' : 'Play';
  };
  const reset = () => {
    if (app.mode === 'fight') app.exitFightMode();
    app.enterFightMode({ defIdA: 'volt-kestrel', defIdB: 'aegis-prime', review: true });
    fight = app.fightMode;
    fight.setPlaybook('fighter_a', [], 0); fight.setPlaybook('fighter_b', [], 0);
    scenario = new VoltPatternScenario(fight.sim, select.value);
    fight._runBrains = () => scenario.beforeTick();
    const update = fight.update.bind(fight);
    fight.update = delta => {
      if (playing && fight.sim.currentTick < 120) update(Math.min(delta * speed, (120 - fight.sim.currentTick) / 60));
      if (fight.sim.currentTick >= 120) playing = false;
      render();
    };
    // Store original update only for explicit frame stepping; normal raf cannot advance paused review.
    fight.reviewStep = count => {
      playing = false;
      for (let i = 0; i < count && fight.sim.currentTick < 120; i++) update(1 / 60);
      render();
    };
    playing = false;
    renderedKey = '';
    fight._syncPresentation(0);
    document.querySelector('#fight-hud').style.display = 'none';
    render();
  };
  panel.querySelector('#pattern-reset').onclick = reset;
  select.onchange = reset;
  panel.querySelector('#pattern-play').onclick = () => { playing = !playing; render(); };
  panel.querySelector('#pattern-step').onclick = () => fight.reviewStep(1);
  panel.querySelector('#pattern-next').onclick = () => fight.reviewStep(6);
  panel.querySelector('#pattern-speed').onchange = event => { speed = Number(event.target.value); };
  reset();
}
