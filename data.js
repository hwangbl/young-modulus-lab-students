/* 杨氏模量数据工作台。全部计算在当前浏览器中完成；无外部依赖。 */
(function (global) {
  'use strict';
  var STORAGE_KEY = 'young-lab-data-v1';
  var sequence = 0;
  var keys = ['L', 'D', 'b', 'zero', 'step', 'g', 'uL', 'uD', 'ub', 'ud', 'un'];
  for (var k = 0; k < 9; k++) keys.push('d' + k);
  for (var j = 0; j < 8; j++) keys.push('up' + j, 'down' + j);
  var numericPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    var text = String(value).trim();
    return numericPattern.test(text) && Number.isFinite(Number(text)) ? Number(text) : NaN;
  }
  function mean(values) { return values.reduce(function (a, b) { return a + b; }, 0) / values.length; }
  function fixed(value, digits) { return Number.isFinite(value) ? value.toFixed(digits == null ? 3 : digits) : '—'; }
  // Decimal shifts avoid binary toFixed tie errors (for example 1.005 -> 1.00).
  // Only presentation is rounded; calculate() always keeps the unrounded values.
  function shiftDecimal(value, places) {
    var parts = String(value).split('e');
    return Number(parts[0] + 'e' + (Number(parts[1] || 0) + places));
  }
  function roundDecimal(value, places) {
    return shiftDecimal(Math.sign(value) * Math.round(shiftDecimal(Math.abs(value), places)), -places);
  }
  function sig(value, digits) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    var places = digits - 1 - Math.floor(Math.log10(Math.abs(value)));
    var rounded = roundDecimal(value, places);
    var finalPlaces = digits - 1 - Math.floor(Math.log10(Math.abs(rounded)));
    return finalPlaces >= 0 && finalPlaces < 12 ? rounded.toFixed(finalPlaces) : rounded.toExponential(digits - 1);
  }
  function blankState() {
    var fields = {};
    keys.forEach(function (key) { fields[key] = ''; });
    fields.step = '1000'; fields.g = '9.79';
    return { version: 1, fields: fields, selected: [true, true, true, true], demo: false };
  }
  function normalize(data) {
    var base = blankState();
    if (!data || !data.fields) return base;
    keys.forEach(function (key) {
      if (typeof data.fields[key] === 'string' || typeof data.fields[key] === 'number') base.fields[key] = String(data.fields[key]).slice(0, 100);
    });
    if (Array.isArray(data.selected) && data.selected.length === 4) base.selected = data.selected.map(Boolean);
    base.demo = !!data.demo;
    return base;
  }

  function calculate(input) {
    var state = normalize(input), f = state.fields, result = {
      errors: [], warnings: [], missing: [], invalidKeys: [], means: [], diameters: [], pairs: [], selected: [], ready: false,
      demo: state.demo, E: null, uncertainty: null, fit: null, masses: [], d: null, uA: null, dn: null, deltaF: null
    };
    function read(key, label, positive) {
      var value = number(f[key]);
      if (value === null) { result.missing.push(label); return null; }
      if (!Number.isFinite(value) || (positive && value <= 0)) {
        result.errors.push(label + (positive ? '须为大于 0 的数值。' : '须为有限数值。'));
        result.invalidKeys.push(key); return null;
      }
      return value;
    }
    var L = read('L', '金属丝原长 L', true), D = read('D', '镜尺距离 D', true), b = read('b', '光杠杆臂长 b', true);
    var zero = read('zero', '螺旋测微计零差', false), step = read('step', '每级砝码质量', true), g = read('g', '当地重力加速度', true);
    result.L = L; result.D = D; result.b = b; result.g = g; result.step = step;
    var diameterComplete = zero !== null;
    for (var i = 0; i < 9; i++) {
      var raw = read('d' + i, '第 ' + (i + 1) + ' 次直径读数', true);
      if (raw !== null && zero !== null) {
        var corrected = raw - zero;
        if (corrected <= 0) {
          result.errors.push('第 ' + (i + 1) + ' 次直径扣除零差后须大于 0。');
          result.invalidKeys.push('d' + i); diameterComplete = false;
        } else result.diameters.push(corrected);
      } else diameterComplete = false;
    }
    if (diameterComplete && result.diameters.length === 9) {
      result.d = mean(result.diameters);
      result.uA = Math.sqrt(result.diameters.reduce(function (sum, d) { return sum + Math.pow(d - result.d, 2); }, 0) / (9 * 8));
    }
    var readingsComplete = true;
    for (var r = 0; r < 8; r++) {
      var up = read('up' + r, '第 ' + (r + 1) + ' 行增载读数', false), down = read('down' + r, '第 ' + (r + 1) + ' 行减载读数', false);
      result.means.push(up !== null && down !== null ? (up + down) / 2 : null);
      if (up === null || down === null) readingsComplete = false;
      result.masses.push(step !== null ? 2 + r * step / 1000 : null);
    }
    for (var p = 0; p < 4; p++) {
      result.pairs.push(result.means[p + 4] !== null && result.means[p] !== null ? result.means[p + 4] - result.means[p] : null);
      if (state.selected[p]) result.selected.push(p);
    }
    if (result.selected.length === 0) result.errors.push('至少勾选一组逐差，才能计算杨氏模量。');
    var selectedPairs = result.selected.map(function (index) { return result.pairs[index]; });
    if (selectedPairs.length && selectedPairs.every(function (value) { return value !== null; })) {
      result.signedDn = mean(selectedPairs);
      result.dn = Math.abs(result.signedDn);
      if (result.dn === 0) result.errors.push('所选逐差均值为 0，无法计算杨氏模量。');
      if (selectedPairs.some(function (x) { return x === 0; }) || (Math.min.apply(null, selectedPairs) < 0 && Math.max.apply(null, selectedPairs) > 0)) {
        result.errors.push('所选逐差含 0 或方向不一致，请检查读数与增减载顺序。');
      }
      if (result.dn > 0 && selectedPairs.length > 1) {
        var range = Math.max.apply(null, selectedPairs) - Math.min.apply(null, selectedPairs);
        if (Math.abs(range / result.signedDn) > 0.1) result.warnings.push('所选逐差的极差超过均值的 10%，建议核对读数并检查是否存在摩擦、回程或非线性。此提醒不自动剔除数据。');
      }
    }
    if (readingsComplete && step !== null) {
      var x = result.masses, y = result.means, xm = mean(x), ym = mean(y);
      var sxx = x.reduce(function (sum, v) { return sum + Math.pow(v - xm, 2); }, 0);
      var sxy = x.reduce(function (sum, v, index) { return sum + (v - xm) * (y[index] - ym); }, 0);
      var slope = sxy / sxx, intercept = ym - slope * xm;
      var sst = y.reduce(function (sum, v) { return sum + Math.pow(v - ym, 2); }, 0);
      var sse = y.reduce(function (sum, v, index) { return sum + Math.pow(v - (intercept + slope * x[index]), 2); }, 0);
      result.fit = { slope: slope, intercept: intercept, r2: sst > 0 ? Math.max(0, Math.min(1, 1 - sse / sst)) : null };
      if (result.fit.r2 !== null && result.fit.r2 < 0.99) result.warnings.push('平均读数线性拟合 R² 小于 0.99，请结合逐差和实验现象判断；R² 阈值仅作学习提醒。');
    }
    if (step !== null && g !== null) result.deltaF = 4 * step / 1000 * g;
    if (!result.errors.length && L !== null && D !== null && b !== null && result.d !== null && result.dn > 0 && readingsComplete && result.deltaF !== null) {
      result.E = 8 * result.deltaF * L * D / (Math.PI * Math.pow(result.d * 0.001, 2) * b * 0.001 * result.dn * 0.001);
      if (Number.isFinite(result.E) && result.E > 0) result.ready = true;
      else { result.E = null; result.errors.push('输入的数量级导致计算超出范围，请检查单位及小数点。'); }
      if (result.fit && Math.abs(result.fit.slope) > 0) result.fit.E = 8 * g * L * D / (Math.PI * Math.pow(result.d * 0.001, 2) * b * 0.001 * Math.abs(result.fit.slope) * 0.001);
    }
    var uncertainties = ['uL', 'uD', 'ub', 'ud', 'un'].map(function (key) { return number(f[key]); });
    result.uncertaintyMissing = uncertainties.filter(function (v) { return v === null; }).length;
    result.uncertaintyErrors = [];
    uncertainties.forEach(function (v, index) {
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        result.uncertaintyErrors.push(['u(L)', 'u(D)', 'u(b)', 'u(d)', 'u(Δn)'][index] + ' 须为非负有限数值。');
        result.invalidKeys.push(['uL', 'uD', 'ub', 'ud', 'un'][index]);
      }
    });
    if (result.ready && !result.uncertaintyMissing && !result.uncertaintyErrors.length) {
      var components = [uncertainties[0] / (L * 1000), uncertainties[1] / (D * 1000), uncertainties[2] / b, 2 * uncertainties[3] / result.d, uncertainties[4] / result.dn];
      var variance = components.reduce(function (sum, v) { return sum + v * v; }, 0);
      var relative = Math.sqrt(variance);
      result.uncertainty = { relative: relative, u: result.E * relative, U: 2 * result.E * relative, components: components, shares: components.map(function (v) { return variance ? v * v / variance : 0; }) };
    }
    return result;
  }

  function demoData() {
    var state = blankState(), f = state.fields;
    f.L = '1.050'; f.D = '1.350'; f.b = '40.00'; f.zero = '0.004';
    var raw = [0.703, 0.704, 0.705, 0.704, 0.703, 0.705, 0.704, 0.705, 0.703];
    raw.forEach(function (v, i) { f['d' + i] = v.toFixed(3); });
    var slope = 8 * 9.79 * 1.05 * 1.35 / (Math.PI * Math.pow(0.0007, 2) * 0.04 * 200e9) * 1000;
    for (var i = 0; i < 8; i++) { f['up' + i] = (20 + i * slope - 0.12).toFixed(2); f['down' + i] = (20 + i * slope + 0.12).toFixed(2); }
    f.uL = (2 / Math.sqrt(3)).toFixed(4); f.uD = (5 / Math.sqrt(3)).toFixed(4); f.ub = (0.2 / Math.sqrt(3)).toFixed(5);
    var uA = Math.sqrt(raw.reduce(function (s, v) { return s + Math.pow(v - 0.704, 2); }, 0) / 72);
    f.ud = Math.sqrt(uA * uA + Math.pow(0.004 / Math.sqrt(3), 2)).toFixed(6); f.un = Math.sqrt(2 / 3).toFixed(5);
    state.demo = true; return state;
  }

  function roundedMeasurement(value, uncertainty) {
    var e = value / 1e9, u = uncertainty / 1e9;
    if (!(u > 0) || !Number.isFinite(u)) return sig(e, 3) + ' ± ' + sig(u, 1) + ' GPa';
    // Source course, slide 20: one significant figure for u, then align E.
    // A carry in u (9.5 -> 10) changes the alignment place. Round E directly
    // from its full-precision value, never from its three-figure display.
    var roundedU = roundDecimal(u, -Math.floor(Math.log10(u)));
    var places = -Math.floor(Math.log10(roundedU));
    if (places >= 0 && places < 12) return roundDecimal(e, places).toFixed(places) + ' ± ' + roundedU.toFixed(places) + ' GPa';
    var exponent = Math.max(Math.floor(Math.log10(Math.abs(e))), Math.floor(Math.log10(roundedU)));
    var mantissaPlaces = Math.max(0, Math.min(100, places + exponent));
    return '(' + roundDecimal(shiftDecimal(e, -exponent), mantissaPlaces).toFixed(mantissaPlaces) + ' ± ' + shiftDecimal(roundedU, -exponent).toFixed(mantissaPlaces) + ') × 10^' + exponent + ' GPa';
  }

  function graphMarkup(result, fields, uid) {
    if (!result.fit) return '<div class="yd-graph-placeholder">录入完整的 8 组增载与减载读数后，<br>这里将展示实测点与线性拟合。</div>';
    var W = 540, H = 290, left = 60, right = 22, top = 21, bottom = 48;
    var xs = result.masses, allY = [];
    for (var i = 0; i < 8; i++) allY.push(number(fields['up' + i]), number(fields['down' + i]));
    var xmin = xs[0], xmax = xs[7], ymin = Math.min.apply(null, allY), ymax = Math.max.apply(null, allY);
    var pad = Math.max((ymax - ymin) * 0.14, 0.5); ymin -= pad; ymax += pad;
    var px = function (x) { return left + (x - xmin) / (xmax - xmin) * (W - left - right); };
    var py = function (y) { return H - bottom - (y - ymin) / (ymax - ymin) * (H - top - bottom); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="' + uid + '-graph-title ' + uid + '-graph-desc"><title id="' + uid + '-graph-title">标尺读数与砝码总质量关系图</title><desc id="' + uid + '-graph-desc">8 组增载、减载读数。横轴砝码总质量，单位千克；纵轴标尺读数，单位毫米。绿色直线为平均读数的最小二乘拟合。斜率 ' + fixed(result.fit.slope, 4) + ' 毫米每千克，R 平方 ' + fixed(result.fit.r2, 5) + '。</desc>';
    for (var t = 0; t <= 4; t++) {
      var vy = ymin + (ymax - ymin) * t / 4, cy = py(vy);
      svg += '<line x1="' + left + '" y1="' + cy + '" x2="' + (W - right) + '" y2="' + cy + '" stroke="#e3e9df"/><text x="' + (left - 10) + '" y="' + (cy + 4) + '" text-anchor="end" fill="#748278" font-size="10">' + fixed(vy, 1) + '</text>';
    }
    xs.forEach(function (x, index) { svg += '<text x="' + px(x) + '" y="' + (H - bottom + 20) + '" text-anchor="middle" fill="#748278" font-size="10">' + fixed(x, result.step % 1000 === 0 ? 0 : 2) + '</text>'; });
    svg += '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (H - bottom) + '" stroke="#a5b6a8"/><line x1="' + left + '" y1="' + (H - bottom) + '" x2="' + (W - right) + '" y2="' + (H - bottom) + '" stroke="#a5b6a8"/>';
    svg += '<line x1="' + px(xmin) + '" y1="' + py(result.fit.intercept + result.fit.slope * xmin) + '" x2="' + px(xmax) + '" y2="' + py(result.fit.intercept + result.fit.slope * xmax) + '" stroke="#7da690" stroke-width="2"/>';
    for (var s = 0; s < 8; s++) {
      svg += '<circle cx="' + px(xs[s]) + '" cy="' + py(number(fields['up' + s])) + '" r="3.5" fill="#225c48"><title>增载：' + fixed(xs[s], 2) + ' kg，' + fixed(number(fields['up' + s]), 3) + ' mm</title></circle>';
      var dy = py(number(fields['down' + s])), dx = px(xs[s]);
      svg += '<path d="M ' + dx + ' ' + (dy - 4) + ' L ' + (dx + 4) + ' ' + dy + ' L ' + dx + ' ' + (dy + 4) + ' L ' + (dx - 4) + ' ' + dy + ' Z" fill="#c98744"><title>减载：' + fixed(xs[s], 2) + ' kg，' + fixed(number(fields['down' + s]), 3) + ' mm</title></path>';
    }
    svg += '<text x="' + ((left + W - right) / 2) + '" y="' + (H - 7) + '" text-anchor="middle" fill="#66776c" font-size="11">砝码总质量 M / kg</text><text transform="translate(16 ' + ((top + H - bottom) / 2) + ') rotate(-90)" text-anchor="middle" fill="#66776c" font-size="11">标尺读数 n / mm</text></svg>';
    return svg;
  }

  function mount(container) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container || !container.appendChild) throw new Error('YoungData.mount 需要有效的容器。');
    var uid = 'yd-' + (++sequence), state = blankState(), undo = null, saveTimer = null, lastResult;
    try { var saved = localStorage.getItem(STORAGE_KEY); if (saved) state = normalize(JSON.parse(saved)); } catch (ignore) {}
    var wrapper = document.createElement('section'); wrapper.className = 'yd'; wrapper.setAttribute('aria-label', '杨氏模量实验数据处理工作台');
    function input(key, label, placeholder) { return '<label class="yd-field" for="' + uid + '-' + key + '">' + label + '<input id="' + uid + '-' + key + '" name="' + key + '" data-field="' + key + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="' + (placeholder || '输入实测值') + '"></label>'; }
    var diameterMarkup = '';
    for (var d = 0; d < 9; d++) diameterMarkup += input('d' + d, ['上部', '中部', '下部'][Math.floor(d / 3)] + ' · 方向 ' + (d % 3 + 1), 'mm');
    var rows = '';
    for (var n = 0; n < 8; n++) rows += '<tr><td data-mass="' + n + '">' + (n + 2).toFixed(2) + '</td><td><input aria-label="第 ' + (n + 1) + ' 行增载标尺读数，单位毫米" id="' + uid + '-up' + n + '" data-field="up' + n + '" type="text" inputmode="decimal" autocomplete="off" placeholder="mm"></td><td><input aria-label="第 ' + (n + 1) + ' 行减载标尺读数，单位毫米" id="' + uid + '-down' + n + '" data-field="down' + n + '" type="text" inputmode="decimal" autocomplete="off" placeholder="mm"></td><td class="yd-mean" data-mean="' + n + '">—</td></tr>';
    var pairMarkup = '';
    for (var p = 0; p < 4; p++) pairMarkup += '<label class="yd-pair"><input type="checkbox" data-pair="' + p + '" aria-label="选用第 ' + (p + 1) + ' 组逐差"><span><span data-pair-label="' + p + '">第 ' + (p + 1) + ' 组逐差</span><output data-pair-value="' + p + '">— mm</output></span></label>';
    wrapper.innerHTML = '<div class="yd-intro"><div><div class="yd-kicker">数据工作台</div><h2>把读数变成实验结果</h2><p class="yd-muted">录入原始读数，逐步检查零差修正、逐差、线性关系与结果表达。</p></div><span class="yd-badge" data-out="mode">实测数据 · 待录入</span></div>' +
      '<div class="yd-toolbar"><button class="yd-button" type="button" data-action="demo">填入演示数据</button><button class="yd-button yd-quiet" type="button" data-action="csv">导出 CSV</button><button class="yd-button yd-quiet" type="button" data-action="print">打印报告</button><button class="yd-button yd-text" type="button" data-action="clear">清空记录</button><button class="yd-button yd-quiet" type="button" data-action="undo" hidden>恢复上一组</button><span class="yd-save" data-out="save">仅在本机浏览器保存</span></div>' +
      '<div class="yd-grid"><div class="yd-stack"><article class="yd-card"><div class="yd-kicker">01 / 直接测量</div><h3>几何量与金属丝直径</h3><div class="yd-fields">' + input('L', '原长 L <span class="yd-unit">/ m</span>') + input('D', '镜尺距离 D <span class="yd-unit">/ m</span>') + input('b', '光杠杆臂长 b <span class="yd-unit">/ mm</span>') + '</div><p class="yd-help">L 为上夹紧区下缘至平台夹紧区上缘的有效长度；b 为后足至前两足连线的垂距。</p><div class="yd-separator"></div>' + input('zero', '测微计零差 <span class="yd-unit">/ mm · 可正可负，无零差填 0</span>', '先记录零差，再录入直径') + '<h4>直径原始读数 d′ <span class="yd-unit">/ mm · 共 9 次</span></h4><div class="yd-diameters">' + diameterMarkup + '</div><div class="yd-inline-result"><span>零差修正后平均直径 d̄（3 位有效数字）</span><strong data-out="diameter">— mm</strong></div><p class="yd-help">每次 dᵢ = d′ᵢ − 零差；d̄ 为 9 次修正值的平均。<br><span data-out="diameterA">完整输入后显示直径均值的 A 类标准不确定度。</span></p></article>' +
      '<article class="yd-card"><div class="yd-kicker">02 / 增载与减载</div><h3>标尺读数记录</h3><p class="yd-note">资料采用 2.00 kg 预载、每级 1.00 kg，记录 2—9 kg。加至 10 kg 后回到 9 kg 再读减载值；10 kg 不计入记录。</p><div class="yd-table-wrap"><table class="yd-table"><thead><tr><th scope="col">总质量 / kg</th><th scope="col">增载 n′ / mm</th><th scope="col">减载 n″ / mm</th><th scope="col">均值 n / mm</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="yd-fields yd-step-fields">' + input('step', '每级砝码质量 m <span class="yd-unit">/ g</span>', '资料：1000') + input('g', '当地 g <span class="yd-unit">/ m·s⁻²</span>', '资料成都值：9.79') + '</div><p class="yd-help">n = (n′ + n″) / 2。若更改每级质量，表中总质量与四级跨距同步更新；起始预载仍为 2.00 kg。</p></article>' +
      '<article class="yd-card"><div class="yd-kicker">03 / 逐差检验</div><h3>相隔四级，比较伸长响应</h3><p class="yd-note">课件采用四组逐差的平均值；指导书也允许合理选择两组数据求力与读数的增量比。此处默认使用全部四组，可按教师要求选择取数组。</p><div class="yd-pairs">' + pairMarkup + '</div><div class="yd-report-lines"><div class="yd-report-line"><span>所选逐差绝对均值 Δn</span><strong data-out="dn">— mm</strong></div><div class="yd-report-line"><span>对应力增量 ΔF = 4mg</span><strong data-out="force">— N</strong></div><div class="yd-report-line"><span>ΔF/Δn（3 位有效数字）</span><strong data-out="forceRatio">— N/mm</strong></div></div><p class="yd-help">逐差保留符号以检查方向，计算时取所选逐差均值的绝对值。完整输入 8 组增减载读数后再输出 E；平台不自动删除异常值。</p></article></div>' +
      '<div class="yd-stack"><article class="yd-card yd-result"><div class="yd-kicker">杨氏模量 · 实验结果</div><h3>逐差法测得 E</h3><div class="yd-value" data-out="E">— <span>GPa</span></div><small data-out="resultHint">完成原始测量记录后自动计算</small><div class="yd-toast" data-out="demoNotice" hidden style="color:#ffe1af">当前为模拟教学数据，不能作为实测结果提交。</div></article>' +
      '<article class="yd-card"><h3>从读数到杨氏模量</h3><div class="yd-formula" aria-label="E 等于 8 乘力增量乘原长乘镜尺距离，除以 π 乘直径平方乘光杠杆臂长乘标尺位移">E = 8ΔF L D / (πd̄² b Δn)</div><p class="yd-note">内部统一换算为 m、kg、N，E 的计算单位为 Pa，显示时除以 10⁹ 转为 GPa。预载用于拉直金属丝，ΔF 取所选两读数之间的增量。</p><div class="yd-status" data-out="status" role="status" aria-live="polite"></div></article>' +
      '<article class="yd-card"><div class="yd-kicker">线性关系</div><h3>读数随质量如何变化</h3><div class="yd-graph" data-out="graph"></div><div class="yd-legend"><span><i></i>增载 · 圆点</span><span><i class="yd-amber"></i>减载 · 菱形</span><span><i class="yd-line"></i>均值拟合</span></div><div class="yd-fit-stats"><span>斜率 <strong data-out="slope">—</strong> mm/kg</span><span>R² <strong data-out="r2">—</strong></span></div><p class="yd-help" data-out="fitE">8 个均值点用于最小二乘拟合，作为逐差法的交叉检查。</p></article>' +
      '<article class="yd-card"><div class="yd-kicker">不确定度评定</div><h3>给结果一个可信的范围</h3><p class="yd-note">输入已经评定好的<strong>标准不确定度 u</strong>，各项单位均为 mm；不要直接填误差限或扩展不确定度。未填完整时只计算 E。</p><div class="yd-fields yd-uncertainties">' + input('uL', 'u(L) <span class="yd-unit">/ mm</span>', '标准不确定度') + input('uD', 'u(D) <span class="yd-unit">/ mm</span>', '标准不确定度') + input('ub', 'u(b) <span class="yd-unit">/ mm</span>', '标准不确定度') + input('ud', 'u(d̄) <span class="yd-unit">/ mm</span>', '含重复测量等分量') + input('un', 'u(Δn) <span class="yd-unit">/ mm</span>', '按最终取数方法评定') + '</div><p class="yd-help">按资料近似忽略砝码与 g 的不确定度；假设各输入量独立。零差修正的不确定度应计入 u(d̄)。</p><div class="yd-status" data-out="uncertaintyStatus" role="status" aria-live="polite">可稍后填写。</div><div class="yd-budget" data-out="budget" hidden></div><details><summary>查看评定依据与传播公式</summary><p>相互独立时：uᵣ(E)² = [u(L)/L]² + [u(D)/D]² + [u(b)/b]² + [2u(d̄)/d̄]² + [u(Δn)/Δn]²。u(E) = E·uᵣ(E)，U = 2u(E)（k = 2）。直径的相对标准不确定度在传播中乘 2。</p><p>资料本实验表给出估读误差限：D 为 5 mm、L 为 2 mm、b 为 0.2 mm；若视为均匀分布，对应分量为误差限 / √3。资料的单次读数差近似为 u(Δn) ≈ √(2/3) × 1 mm。四组逐差的端点互不重复，但仪器误差等分量可能相关；此处沿用指导书近似，不未经分析直接按组数开方缩小该项。</p><p>资料给出测微计仪器误差限 0.004 mm；u(d̄) 应结合 9 次测量的 A 类分量、仪器分量和零差修正分量。此处不自动替你评定、填充或剔除数据。</p></details></article>' +
      '<article class="yd-card"><h3>实验报告摘录</h3><div class="yd-report-lines"><div class="yd-report-line"><span>E（3 位有效数字）</span><strong data-out="reportE">待完成</strong></div><div class="yd-report-line"><span>合成标准不确定度 u(E)（1 位有效数字）</span><strong data-out="u">未评定</strong></div><div class="yd-report-line"><span>相对标准不确定度</span><strong data-out="relative">未评定</strong></div><div class="yd-report-line"><span>课程结果 E ± u(E)，k = 1</span><strong data-out="standard">未评定</strong></div><div class="yd-report-line"><span>补充：E ± U，k = 2</span><strong data-out="expanded">未评定</strong></div></div><p class="yd-help">有效数字按《用拉伸法测量金属丝的杨氏模量-new》第 19—20 页：ΔF/Δn、d̄ 和单独计算的 E 保留 3 位有效数字；各标准不确定度保留 1 位，最终 E ± u(E) 的末位对齐。内部计算保留完整精度，报告显示时再修约。源课件例：(1.55 ± 0.02) × 10¹¹ Pa，即 155 ± 2 GPa。补充结果采用相同修约方式；k = 2 为覆盖因子，不自动等同于确定的置信概率。</p></article></div></div>' +
      '<div class="yd-notice">原始记录请以实验现场观测为准。线性拟合只能辅助检查，不能替代弹性限度、摩擦、振动及调焦等实验条件的判断。</div><p class="yd-footer">数据仅保存在当前浏览器，建议完成记录后导出 CSV 留存。演示数据通过 E ≈ 200 GPa 的数学模型生成，所有演示参数均为教学假设。</p><div class="yd-toast" data-out="toast" role="status" aria-live="polite"></div>';
    container.appendChild(wrapper);
    var outputs = {};
    wrapper.querySelectorAll('[data-out]').forEach(function (node) { outputs[node.dataset.out] = node; });
    var inputs = {};
    wrapper.querySelectorAll('[data-field]').forEach(function (node) { inputs[node.dataset.field] = node; });
    function applyState() {
      keys.forEach(function (key) { inputs[key].value = state.fields[key]; });
      wrapper.querySelectorAll('[data-pair]').forEach(function (node) { node.checked = state.selected[Number(node.dataset.pair)]; });
      render();
    }
    function save() {
      clearTimeout(saveTimer);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); outputs.save.textContent = '已自动保存在本机浏览器'; }
      catch (error) { outputs.save.textContent = '浏览器未允许本地保存，请导出 CSV'; }
    }
    function text(name, value) { outputs[name].textContent = value; }
    function render() {
      var result = calculate(state); lastResult = result;
      keys.forEach(function (key) { inputs[key].setAttribute('aria-invalid', result.invalidKeys.indexOf(key) >= 0 ? 'true' : 'false'); });
      text('mode', state.demo ? '演示数据 · 教学示例' : (result.ready ? '实测数据 · 已计算' : '实测数据 · 待补全'));
      outputs.mode.dataset.demo = String(state.demo); outputs.demoNotice.hidden = !state.demo;
      text('diameter', result.d !== null ? sig(result.d, 3) + ' mm' : '— mm');
      text('diameterA', result.uA !== null ? '直径均值的 A 类标准不确定度 uA(d̄) = ' + sig(result.uA, 1) + ' mm（1 位有效数字）；此值不包含仪器和零差修正分量。' : '完整输入后显示直径均值的 A 类标准不确定度。');
      wrapper.querySelectorAll('[data-mass]').forEach(function (node) { var index = Number(node.dataset.mass); node.textContent = result.masses[index] !== null ? fixed(result.masses[index], 2) : '—'; });
      wrapper.querySelectorAll('[data-mean]').forEach(function (node) { var value = result.means[Number(node.dataset.mean)]; node.textContent = value !== null ? fixed(value, 3) : '—'; });
      wrapper.querySelectorAll('[data-pair-label]').forEach(function (node) { var i = Number(node.dataset.pairLabel); node.textContent = result.masses[i] !== null ? 'n(' + fixed(result.masses[i + 4], 2) + ' kg) − n(' + fixed(result.masses[i], 2) + ' kg)' : '第 ' + (i + 1) + ' 组逐差'; });
      wrapper.querySelectorAll('[data-pair-value]').forEach(function (node) { var v = result.pairs[Number(node.dataset.pairValue)]; node.textContent = (v !== null ? fixed(v, 3) : '—') + ' mm'; });
      text('dn', result.dn !== null ? fixed(result.dn, 4) + ' mm（' + result.selected.length + ' 组）' : '— mm');
      text('force', result.deltaF !== null ? fixed(result.deltaF, 4) + ' N' : '— N');
      text('forceRatio', result.deltaF !== null && result.dn > 0 ? sig(result.deltaF / result.dn, 3) + ' N/mm' : '— N/mm');
      outputs.E.innerHTML = (result.ready ? sig(result.E / 1e9, 3) : '—') + ' <span>GPa</span>';
      text('resultHint', result.ready ? (state.demo ? '模型生成的教学示例 · 不代表实测材料' : '根据完整原始读数与所选逐差计算') : '完成几何量、9 次直径与 8 组增减载读数后自动计算');
      outputs.status.replaceChildren();
      var notes = result.errors.slice();
      if (result.missing.length) notes.push('尚有 ' + result.missing.length + ' 项必填读数未完成：' + result.missing.slice(0, 3).join('、') + (result.missing.length > 3 ? '等。' : '。'));
      if (result.ready) notes.push('已使用 ' + result.selected.length + ' 组逐差；四级质量差为 ' + fixed(4 * result.step / 1000, 3) + ' kg。');
      notes = notes.concat(result.warnings);
      outputs.status.dataset.state = result.errors.length ? 'error' : (result.ready ? 'ready' : 'waiting');
      notes.forEach(function (message) { var line = document.createElement('div'); line.textContent = message; outputs.status.appendChild(line); });
      outputs.graph.innerHTML = graphMarkup(result, state.fields, uid);
      text('slope', result.fit ? fixed(result.fit.slope, 4) : '—'); text('r2', result.fit && result.fit.r2 !== null ? fixed(result.fit.r2, 5) : '—');
      text('fitE', result.fit && Number.isFinite(result.fit.E) ? '平均读数最小二乘拟合对应 E = ' + sig(result.fit.E / 1e9, 3) + ' GPa，供与逐差法交叉检查。' : '8 个均值点用于最小二乘拟合，作为逐差法的交叉检查。');
      text('reportE', result.ready ? sig(result.E / 1e9, 3) + ' GPa' + (state.demo ? '（演示）' : '') : '待完成');
      if (result.uncertainty) {
        var u = result.uncertainty;
        text('u', sig(u.u / 1e9, 1) + ' GPa'); text('relative', sig(u.relative * 100, 1) + '%');
        text('standard', roundedMeasurement(result.E, u.u) + (state.demo ? '（演示）' : ''));
        text('expanded', roundedMeasurement(result.E, u.U) + (state.demo ? '（演示）' : ''));
        text('uncertaintyStatus', '已按 5 个独立标准不确定度分量合成。下图显示各项对总方差的贡献。' + (u.u === 0 ? '当前各项均为 0，请确认这符合你的评定。' : ''));
        outputs.uncertaintyStatus.dataset.state = 'ready'; outputs.budget.hidden = false; outputs.budget.innerHTML = '';
        u.shares.forEach(function (share, index) {
          var row = document.createElement('div'); row.className = 'yd-budget-row';
          row.innerHTML = '<span>' + ['L', 'D', 'b', 'd̄', 'Δn'][index] + '</span><span class="yd-budget-track"><i style="width:' + (share * 100).toFixed(2) + '%"></i></span><span>' + fixed(share * 100, 1) + '%</span>';
          outputs.budget.appendChild(row);
        });
      } else {
        text('u', '未评定'); text('relative', '未评定'); text('standard', '未评定'); text('expanded', '未评定'); outputs.budget.hidden = true;
        text('uncertaintyStatus', result.uncertaintyErrors.length ? result.uncertaintyErrors.join(' ') : (result.uncertaintyMissing ? '还需填写 ' + result.uncertaintyMissing + ' 个标准不确定度分量，才会输出合成与扩展不确定度。' : '请先完成原始测量与逐差检查，再合成不确定度。'));
        outputs.uncertaintyStatus.dataset.state = result.uncertaintyErrors.length ? 'error' : 'waiting';
      }
    }
    function collect(event) {
      var target = event.target;
      if (target.dataset.field) state.fields[target.dataset.field] = target.value;
      else if (target.dataset.pair != null) state.selected[Number(target.dataset.pair)] = target.checked;
      else return;
      render(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
    }
    function csvCell(value) {
      var s = value == null ? '' : String(value);
      if (s && !Number.isFinite(number(s)) && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    function exportCSV() {
      var r = lastResult, rows = [['杨氏模量实验数据报告'], ['数据性质', state.demo ? '模拟教学数据，不作为实测结果' : '用户录入实测数据'], ['导出时间', new Date().toLocaleString('zh-CN')], ['说明', '原始值保留录入内容；计算保留完整精度。报告按《用拉伸法测量金属丝的杨氏模量-new》第19—20页修约：ΔF/Δn、d̄、E为3位有效数字；标准不确定度为1位；E±u末位对齐。标注未修约的行仅供复核。'], [], ['物理量', '数值', '单位']];
      [['L', '金属丝原长 L', 'm'], ['D', '镜尺距离 D', 'm'], ['b', '光杠杆臂长 b', 'mm'], ['zero', '测微计零差', 'mm'], ['step', '每级砝码质量', 'g'], ['g', '当地重力加速度', 'm/s²']].forEach(function (item) { rows.push([item[1], state.fields[item[0]], item[2]]); });
      rows.push([], ['直径次数', '部位', '原始读数 / mm', '修正后直径 / mm']);
      for (var i = 0; i < 9; i++) {
        var raw = number(state.fields['d' + i]), z = number(state.fields.zero);
        rows.push([i + 1, ['上部', '中部', '下部'][Math.floor(i / 3)], state.fields['d' + i], raw !== null && z !== null && Number.isFinite(raw) && Number.isFinite(z) ? raw - z : '']);
      }
      rows.push(['修正后平均直径（未修约，供复核）', r.d, 'mm'], ['修正后平均直径（3位有效数字）', r.d !== null ? sig(r.d, 3) : '', 'mm'], ['uA(d̄)（1位有效数字）', r.uA !== null ? sig(r.uA, 1) : '', 'mm'], [], ['砝码总质量 / kg', '增载 n′ / mm', '减载 n″ / mm', '平均 n / mm']);
      for (var n = 0; n < 8; n++) rows.push([r.masses[n], state.fields['up' + n], state.fields['down' + n], r.means[n]]);
      rows.push([], ['逐差组', '质量起点 / kg', '质量终点 / kg', '有符号逐差 / mm', '是否选用']);
      for (var p = 0; p < 4; p++) rows.push([p + 1, r.masses[p], r.masses[p + 4], r.pairs[p], state.selected[p] ? '是' : '否']);
      rows.push(['所选逐差绝对均值 Δn', r.dn, 'mm'], ['对应力增量 ΔF', r.deltaF, 'N'], ['ΔF/Δn（3位有效数字）', r.deltaF !== null && r.dn > 0 ? sig(r.deltaF / r.dn, 3) : '', 'N/mm'], [], ['E（未修约，供复核）', r.ready ? r.E : '', 'Pa'], ['E（3位有效数字）', r.ready ? sig(r.E / 1e9, 3) : '', 'GPa'], ['拟合斜率', r.fit ? r.fit.slope : '', 'mm/kg'], ['拟合截距', r.fit ? r.fit.intercept : '', 'mm'], ['R²', r.fit ? r.fit.r2 : '', ''], []);
      ['uL', 'uD', 'ub', 'ud', 'un'].forEach(function (key, index) { rows.push([['u(L)', 'u(D)', 'u(b)', 'u(d̄)', 'u(Δn)'][index], state.fields[key], 'mm']); });
      rows.push(['u(E)（1位有效数字）', r.uncertainty ? sig(r.uncertainty.u / 1e9, 1) : '', 'GPa'], ['u(E)（未修约，供复核）', r.uncertainty ? r.uncertainty.u : '', 'Pa'], ['相对标准不确定度（1位有效数字）', r.uncertainty ? sig(r.uncertainty.relative * 100, 1) : '', '%'], ['相对标准不确定度（未修约，供复核）', r.uncertainty ? r.uncertainty.relative : '', '1'], ['U（k=2，1位有效数字）', r.uncertainty ? sig(r.uncertainty.U / 1e9, 1) : '', 'GPa'], ['U（k=2，未修约，供复核）', r.uncertainty ? r.uncertainty.U : '', 'Pa'], ['课程结果 E ± u（k=1）', r.uncertainty ? roundedMeasurement(r.E, r.uncertainty.u) : '未评定'], ['E ± U（k=2）', r.uncertainty ? roundedMeasurement(r.E, r.uncertainty.U) : '未评定'], ['计算状态', r.ready ? '完整' : '未完成'], ['检查提醒', r.errors.concat(r.warnings).join('；')]);
      var blob = new Blob(['\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url;
      a.download = '杨氏模量_' + (state.demo ? '演示数据' : '实验记录') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      text('toast', '已导出包含原始记录、逐差、拟合与结果的 CSV。');
    }
    function printCleanup() { document.body.classList.remove('yd-print-active'); }
    function click(event) {
      var button = event.target.closest('[data-action]'); if (!button || !wrapper.contains(button)) return;
      switch (button.dataset.action) {
        case 'demo': undo = normalize(state); state = demoData(); applyState(); save(); text('toast', '已载入演示数据。数值由教学模型生成，修改后仍保留演示标记；开始实测前请清空。'); break;
        case 'clear': undo = normalize(state); state = blankState(); applyState(); save(); text('toast', '已清空输入；可使用“恢复上一组”撤销。'); break;
        case 'undo': if (undo) { var previous = normalize(state); state = normalize(undo); undo = previous; applyState(); save(); text('toast', '已恢复上一组记录。'); } break;
        case 'csv': exportCSV(); break;
        case 'print': document.body.classList.add('yd-print-active'); global.print(); setTimeout(printCleanup, 1000); break;
      }
      wrapper.querySelector('[data-action="undo"]').hidden = !undo;
    }
    wrapper.addEventListener('input', collect); wrapper.addEventListener('change', collect); wrapper.addEventListener('click', click);
    global.addEventListener('afterprint', printCleanup); applyState();
    return {
      getData: function () { return normalize(state); },
      getResult: function () { return calculate(state); },
      setData: function (data) { undo = normalize(state); state = normalize(data); applyState(); save(); wrapper.querySelector('[data-action="undo"]').hidden = false; },
      reset: function () { undo = normalize(state); state = blankState(); applyState(); save(); wrapper.querySelector('[data-action="undo"]').hidden = false; },
      destroy: function () { clearTimeout(saveTimer); global.removeEventListener('afterprint', printCleanup); wrapper.remove(); }
    };
  }
  global.YoungData = { mount: mount, calculate: calculate, demoData: demoData, storageKey: STORAGE_KEY };
})(window);
