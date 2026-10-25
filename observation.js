(function (global) {
  'use strict';

  let serial = 0;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const fixed = (value, places) => (Math.abs(value) < Math.pow(10, -places) / 2 ? 0 : value).toFixed(places);

  function mount(host, options) {
    if (!host || !host.ownerDocument) throw new TypeError('YoungObservation.mount requires a host element.');
    const doc = host.ownerDocument;
    const id = 'yo-' + (++serial);
    const root = doc.createElement('section');
    root.className = 'yo-observation';
    root.setAttribute('aria-label', '加减砝码与望远镜观察');
    root.innerHTML = `
      <div class="yo-mass-panel">
        <div class="yo-heading"><h3>砝码</h3><span class="yo-direction"></span></div>
        <p class="yo-mass-readout">总质量 <output class="yo-mass-value"></output><span class="yo-unit"> kg</span></p>
        <div class="yo-free-controls">
          <div class="yo-mass-buttons" role="group" aria-label="改变砝码总质量">
            <button type="button" data-yo-action="decrease">− 减 1 kg</button>
            <button type="button" data-yo-action="increase">＋ 加 1 kg</button>
          </div>
          <label class="yo-range-label" for="${id}-mass">选择总质量 <span class="yo-range-limits"></span></label>
          <input class="yo-mass-range" id="${id}-mass" type="range" step="1" aria-describedby="${id}-guide">
          <button type="button" class="yo-reset" data-yo-action="reset">恢复 2 kg 预载</button>
        </div>
        <div class="yo-sequence-controls" hidden>
          <button type="button" class="yo-advance" data-yo-action="advance"></button>
        </div>
        <p class="yo-guide" id="${id}-guide">2–9 kg 为 8 个读数点；10 kg 仅用于换向，不记录读数。</p>
        <p class="yo-state-note" role="status" aria-live="polite" aria-atomic="true"></p>
      </div>
      <div class="yo-scope-panel">
        <div class="yo-heading"><h3>目镜视野</h3><span class="yo-scope-tag">固定叉丝 · 标尺像移动</span></div>
        <div class="yo-scope-content">
          <svg class="yo-scope" viewBox="0 0 220 220" role="img" aria-labelledby="${id}-scope-title ${id}-scope-desc">
            <title id="${id}-scope-title">望远镜中的标尺像与固定叉丝</title>
            <desc id="${id}-scope-desc"></desc>
            <defs>
              <clipPath id="${id}-clip"><circle cx="110" cy="110" r="94"/></clipPath>
              <radialGradient id="${id}-glass"><stop offset="0" stop-color="#f7fbf5"/><stop offset="1" stop-color="#d4e2d7"/></radialGradient>
            </defs>
            <circle cx="110" cy="110" r="106" fill="#234451"/>
            <circle cx="110" cy="110" r="100" fill="#0b2937"/>
            <g clip-path="url(#${id}-clip)">
              <circle cx="110" cy="110" r="94" fill="url(#${id}-glass)"/>
              <rect x="76" y="0" width="94" height="220" fill="#edf0d8"/>
              <path d="M76 0V220M170 0V220" stroke="#7f947d" stroke-width="1"/>
              <g class="yo-ruler" fill="#263f32" font-family="Arial, sans-serif" font-size="11" font-style="normal"></g>
              <path class="yo-crosshair" d="M16 110H204M110 16V204" fill="none" stroke="#142c36" stroke-width="1.1"/>
              <path d="M101 110H119M110 101V119" fill="none" stroke="#142c36" stroke-width="1.6"/>
            </g>
            <circle cx="110" cy="110" r="94" fill="none" stroke="#8aabae" stroke-width="1"/>
          </svg>
          <div class="yo-scope-data">
            <p class="yo-reading-label">标尺读数 <i>n</i></p>
            <p class="yo-reading-value"><output class="yo-reading-number"></output><span class="yo-reading-unit yo-unit"> mm</span></p>
            <p class="yo-baseline">基准读数 <i>n</i><sub>0</sub> = <span class="yo-baseline-number"></span><span class="yo-unit"> mm</span></p>
            <p class="yo-delta">读数变化 Δ<i>n</i> = <span class="yo-delta-number"></span><span class="yo-unit"> mm</span></p>
            <p class="yo-scope-help">以水平叉丝对应的刻度读数，估读到 0.1 mm。</p>
          </div>
        </div>
      </div>
      <p class="yo-simulation-note">理想线弹性教学模拟；形变与视野变化用于观察规律。模拟读数不写入实测数据。</p>`;
    host.appendChild(root);

    const find = selector => root.querySelector(selector);
    const el = {
      direction: find('.yo-direction'), mass: find('.yo-mass-value'), free: find('.yo-free-controls'),
      sequence: find('.yo-sequence-controls'), decrease: find('[data-yo-action="decrease"]'),
      increase: find('[data-yo-action="increase"]'), reset: find('[data-yo-action="reset"]'),
      advance: find('[data-yo-action="advance"]'), range: find('.yo-mass-range'),
      limits: find('.yo-range-limits'), guide: find('.yo-guide'), note: find('.yo-state-note'),
      ruler: find('.yo-ruler'), desc: find('desc'), reading: find('.yo-reading-number'),
      unit: find('.yo-reading-unit'), baseline: find('.yo-baseline-number'),
      delta: find('.yo-delta-number'), deltaRow: find('.yo-delta'), scopeData: find('.yo-scope-data')
    };
    const motion = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const raf = global.requestAnimationFrame ? global.requestAnimationFrame.bind(global) : cb => global.setTimeout(() => cb(Date.now()), 16);
    const caf = global.cancelAnimationFrame ? global.cancelAnimationFrame.bind(global) : global.clearTimeout.bind(global);
    let state = {}, visualReading, frame = null, destroyed = false, movingTo;
    let scaleLow = NaN, scaleHigh = NaN;

    function normalize(patch) {
      state = Object.assign({}, state, patch || {});
      const low = Math.round(finite(state.minMass, 2));
      state.minMass = low;
      state.maxMass = Math.max(low, Math.round(finite(state.maxMass, 10)));
      state.mass = clamp(Math.round(finite(state.mass, low)), low, state.maxMass);
      state.reading = finite(state.reading, 20);
      state.baselineReading = finite(state.baselineReading, 20);
      state.mode = state.mode === 'sequence' ? 'sequence' : 'free';
      state.direction = ['加载', '减载', '换向'].includes(state.direction) ? state.direction : '加载';
    }

    // Scale positions stay in millimetres; only this group moves. The crosshair never moves.
    function prepareScale(from, to) {
      const low = Math.floor((Math.min(from, to) - 15) / 5) * 5;
      const high = Math.ceil((Math.max(from, to) + 15) / 5) * 5;
      if (scaleLow === low && scaleHigh === high) return;
      scaleLow = low; scaleHigh = high;
      let content = '';
      for (let value = low; value <= high; value += 1) {
        const y = value * 8;
        const major = value % 5 === 0;
        content += '<path d="M77 ' + y + 'H' + (major ? 105 : 94) + '" fill="none" stroke="#526b50" stroke-width="' + (major ? 1.1 : .8) + '"/>';
        if (major) content += '<text x="121" y="' + (y + 3.5) + '">' + value + '</text>';
      }
      el.ruler.innerHTML = content;
    }

    function paintScale(value) {
      visualReading = value;
      el.ruler.setAttribute('transform', 'translate(0 ' + (110 - value * 8) + ')');
    }

    function moveScale(target, previousReading) {
      if (frame !== null) { caf(frame); frame = null; }
      const from = visualReading === undefined ? finite(previousReading, target) : visualReading;
      movingTo = target;
      prepareScale(from, target);
      if ((motion && motion.matches) || Math.abs(from - target) < 1e-8) { paintScale(target); return; }
      paintScale(from);
      let started;
      const tick = timestamp => {
        if (destroyed) return;
        if (started === undefined) started = timestamp;
        const progress = clamp((timestamp - started) / 360, 0, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        paintScale(from + (target - from) * ease);
        if (progress < 1) frame = raf(tick);
        else frame = null;
      };
      frame = raf(tick);
    }

    function sequenceAction() {
      if (state.finished) return { label: '本轮测量已完成', allowed: false };
      if (state.direction === '换向') return { label: '卸下 1 kg，开始减载', allowed: state.mass === 10 };
      if (state.direction === '加载') return { label: state.mass === 9 ? '记录读数，并加至 10 kg 换向' : '记录读数，并加 1 kg', allowed: state.mass >= 2 && state.mass <= 9 };
      return { label: state.mass === 2 ? '记录最后一组读数，完成测量' : '记录读数，并减 1 kg', allowed: state.mass >= 2 && state.mass <= 9 };
    }

    function update(patch) {
      if (destroyed) return;
      const first = visualReading === undefined;
      normalize(patch);
      const turning = state.mass === 10;
      const canChange = typeof state.onMassChange === 'function';
      root.classList.toggle('yo-observation--sequence', state.mode === 'sequence');
      root.classList.toggle('yo-observation--turning', turning);
      el.mass.textContent = fixed(state.mass, 2);
      el.direction.textContent = state.finished ? '已完成' : turning ? '换向点' : state.mode === 'sequence' ? state.direction : '自由观察';
      el.free.hidden = state.mode !== 'free';
      el.sequence.hidden = state.mode !== 'sequence';
      el.decrease.disabled = !canChange || state.mass <= state.minMass;
      el.increase.disabled = !canChange || state.mass >= state.maxMass;
      el.reset.disabled = !canChange || state.mass === state.minMass;
      el.reset.textContent = '恢复 ' + state.minMass + ' kg 预载';
      el.range.min = String(state.minMass); el.range.max = String(state.maxMass); el.range.value = String(state.mass);
      el.range.disabled = !canChange;
      el.range.setAttribute('aria-valuetext', '总质量 ' + fixed(state.mass, 2) + ' 千克' + (turning ? '，换向点，不记录读数' : ''));
      el.limits.textContent = state.minMass + '–' + state.maxMass + ' kg';
      const action = sequenceAction();
      el.advance.textContent = action.label;
      el.advance.disabled = !action.allowed || state.canAdvance === false || typeof state.onAdvance !== 'function';
      const note = state.finished ? '已完成 8 个质量点的加载和减载记录。' : turning ? '10 kg 为换向点，不记录；卸回 9 kg 后开始减载读数。' : state.mass === 2 ? '2 kg 为预载起点。改变砝码时，观察标尺像相对叉丝的移动。' : '每次改变 1 kg；水平叉丝保持不动，标尺像随载荷移动。';
      if (el.note.textContent !== note) el.note.textContent = note;
      el.reading.textContent = turning ? '换向点，不记录' : fixed(state.reading, 1);
      el.reading.classList.toggle('yo-reading-number--notice', turning);
      el.unit.hidden = turning;
      el.baseline.textContent = fixed(state.baselineReading, 1);
      el.delta.textContent = fixed(state.reading - state.baselineReading, 1);
      el.deltaRow.hidden = turning;
      el.scopeData.setAttribute('aria-label', turning ? '换向点，不记录读数' : '标尺读数 ' + fixed(state.reading, 1) + ' 毫米，基准读数 ' + fixed(state.baselineReading, 1) + ' 毫米');
      el.desc.textContent = turning ? '总质量 10 千克。标尺像已移动到换向位置，固定十字叉丝保持清晰；本点不记录读数。' : '固定的水平叉丝对应 ' + fixed(state.reading, 1) + ' 毫米。增加砝码时，标尺像向上移动，读数增大；减小砝码时相反。';
      if (first || movingTo !== state.reading) moveScale(state.reading, first ? state.previousReading : undefined);
    }

    function changeMass(value) {
      if (state.mode !== 'free' || typeof state.onMassChange !== 'function') return;
      const next = clamp(Math.round(value), state.minMass, state.maxMass);
      if (next !== state.mass) state.onMassChange(next);
    }

    function click(event) {
      const button = event.target.closest('[data-yo-action]');
      if (!button || !root.contains(button) || button.disabled || destroyed) return;
      const action = button.getAttribute('data-yo-action');
      if (action === 'increase') changeMass(state.mass + 1);
      else if (action === 'decrease') changeMass(state.mass - 1);
      else if (action === 'reset') changeMass(state.minMass);
      else if (action === 'advance' && state.mode === 'sequence' && !el.advance.disabled) state.onAdvance();
    }

    function input(event) {
      if (event.target === el.range && !el.range.disabled && !destroyed) changeMass(Number(el.range.value));
    }

    function motionChanged() {
      if (motion && motion.matches && frame !== null) { caf(frame); frame = null; paintScale(state.reading); }
    }

    root.addEventListener('click', click);
    root.addEventListener('input', input);
    if (motion && motion.addEventListener) motion.addEventListener('change', motionChanged);
    update(options);
    return {
      update,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (frame !== null) caf(frame);
        root.removeEventListener('click', click); root.removeEventListener('input', input);
        if (motion && motion.removeEventListener) motion.removeEventListener('change', motionChanged);
        root.remove();
      }
    };
  }

  global.YoungObservation = Object.freeze({ mount });
})(window);
