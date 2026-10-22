/* 杨氏模量数据工作台。全部计算在当前浏览器中完成；无外部依赖。 */
(function (global) {
  'use strict';
  var STORAGE_KEY = 'young-lab-data-v1';
  var sequence = 0;
  var errorQuantities = ['L', 'D', 'b', 'd', 'n'];
  var errorKeys = [];
  errorQuantities.forEach(function (q) { errorKeys.push('i' + q, 'e' + q); });
  var keys = ['L', 'D', 'b', 'zero', 'step', 'g'].concat(errorKeys);
  var MAX_CSV_BYTES = 128 * 1024;
  for (var k = 0; k < 9; k++) keys.push('d' + k);
  for (var j = 0; j < 8; j++) keys.push('up' + j, 'down' + j);
  var scaleKeys = []; for (var sk = 0; sk < 8; sk++) scaleKeys.push('up' + sk, 'down' + sk);
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
    var shifted = shiftDecimal(Math.abs(value), places);
    // Arithmetic such as a four-pair mean can land one binary ulp below .5.
    // Snap only that representational tie; calculated values remain untouched.
    var half = Math.floor(shifted) + 0.5;
    if (Math.abs(shifted - half) <= Number.EPSILON * Math.max(1, shifted) * 2) shifted = half;
    return shiftDecimal(Math.sign(value) * Math.round(shifted), -places);
  }
  function sig(value, digits) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    var places = digits - 1 - Math.floor(Math.log10(Math.abs(value)));
    var rounded = roundDecimal(value, places);
    var finalPlaces = digits - 1 - Math.floor(Math.log10(Math.abs(rounded)));
    return finalPlaces >= 0 && finalPlaces < 12 ? rounded.toFixed(finalPlaces) : rounded.toExponential(digits - 1);
  }
  var fixedErrorSuggestions = { eL: 2, eD: 5, ib: 0.02, eb: 0.2, id: 0.004, ed: 0.002, in: 0.15, en: 1 };
  function errorSuggestion(key, fields) {
    if (key === 'iL' || key === 'iD') {
      var length = number(fields[key.slice(1)]);
      if (!(length > 0) || !Number.isFinite(length)) return '';
      // Tape specification: (0.2 × x(mm)/1000 + 0.3) mm; L and D are entered in m.
      var value = 0.2 * length + 0.3;
      return Number.isFinite(value) ? String(value) : '';
    }
    return String(fixedErrorSuggestions[key]);
  }
  function applyErrorSuggestions(state) {
    errorKeys.forEach(function (key) { if (!state.errorOverrides[key]) state.fields[key] = errorSuggestion(key, state.fields); });
    return state;
  }
  function blankState() {
    var fields = {}, overrides = {};
    keys.forEach(function (key) { fields[key] = ''; });
    errorKeys.forEach(function (key) { overrides[key] = false; });
    fields.step = '1000'; fields.g = '9.79';
    return applyErrorSuggestions({ version: 3, fields: fields, selected: [true, true, true, true], demo: false, migrated: false, method: 'successive', digits: 2, errorOverrides: overrides });
  }
  function normalize(data) {
    var base = blankState();
    if (!data || !data.fields) return base;
    keys.forEach(function (key) {
      if (typeof data.fields[key] === 'string' || typeof data.fields[key] === 'number') base.fields[key] = String(data.fields[key]).slice(0, 100);
    });
    errorKeys.forEach(function (key) {
      var explicit = data.version === 3 && data.errorOverrides && typeof data.errorOverrides[key] === 'boolean' ? data.errorOverrides[key] : null;
      // Older records have no provenance: preserve every explicit value as a manual choice.
      base.errorOverrides[key] = typeof explicit === 'boolean' ? explicit : data.fields[key] != null && String(data.fields[key]).trim() !== '';
    });
    if (Array.isArray(data.selected) && data.selected.length === 4) base.selected = data.selected.map(Boolean);
    base.demo = !!data.demo;
    base.method = data.method === 'endpoint' ? 'endpoint' : 'successive';
    base.digits = Number(data.digits) === 1 ? 1 : 2;
    // Version 1 stored final standard uncertainties, never instrument error limits.
    base.migrated = !!data.migrated || (data.version !== 2 && data.version !== 3 && ['uL', 'uD', 'ub', 'ud', 'un'].some(function (key) { return data.fields[key] != null && String(data.fields[key]).trim() !== ''; }));
    return applyErrorSuggestions(base);
  }

  function tenthValue(value) { return Math.abs(value) >= 1e20 ? value : roundDecimal(value, 1); }
  function isTenth(value) { return Math.abs(value - tenthValue(value)) <= Math.max(1, Math.abs(value)) * Number.EPSILON * 8; }
  function canonicalizeScaleValues(state) {
    var changed = [];
    scaleKeys.forEach(function (key) {
      var value = number(state.fields[key]);
      if (value !== null && Number.isFinite(value)) {
        var rounded = tenthValue(value);
        if (!isTenth(value)) changed.push(key);
        state.fields[key] = rounded.toFixed(1);
      }
    });
    return changed;
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
      [['up' + r, up, '增载'], ['down' + r, down, '减载']].forEach(function (item) { if (item[1] !== null && !isTenth(item[1])) { result.errors.push('第 ' + (r + 1) + ' 行' + item[2] + '标尺读数应记录到 0.1 mm；离开输入框时将明确修约。'); result.invalidKeys.push(item[0]); if (item[2] === '增载') up = null; else down = null; } });
      result.means.push(up !== null && down !== null ? (up + down) / 2 : null);
      if (up === null || down === null) readingsComplete = false;
      result.masses.push(step !== null ? 2 + r * step / 1000 : null);
    }
    for (var p = 0; p < 4; p++) {
      result.pairs.push(result.means[p + 4] !== null && result.means[p] !== null ? result.means[p + 4] - result.means[p] : null);
      if (state.selected[p]) result.selected.push(p);
    }
    if (state.method === 'successive' && result.selected.length === 0) result.errors.push('至少勾选一组逐差，才能计算杨氏模量。');
    var selectedPairs = result.selected.map(function (index) { return result.pairs[index]; });
    var chosenIncrements = state.method === 'endpoint' ? [result.means[7] !== null && result.means[0] !== null ? result.means[7] - result.means[0] : null] : selectedPairs;
    result.method = state.method; result.loadLevels = state.method === 'endpoint' ? 7 : 4;
    if (chosenIncrements.length && chosenIncrements.every(function (value) { return value !== null; })) {
      result.signedDn = mean(chosenIncrements); result.dn = Math.abs(result.signedDn);
      if (result.dn === 0) result.errors.push('所选读数增量为 0，无法计算杨氏模量。');
      if (chosenIncrements.some(function (x) { return x === 0; }) || (Math.min.apply(null, chosenIncrements) < 0 && Math.max.apply(null, chosenIncrements) > 0)) result.errors.push('所选逐差含 0 或方向不一致，请检查读数与增减载顺序。');
      if (result.dn > 0 && chosenIncrements.length > 1) {
        var range = Math.max.apply(null, chosenIncrements) - Math.min.apply(null, chosenIncrements);
        if (Math.abs(range / result.signedDn) > 0.1) result.warnings.push('所选逐差的极差超过均值的 10%，建议核对读数并检查摩擦、回程或非线性。此提醒不自动剔除数据。');
      }
    }
    if (readingsComplete && step !== null) {
      var x = result.masses, y = result.means, xm = mean(x), ym = mean(y);
      var sxx = x.reduce(function (sum, v) { return sum + Math.pow(v - xm, 2); }, 0);
      var sxy = x.reduce(function (sum, v, index) { return sum + (v - xm) * (y[index] - ym); }, 0);
      var slope = sxy / sxx, intercept = ym - slope * xm;
      var sst = y.reduce(function (sum, v) { return sum + Math.pow(v - ym, 2); }, 0);
      var sse = y.reduce(function (sum, v, index) { return sum + Math.pow(v - (intercept + slope * x[index]), 2); }, 0);
      result.fit = Number.isFinite(slope) && Number.isFinite(intercept) && Number.isFinite(sst) && Number.isFinite(sse) && Number.isFinite(sxx) && sxx > 0 ? { slope: slope, intercept: intercept, r2: sst > 0 ? Math.max(0, Math.min(1, 1 - sse / sst)) : null } : null;
      if (!result.fit) result.warnings.push('质量间隔或读数的数量级超出拟合范围，请检查单位和小数点。');
      if (result.fit && result.fit.r2 !== null && result.fit.r2 < 0.99) result.warnings.push('平均读数线性拟合 R² 小于 0.99，请结合逐差和实验现象判断；R² 阈值仅作学习提醒。');
    }
    if (step !== null && g !== null) result.deltaF = result.loadLevels * step / 1000 * g;
    if (!result.errors.length && L !== null && D !== null && b !== null && result.d !== null && result.dn > 0 && readingsComplete && result.deltaF !== null) {
      result.E = 8 * result.deltaF * L * D / (Math.PI * Math.pow(result.d * 0.001, 2) * b * 0.001 * result.dn * 0.001);
      if (Number.isFinite(result.E) && result.E > 0) result.ready = true;
      else { result.E = null; result.errors.push('输入的数量级导致计算超出范围，请检查单位及小数点。'); }
      if (result.fit && Math.abs(result.fit.slope) > 0) result.fit.E = 8 * g * L * D / (Math.PI * Math.pow(result.d * 0.001, 2) * b * 0.001 * Math.abs(result.fit.slope) * 0.001);
    }
    result.uncertaintyMissing = 0; result.uncertaintyErrors = [];
    var limits = {};
    errorKeys.forEach(function (key) {
      var value = number(f[key]); limits[key] = value;
      if (value === null) result.uncertaintyMissing++;
      else if (!Number.isFinite(value) || value < 0) {
        result.uncertaintyErrors.push(key + ' 误差限须为非负有限数值（单位 mm）。');
        result.invalidKeys.push(key);
      }
    });
    if (state.method === 'successive' && selectedPairs.length > 1 && selectedPairs.every(function (v) { return v !== null; })) {
      var pairMean = mean(selectedPairs);
      result.uAn = Math.sqrt(selectedPairs.reduce(function (sum, v) { return sum + Math.pow(v - pairMean, 2); }, 0) / (selectedPairs.length * (selectedPairs.length - 1)));
    } else result.uAn = null;
    result.standardComponents = null;
    if (!result.uncertaintyMissing && !result.uncertaintyErrors.length) {
      var uL = Math.hypot(limits.iL, limits.eL) / Math.sqrt(3);
      var uD = Math.hypot(limits.iD, limits.eD) / Math.sqrt(3);
      var ub = Math.hypot(limits.ib, limits.eb) / Math.sqrt(3);
      var uBdInstrument = limits.id / Math.sqrt(3), uBdReading = limits.ed / Math.sqrt(3);
      var uBnInstrument = Math.sqrt(2 / 3) * limits.in;
      var uBnReading = Math.sqrt(2 / 3) * limits.en;
      var ud = result.uA !== null ? Math.hypot(result.uA, uBdInstrument, uBdReading) : null;
      var un = Math.hypot(result.uAn === null ? 0 : result.uAn, uBnInstrument, uBnReading);
      result.standardComponents = { L: uL, D: uD, b: ub, d: ud, n: un, dInstrument: uBdInstrument, dReading: uBdReading, nInstrument: uBnInstrument, nReading: uBnReading };
      if (result.ready && un !== null && ud !== null) {
        var components = [uL / (L * 1000), uD / (D * 1000), ub / b, 2 * ud / result.d, un / result.dn];
        var variance = components.reduce(function (sum, v) { return sum + v * v; }, 0);
        var relative = Math.sqrt(variance);
        if (Number.isFinite(relative) && Number.isFinite(result.E * relative)) result.uncertainty = { relative: relative, u: result.E * relative, U: 2 * result.E * relative, approximate: result.uAn === null, components: components, shares: components.map(function (v) { return variance ? v * v / variance : 0; }) };
        else result.uncertaintyErrors.push('误差限的数量级超出计算范围，请检查单位。');
      }
    }
    return result;
  }

  function demoData() {
    var state = blankState(), f = state.fields;
    f.L = '1.050'; f.D = '1.350'; f.b = '40.00'; f.zero = '0.004';
    var raw = [0.703, 0.704, 0.705, 0.704, 0.703, 0.705, 0.704, 0.705, 0.703];
    raw.forEach(function (v, i) { f['d' + i] = v.toFixed(3); });
    var slope = 8 * 9.79 * 1.05 * 1.35 / (Math.PI * Math.pow(0.0007, 2) * 0.04 * 200e9) * 1000;
    for (var i = 0; i < 8; i++) { f['up' + i] = (20 + i * slope - 0.12).toFixed(1); f['down' + i] = (20 + i * slope + 0.12).toFixed(1); }
    state.demo = true; return normalize(state);
  }

  function roundedMeasurement(value, uncertainty, digits) {
    digits = digits === 1 ? 1 : 2;
    var e = value / 1e9, u = uncertainty / 1e9;
    if (!(u > 0) || !Number.isFinite(u)) return sig(e, 3) + ' ± ' + sig(u, digits) + ' GPa';
    // Round u first; a carry can change the alignment place of the full-precision E.
    var roundedU = roundDecimal(u, digits - 1 - Math.floor(Math.log10(u)));
    var places = digits - 1 - Math.floor(Math.log10(roundedU));
    if (places >= 0 && places < 12) return roundDecimal(e, places).toFixed(places) + ' ± ' + roundedU.toFixed(places) + ' GPa';
    var exponent = Math.max(Math.floor(Math.log10(Math.abs(e))), Math.floor(Math.log10(roundedU)));
    if (places + exponent > 100) return sig(e, 3) + ' ± ' + sig(u, digits) + ' GPa（量级跨度过大，分别修约）';
    var mantissaPlaces = Math.max(0, places + exponent);
    return '(' + roundDecimal(shiftDecimal(e, -exponent), mantissaPlaces).toFixed(mantissaPlaces) + ' ± ' + shiftDecimal(roundedU, -exponent).toFixed(mantissaPlaces) + ') × 10^' + exponent + ' GPa';
  }
  function meanDisplay(upRaw, downRaw) {
    var up = number(upRaw), down = number(downRaw);
    if (up === null || down === null || !Number.isFinite(up) || !Number.isFinite(down) || !isTenth(up) || !isTenth(down)) return '—';
    var sum = up + down, average = sum / 2;
    if (!Number.isFinite(sum) || !Number.isFinite(average)) return '—';
    if (sum === 0) return '0.0';
    // n′ and n″ have 0.1 mm resolution. The divisor 2 is exact, so use the
    // significant figures of the sum written to one decimal place for the mean.
    var sumText = Math.abs(tenthValue(sum)).toFixed(1);
    var significant = sumText.indexOf('e') >= 0 ? 6 : sumText.replace('.', '').replace(/^0+/, '').length;
    return sig(average, Math.max(1, significant));
  }

  function significantDigits(text) {
    var mantissa = String(text).trim().replace(/^[+-]/, '').split(/e/i)[0];
    return mantissa.replace('.', '').replace(/^0+/, '').length;
  }
  function lastShownPlace(text) {
    var parts = String(text).trim().replace(/^[+-]/, '').split(/e/i);
    return ((parts[0].split('.')[1] || '').length) - Number(parts[1] || 0);
  }
  function atDecimalPlace(value, places) {
    var rounded = roundDecimal(value, places);
    if (places >= 0 && places < 12) return (rounded === 0 ? 0 : rounded).toFixed(places);
    if (rounded === 0) return '0';
    var exponent = Math.floor(Math.log10(Math.abs(rounded)));
    return rounded.toExponential(Math.max(0, Math.min(100, exponent + places)));
  }
  function fitDisplay(result, fields) {
    if (!result.fit) return null;
    var ys = result.means.map(function (value, index) { return meanDisplay(fields['up' + index], fields['down' + index]); });
    var yPlaces = Math.min.apply(null, ys.map(lastShownPlace));
    var dyPlaces = Math.min(lastShownPlace(ys[0]), lastShownPlace(ys[7]));
    var dyText = atDecimalPlace(Number(ys[7]) - Number(ys[0]), dyPlaces);
    // The mass table reports kg to two decimals. Endpoint differences determine
    // display precision only; all eight unrounded means remain in the OLS fit.
    var dxText = atDecimalPlace(Number(fixed(result.masses[7], 2)) - Number(fixed(result.masses[0], 2)), 2);
    var stable = Number(dyText) !== 0 && Number(dxText) !== 0 && Number.isFinite(Number(dyText)) && Number.isFinite(Number(dxText));
    var slopeDigits = stable ? Math.max(1, Math.min(significantDigits(dyText), significantDigits(dxText))) : 3;
    var slope = sig(result.fit.slope, slopeDigits), intercept = atDecimalPlace(result.fit.intercept, yPlaces);
    var negativeIntercept = Number(intercept) < 0;
    var absoluteIntercept = negativeIntercept ? intercept.slice(1) : intercept;
    return { slope: slope, intercept: intercept, r2: result.fit.r2 === null ? '未定义（读数恒定）' : fixed(result.fit.r2, 5), slopeDigits: slopeDigits, interceptPlaces: yPlaces,
      equation: 'n̄ = (' + slope + ' mm/kg) M ' + (negativeIntercept ? '− ' : '+ ') + absoluteIntercept + ' mm',
      note: stable ? '斜率的有效位数按首末显示数据的增量确定；截距末位与标尺均值的最粗末位对齐。' : '端点差不足以确定有效位，斜率暂示 3 位，仅供趋势参考。' };
  }

  function differenceDisplay(result, fields) {
    var means = result.means.map(function (value, index) { return meanDisplay(fields['up' + index], fields['down' + index]); });
    var places = [], pairTexts = result.pairs.map(function (value, index) {
      var place = Math.min(lastShownPlace(means[index]), lastShownPlace(means[index + 4])); places.push(place);
      return value === null || !Number.isFinite(value) ? '—' : atDecimalPlace(value, place);
    });
    var dnText = '—', dnDigits = 0, note = '';
    if (result.dn !== null && Number.isFinite(result.dn)) {
      if (result.method === 'endpoint') {
        dnText = atDecimalPlace(result.dn, Math.min(lastShownPlace(means[0]), lastShownPlace(means[7])));
        dnDigits = significantDigits(dnText);
      } else if (result.selected.length) {
        var selectedPlaces = result.selected.map(function (index) { return places[index]; });
        var coarse = Math.min.apply(null, selectedPlaces);
        var fullSum = result.selected.reduce(function (sum, index) { return sum + result.pairs[index]; }, 0);
        if (Number.isFinite(fullSum)) {
          var sumText = atDecimalPlace(fullSum, coarse); dnDigits = significantDigits(sumText);
          dnText = Number(sumText) === 0 ? atDecimalPlace(result.dn, coarse) : sig(result.dn, Math.max(1, dnDigits));
        }
      }
      if (Number(dnText) === 0 && result.dn > 0) { dnDigits = 0; note = '按当前读数末位，标尺增量显示为 0，无法确定增量比的有效位；真实计算仍保留原始精度。'; }
    }
    var forceDigits = Math.max(1, Math.min(significantDigits(fields.step), significantDigits(fields.g)));
    var force = result.deltaF !== null && Number.isFinite(result.deltaF) ? sig(result.deltaF, forceDigits) : '—';
    var ratioDigits = dnDigits > 0 && result.deltaF !== null && Number.isFinite(result.deltaF) ? Math.min(forceDigits, dnDigits) : 0;
    var ratio = result.deltaF !== null && result.dn > 0 && ratioDigits > 0 ? sig(result.deltaF / result.dn, ratioDigits) : '—';
    return { pairs: pairTexts, dn: dnText, force: force, ratio: ratio, forceDigits: forceDigits, dnDigits: dnDigits, ratioDigits: ratioDigits, note: note };
  }

  function xml(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function graphNumber(value) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    var a = Math.abs(value);
    return a >= 1e5 || a < 0.001 ? value.toExponential(2) : String(Number(value.toPrecision(6)));
  }
  function axisNumber(value, interval) {
    if (!Number.isFinite(value)) return '—';
    if (value === 0) return '0';
    var places = Math.max(0, -Math.floor(Math.log10(Math.abs(interval))));
    if (!Number.isFinite(places)) return graphNumber(value);
    if (places <= 8 && Math.abs(value) < 1e6) return value.toFixed(places);
    var precision = Math.min(15, Math.max(2, Math.floor(Math.log10(Math.abs(value))) + places));
    return value.toExponential(precision);
  }
  function graphMarkup(result, fields, uid) {
    if (!result.fit) return '<div class="yd-graph-placeholder">录入完整的 8 组增载与减载读数后，<br>这里将展示 8 个标尺均值点与线性拟合。</div>';
    var W = 960, H = 640, left = 118, right = 52, top = 80, bottom = 154;
    var plotRight = W - right, plotBottom = H - bottom;
    var xs = result.masses, ys = result.means;
    var xmin = xs[0], xmax = xs[7], ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var yrange = ymax - ymin, xspan = xmax - xmin;
    if (!(xspan > 0) || !Number.isFinite(xspan) || !Number.isFinite(yrange)) return '<div class="yd-graph-placeholder">读数的数量级超出绘图范围，请检查单位。</div>';
    var pad = yrange ? yrange * 0.10 : Math.max(Math.abs(ymin) * 0.05, 0.5);
    ymin -= pad; ymax += pad;
    // Classroom-readable 1/2/5 × 10^n ticks, with bounded fallback for extremes.
    var rawTick = (ymax - ymin) / 5, exponent = Math.floor(Math.log10(rawTick));
    var decade = Math.pow(10, exponent), fraction = rawTick / decade;
    var tick = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * decade;
    var tickMin = Math.floor(ymin / tick) * tick, tickMax = Math.ceil(ymax / tick) * tick;
    var niceTicks = Number.isFinite(tick) && tick > 0 && Number.isFinite(tickMin) && Number.isFinite(tickMax) && tickMax > tickMin;
    if (niceTicks) { ymin = tickMin; ymax = tickMax; }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax) || !(ymax > ymin)) return '<div class="yd-graph-placeholder">读数的数量级超出绘图范围，请检查单位。</div>';
    // Padding is in normalized coordinates, avoiding overflow when x is large.
    var px = function (x) { return left + (0.055 + (x - xmin) / xspan * 0.89) * (plotRight - left); };
    var py = function (y) { return plotBottom - (y - ymin) / (ymax - ymin) * (plotBottom - top); };
    var coord = function (v) { return v.toFixed(3); };
    var title = '标尺均值与砝码总质量的关系';
    var fitShown = fitDisplay(result, fields), equation = fitShown.equation;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-labelledby="' + xml(uid) + '-graph-title ' + xml(uid) + '-graph-desc" style="font-family:Arial,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;background:#fff"><title id="' + xml(uid) + '-graph-title">' + title + '</title><desc id="' + xml(uid) + '-graph-desc">8 个空心方块为增减载标尺读数的均值，蓝色直线为最小二乘拟合。横轴总质量 M，单位 kg；纵轴标尺均值 n̄，单位 mm。</desc><rect width="960" height="640" fill="#fff"/><text x="480" y="40" text-anchor="middle" fill="#163f64" font-size="24" font-weight="700">' + title + '</text>';
    var tickCount = niceTicks ? Math.round((ymax - ymin) / tick) : 5;
    for (var t = 0; t <= tickCount; t++) {
      var vy = niceTicks ? ymin + tick * t : ymin + (ymax - ymin) * t / 5, cy = py(vy);
      if (Math.abs(vy) < Math.abs(tick) * 1e-10) vy = 0;
      svg += '<line x1="' + left + '" y1="' + coord(cy) + '" x2="' + plotRight + '" y2="' + coord(cy) + '" stroke="#e3eaf1"/><line x1="' + (left - 7) + '" y1="' + coord(cy) + '" x2="' + left + '" y2="' + coord(cy) + '" stroke="#385d79"/><text x="' + (left - 14) + '" y="' + coord(cy + 6) + '" text-anchor="end" fill="#385d79" font-size="16">' + xml(axisNumber(vy, niceTicks ? tick : (ymax - ymin) / 5)) + '</text>';
    }
    xs.forEach(function (x) { var cx = px(x); svg += '<line x1="' + coord(cx) + '" y1="' + top + '" x2="' + coord(cx) + '" y2="' + plotBottom + '" stroke="#edf1f6"/><line x1="' + coord(cx) + '" y1="' + plotBottom + '" x2="' + coord(cx) + '" y2="' + (plotBottom + 7) + '" stroke="#385d79"/><text x="' + coord(cx) + '" y="' + (plotBottom + 28) + '" text-anchor="middle" fill="#385d79" font-size="16">' + xml(axisNumber(x, xspan / 7)) + '</text>'; });
    svg += '<rect data-plot-frame="true" x="' + left + '" y="' + top + '" width="' + (plotRight - left) + '" height="' + (plotBottom - top) + '" fill="none" stroke="#385d79" stroke-width="1.8"/>';
    svg += '<line x1="' + coord(px(xmin)) + '" y1="' + coord(py(result.fit.intercept + result.fit.slope * xmin)) + '" x2="' + coord(px(xmax)) + '" y2="' + coord(py(result.fit.intercept + result.fit.slope * xmax)) + '" stroke="#0768ac" stroke-width="2.5"/>';
    ys.forEach(function (y, i) { svg += '<rect data-point="mean" x="' + coord(px(xs[i]) - 5) + '" y="' + coord(py(y) - 5) + '" width="10" height="10" fill="#fff" stroke="#144c75" stroke-width="2"><title>M = ' + xml(graphNumber(xs[i])) + ' kg；n̄ = ' + xml(meanDisplay(fields['up' + i], fields['down' + i])) + ' mm</title></rect>'; });
    // Pick the emptiest inner corner; keep the legend away from points and fit.
    var legendW = 248, legendH = 76, inset = 18;
    var positions = [
      { x: left + inset, y: top + inset }, { x: plotRight - legendW - inset, y: top + inset },
      { x: left + inset, y: plotBottom - legendH - inset }, { x: plotRight - legendW - inset, y: plotBottom - legendH - inset }
    ];
    positions.forEach(function (position, index) {
      function hits(x, y) { return x >= position.x - 10 && x <= position.x + legendW + 10 && y >= position.y - 10 && y <= position.y + legendH + 10; }
      position.score = index * 0.001;
      ys.forEach(function (y, i) { if (hits(px(xs[i]), py(y))) position.score += 6; });
      for (var sample = 0; sample <= 40; sample++) { var x = xmin + xspan * sample / 40; if (hits(px(x), py(result.fit.intercept + result.fit.slope * x))) position.score++; }
    });
    positions.sort(function (a, b) { return a.score - b.score; });
    var legend = positions[0];
    svg += '<g data-graph-legend="inside" transform="translate(' + coord(legend.x) + ' ' + coord(legend.y) + ')"><rect width="248" height="76" rx="5" fill="#fff" fill-opacity="0.96" stroke="#cbdce9"/><rect x="18" y="19" width="10" height="10" fill="#fff" stroke="#144c75" stroke-width="2"/><text x="40" y="30" font-size="16" fill="#476780">增减载均值（8 点）</text><line x1="18" y1="53" x2="34" y2="53" stroke="#0768ac" stroke-width="2.5"/><text x="40" y="59" font-size="16" fill="#476780">最小二乘拟合直线</text></g>';
    svg += '<text x="' + ((left + plotRight) / 2) + '" y="552" text-anchor="middle" fill="#224b69" font-size="19">砝码总质量 M / kg</text><text transform="translate(32 ' + ((top + plotBottom) / 2) + ') rotate(-90)" text-anchor="middle" fill="#224b69" font-size="19">标尺均值 n̄ / mm</text><text data-fit-result="equation" x="480" y="589" text-anchor="middle" fill="#476780" font-size="17">拟合：' + xml(equation) + '</text><text data-fit-result="r2" x="480" y="616" text-anchor="middle" fill="#476780" font-size="16">R² = ' + fitShown.r2 + '</text>';
    if (result.demo) svg += '<text data-demo-mark="true" x="908" y="626" text-anchor="end" fill="#9b6014" font-size="13">演示数据</text>';
    return svg + '</svg>';
  }

  var parameterInfo = [
    ['L', 'm', '金属丝有效原长 L，须大于 0'], ['D', 'm', '镜尺距离 D，须大于 0'], ['b', 'mm', '光杠杆臂长 b，须大于 0'], ['zero', 'mm', '测微计零差；可正可负；无零差填 0'], ['step', 'g', '每级砝码质量，默认 1000 g'], ['g', 'm/s²', '当地重力加速度，资料成都值 9.79']
  ];
  function csvCell(value) {
    var s = value == null ? '' : String(value);
    if (s && !Number.isFinite(number(s)) && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function rowsCSV(rows) { return '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n'); }
  function dataRows(input) {
    var s = normalize(input), rows = [['类型', '字段', '数值', '单位', '填写说明'], ['格式', 'format', 'YOUNG-LAB-CSV-2', '', '仅填写数值列，勿改字段及单位；保存为 UTF-8 CSV'], ['说明', '', '', '', 'L、D 使用 m；b、直径、标尺及全部误差限使用 mm；测量值空白可待补；误差限留空采用课程建议，iL/iD 随长度派生；数值须为纯数字'], ['元数据', 'demo', s.demo ? '1' : '0', '', '1=教学演示；0=实测记录'], ['元数据', 'method', s.method, '', 'successive=原指导书四级逐差法；endpoint=课件七级端点法'], ['元数据', 'digits', s.digits, '', '误差与不确定度显示 1 或 2 位可疑数字；只影响显示']];
    parameterInfo.forEach(function (item) { rows.push(['参数', item[0], s.fields[item[0]], item[1], item[2]]); });
    for (var d = 0; d < 9; d++) rows.push(['直径', 'd' + d, s.fields['d' + d], 'mm', '第 ' + (d + 1) + ' 次原始直径，通常记录到 0.001 mm：' + ['上部', '中部', '下部'][Math.floor(d / 3)] + '方向 ' + (d % 3 + 1)]);
    for (var n = 0; n < 8; n++) {
      rows.push(['读数', 'up' + n, s.fields['up' + n], 'mm', '第 ' + (n + 1) + ' 行增载，记录到 0.1 mm；总质量=2+(行号−1)×step/1000 kg']);
      rows.push(['读数', 'down' + n, s.fields['down' + n], 'mm', '第 ' + (n + 1) + ' 行减载，记录到 0.1 mm']);
    }
    errorQuantities.forEach(function (q) { ['i', 'e'].forEach(function (prefix) { var key = prefix + q; rows.push(['误差限', key, s.fields[key], 'mm', q + ' 的' + (prefix === 'i' ? '仪器' : '估读') + '误差限；填非负数，明确无此项填 0；留空采用课程建议；n 指增减载均值的端点误差限']); }); });
    for (var j = 0; j < 4; j++) rows.push(['逐差选用', 'selected' + j, s.selected[j] ? '1' : '0', '', '第 ' + (j + 1) + ' 组；1=选用，0=不选用（端点法不使用此选择）']);
    return rows;
  }
  function csvTemplate() { return rowsCSV(dataRows(blankState())); }
  function exportDataCSV(input) {
    var s = normalize(input), roundedFields = canonicalizeScaleValues(s), r = calculate(s), rows = dataRows(s), fitShown = fitDisplay(r, s.fields), differences = differenceDisplay(r, s.fields);
    if (roundedFields.length) rows.push(['说明', '标尺精度', '导出时已将 ' + roundedFields.length + ' 项原始标尺读数按 0.1 mm 修约：' + roundedFields.join('、')]);
    rows.push([], ['报告', '以下为计算结果，导入时自动忽略', '', '', '内部全精度；E、d̄ 为 3 位有效数字；逐差、力增量及增量比按运算规则显示；误差和不确定度显示 ' + s.digits + ' 位可疑数字；E ± u 末位对齐；误差输入行保留未修约原值'], ['报告', '取数方法', s.method === 'endpoint' ? '七级端点法' : '四级逐差法'], ['报告', '修正后平均直径', r.d !== null ? sig(r.d, 3) : '', 'mm'], ['报告', 'uA(d̄)', r.uA !== null ? sig(r.uA, s.digits) : '', 'mm']);
    for (var n = 0; n < 8; n++) rows.push(['报告', '第 ' + (n + 1) + ' 行标尺均值', r.means[n] === null ? '' : meanDisplay(s.fields['up' + n], s.fields['down' + n]), 'mm', '总质量 ' + r.masses[n] + ' kg']);
    for (var p = 0; p < 4; p++) rows.push(['报告', '第 ' + (p + 1) + ' 组逐差', r.pairs[p] === null ? '' : differences.pairs[p], 'mm', s.selected[p] ? '选用' : '未选']);
    rows.push(['报告', 'Δn', differences.dn, 'mm'], ['报告', 'Δn（未修约，复核用）', r.dn, 'mm'], ['报告', 'ΔF', differences.force, 'N'], ['报告', 'ΔF（未修约，复核用）', r.deltaF, 'N'], ['报告', 'ΔF/Δn', differences.ratio, 'N/mm'], ['报告', '增量比显示位数', differences.ratioDigits || '未确定', '位有效数字'], ['报告', '增量显示说明', differences.note], ['报告', 'E（未修约，复核用）', r.E, 'Pa'], ['报告', 'E', r.ready ? sig(r.E / 1e9, 3) : '', 'GPa'], ['报告', '拟合斜率', fitShown ? fitShown.slope : '', 'mm/kg'], ['报告', '拟合截距', fitShown ? fitShown.intercept : '', 'mm'], ['报告', 'R²', fitShown ? fitShown.r2 : ''], ['报告', '拟合斜率（未修约，复核用）', r.fit ? r.fit.slope : '', 'mm/kg'], ['报告', '拟合截距（未修约，复核用）', r.fit ? r.fit.intercept : '', 'mm'], ['报告', '拟合显示规则', fitShown ? fitShown.note : '']);
    errorKeys.forEach(function (key) { var value = number(s.fields[key]); rows.push(['报告', key + ' 误差限（显示）', value === null || !Number.isFinite(value) ? '' : sig(value, s.digits), 'mm', '未修约原值保存在输入数据行；' + (s.errorOverrides[key] ? '手动值' : '自动建议')]); });
    if (r.standardComponents) errorQuantities.forEach(function (q) { rows.push(['报告', 'u(' + (q === 'n' ? 'Δn' : q) + ')', r.standardComponents[q] === null ? '' : sig(r.standardComponents[q], s.digits), 'mm']); });
    rows.push(['报告', 'uA(Δn)', r.uAn === null ? '未评估' : sig(r.uAn, s.digits), 'mm']);
    if (r.uncertainty) r.uncertainty.shares.forEach(function (share, index) { rows.push(['报告', ['L', 'D', 'b', 'd̄', 'Δn'][index] + ' 对总方差的贡献', sig(share * 100, s.digits), '%']); });
    rows.push(['报告', 'u(E)', r.uncertainty ? sig(r.uncertainty.u / 1e9, s.digits) : '', 'GPa'], ['报告', 'u(E)（未修约，复核用）', r.uncertainty ? r.uncertainty.u : '', 'Pa'], ['报告', '相对标准不确定度', r.uncertainty ? sig(r.uncertainty.relative * 100, s.digits) : '', '%'], ['报告', '课程结果 E ± u（k=1）', r.uncertainty ? roundedMeasurement(r.E, r.uncertainty.u, s.digits) + (r.uncertainty.approximate ? '（近似评定：Δn仅B类，A类未评估）' : '') : '未评定'], ['报告', '补充 E ± U（k=2）', r.uncertainty ? roundedMeasurement(r.E, r.uncertainty.U, s.digits) + (r.uncertainty.approximate ? '（近似评定）' : '') : '未评定'], ['报告', '检查提醒', r.errors.concat(r.warnings, r.uncertaintyErrors).join('；')]);
    return rowsCSV(rows);
  }
  // RFC 4180-style state machine: preserves commas and newlines within quoted cells.
  function parseCSVRecords(raw) {
    if (typeof raw !== 'string') throw new Error('CSV 内容须为文本。');
    if (new TextEncoder().encode(raw).length > MAX_CSV_BYTES) throw new Error('CSV 超过 128 KB，请只导入本实验数据模板。');
    var text = raw.replace(/^\ufeff/, ''), records = [], row = [], cell = '', quoted = false, closed = false, line = 1, startLine = 1;
    function endCell() { row.push(cell); cell = ''; closed = false; }
    function endRow() { endCell(); if (row.some(function (v) { return v.trim() !== ''; })) records.push({ values: row, line: startLine }); row = []; startLine = line + 1; }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
        else { cell += c; if (c === '\n') line++; else if (c === '\r' && text[i + 1] !== '\n') line++; }
      } else if (c === '"') { if (cell || closed) throw new Error('第 ' + line + ' 行：引号必须包围整个单元格。'); quoted = true; }
      else if (c === ',') endCell();
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); line++; }
      else { if (closed && c !== ' ' && c !== '\t') throw new Error('第 ' + line + ' 行：闭合引号之后只能是分隔符。'); if (!closed) cell += c; }
      if (row.length > 16 || records.length > 512) throw new Error('CSV 行列过多，请使用本实验模板。');
    }
    if (quoted) throw new Error('第 ' + startLine + ' 行：引号没有闭合。');
    if (cell || row.length) endRow();
    return records;
  }
  function parseLegacyCSV(records) {
    if (!records.length) return null;
    var state = blankState(), errors = [], found = {}, first = records[0].values[0];
    if (first !== '杨氏模量实验数据报告') return null;
    var labelKeys = { '金属丝原长 L': 'L', '镜尺距离 D': 'D', '光杠杆臂长 b': 'b', '测微计零差': 'zero', '每级砝码质量': 'step', '当地重力加速度': 'g' };
    var diameterHeader = -1, readingHeader = -1, pairHeader = -1;
    records.forEach(function (record, index) {
      var v = record.values, label = v[0];
      if (label === '数据性质') state.demo = (v[1] || '').indexOf('模拟') >= 0;
      if (Object.prototype.hasOwnProperty.call(labelKeys, label)) {
        var key = labelKeys[label];
        if (found[key]) errors.push('第 ' + record.line + ' 行：旧报告 ' + label + ' 重复。');
        state.fields[key] = v[1] || ''; found[key] = true;
        var expected = parameterInfo.filter(function (item) { return item[0] === key; })[0][1];
        if (v[2] !== expected) errors.push('第 ' + record.line + ' 行：' + label + ' 单位应为 ' + expected + '。');
      }
      if (label === '直径次数' && v[2] === '原始读数 / mm') { if (diameterHeader >= 0) errors.push('第 ' + record.line + ' 行：直径表重复。'); diameterHeader = index; }
      if (label === '砝码总质量 / kg' && v[1] === '增载 n′ / mm' && v[2] === '减载 n″ / mm') { if (readingHeader >= 0) errors.push('第 ' + record.line + ' 行：标尺表重复。'); readingHeader = index; }
      if (label === '逐差组' && v[4] === '是否选用') { if (pairHeader >= 0) errors.push('第 ' + record.line + ' 行：逐差选用表重复。'); pairHeader = index; }
    });
    Object.keys(labelKeys).forEach(function (label) { if (!found[labelKeys[label]]) errors.push('旧报告缺少物理量：' + label + '。'); });
    if (diameterHeader < 0) errors.push('旧报告缺少 9 次直径原始读数表。');
    else for (var d = 0; d < 9; d++) {
      var row = records[diameterHeader + 1 + d];
      if (!row || Number(row.values[0]) !== d + 1) errors.push('旧报告直径表第 ' + (d + 1) + ' 次记录缺失或顺序错误。');
      else { state.fields['d' + d] = row.values[2] || ''; var value = number(state.fields['d' + d]); if (value !== null && (!Number.isFinite(value) || value <= 0)) errors.push('第 ' + row.line + ' 行：d' + d + ' 须为正数（mm）。'); }
    }
    if (readingHeader < 0) errors.push('旧报告缺少 8 组增减载读数表。');
    else for (var n = 0; n < 8; n++) {
      var row = records[readingHeader + 1 + n], mass = 2 + n * Number(state.fields.step) / 1000;
      if (!row || !Number.isFinite(Number(row.values[0])) || Math.abs(Number(row.values[0]) - mass) > Math.max(1e-10, Math.abs(mass) * 1e-10)) errors.push('旧报告标尺表第 ' + (n + 1) + ' 行总质量与每级砝码质量不匹配。');
      if (row) { state.fields['up' + n] = row.values[1] || ''; state.fields['down' + n] = row.values[2] || ''; ['up', 'down'].forEach(function (prefix) { var value = number(state.fields[prefix + n]); if (value !== null && !Number.isFinite(value)) errors.push('第 ' + row.line + ' 行：' + prefix + n + ' 须为有限纯数字（mm）。'); }); }
    }
    if (pairHeader < 0) errors.push('旧报告缺少逐差选用记录。');
    else for (var p = 0; p < 4; p++) { var row = records[pairHeader + 1 + p]; if (!row || Number(row.values[0]) !== p + 1 || ['是', '否'].indexOf(row.values[4]) < 0) errors.push('旧报告第 ' + (p + 1) + ' 组逐差选用记录无效。'); else state.selected[p] = row.values[4] === '是'; }
    if (errors.length) return { ok: false, errors: errors, warnings: [] };
    // Reuse the exact current numeric and unit validation, then mark migration.
    var parsed = parseCSV(rowsCSV(dataRows(state)));
    if (parsed.ok) { parsed.state.migrated = true; errorKeys.forEach(function (key) { parsed.state.errorOverrides[key] = false; }); applyErrorSuggestions(parsed.state); parsed.warnings.push('已识别旧版报告并恢复原始记录；旧版最终 u 字段未作为误差限导入，已按当前课程建议补齐，可逐项手动修改。'); }
    return parsed;
  }

  function parseCSV(raw) {
    var records;
    try { records = parseCSVRecords(raw); } catch (error) { return { ok: false, errors: [error.message], warnings: [] }; }
    var legacy = parseLegacyCSV(records); if (legacy) return legacy;
    var errors = [], warnings = [], state = blankState(), seen = {}, lineFor = {}, format = false;
    if (!records.length || records[0].values.slice(0, 4).join('|') !== '类型|字段|数值|单位') return { ok: false, errors: ['第 1 行：表头应为“类型,字段,数值,单位,填写说明”。请下载本页 CSV 模板后填写。'], warnings: [] };
    var unitFor = {};
    parameterInfo.forEach(function (item) { unitFor[item[0]] = item[1]; });
    keys.forEach(function (key) { if (!(key in unitFor)) unitFor[key] = 'mm'; });
    records.slice(1).forEach(function (record) {
      var v = record.values, kind = (v[0] || '').trim(), key = (v[1] || '').trim(), value = (v[2] || '').trim(), unit = (v[3] || '').trim();
      if (kind === '报告' || kind === '说明') return;
      if (kind === '格式') { if (key !== 'format' || value !== 'YOUNG-LAB-CSV-2' || unit || format) errors.push('第 ' + record.line + ' 行：格式标识应唯一且为 YOUNG-LAB-CSV-2，单位留空。'); format = true; return; }
      if (seen[key]) { errors.push('第 ' + record.line + ' 行：字段 ' + key + ' 重复（首次在第 ' + lineFor[key] + ' 行）。'); return; }
      if (keys.indexOf(key) >= 0) {
        var expectedKind = /^(up|down)/.test(key) ? '读数' : /^d\d$/.test(key) ? '直径' : errorKeys.indexOf(key) >= 0 ? '误差限' : '参数';
        if (kind !== expectedKind) errors.push('第 ' + record.line + ' 行：' + key + ' 的类型应为“' + expectedKind + '”。');
        if (unit !== unitFor[key]) errors.push('第 ' + record.line + ' 行：' + key + ' 的单位应为 ' + unitFor[key] + '。');
        var numeric = number(value);
        if (numeric !== null && (!Number.isFinite(numeric) || ((['L', 'D', 'b', 'step', 'g'].indexOf(key) >= 0 || /^d\d$/.test(key)) && numeric <= 0) || (errorKeys.indexOf(key) >= 0 && numeric < 0))) errors.push('第 ' + record.line + ' 行：' + key + ' 须填' + (errorKeys.indexOf(key) >= 0 ? '非负' : ['L', 'D', 'b', 'step', 'g'].indexOf(key) >= 0 || /^d\d$/.test(key) ? '大于 0 的' : '') + '有限纯数字，勿附加单位。');
        if (value.length > 100) errors.push('第 ' + record.line + ' 行：' + key + ' 内容过长。');
        state.fields[key] = value;
        if (errorKeys.indexOf(key) >= 0) state.errorOverrides[key] = value !== '';
      } else if (/^selected[0-3]$/.test(key)) {
        if (kind !== '逐差选用' || !/^[01]$/.test(value) || unit) errors.push('第 ' + record.line + ' 行：' + key + ' 应为无单位的 0 或 1，类型为逐差选用。');
        state.selected[Number(key.slice(-1))] = value === '1';
      } else if (key === 'demo') {
        if (kind !== '元数据' || !/^[01]$/.test(value) || unit) errors.push('第 ' + record.line + ' 行：demo 应为无单位的 0 或 1。'); state.demo = value === '1';
      } else if (key === 'method') {
        if (kind !== '元数据' || ['successive', 'endpoint'].indexOf(value) < 0 || unit) errors.push('第 ' + record.line + ' 行：method 应为 successive 或 endpoint，无单位。'); state.method = value;
      } else if (key === 'digits') {
        if (kind !== '元数据' || !/^[12]$/.test(value) || unit) errors.push('第 ' + record.line + ' 行：digits 应为无单位的 1 或 2。'); state.digits = value === '1' ? 1 : 2;
      } else { errors.push('第 ' + record.line + ' 行：不识别字段“' + key + '”，请保留模板字段名。'); return; }
      seen[key] = true; lineFor[key] = record.line;
    });
    if (!format) errors.push('缺少格式标识行 YOUNG-LAB-CSV-2。');
    keys.concat(['selected0', 'selected1', 'selected2', 'selected3', 'demo', 'method']).forEach(function (key) { if (!seen[key]) errors.push('缺少字段 ' + key + '，请保留模板的全部数据行。'); });
    if (state.method === 'successive' && !state.selected.some(Boolean)) errors.push('逐差选用：至少有一组填写 1。');
    var z = number(state.fields.zero);
    for (var d = 0; d < 9; d++) { var value = number(state.fields['d' + d]); if (Number.isFinite(z) && Number.isFinite(value) && value - z <= 0) errors.push('第 ' + lineFor['d' + d] + ' 行：d' + d + ' 扣除零差后须大于 0。'); }
    var precisionFields = canonicalizeScaleValues(state);
    if (precisionFields.length) warnings.push('已按 0.1 mm 修约 ' + precisionFields.length + ' 项原始标尺读数：' + precisionFields.slice(0, 8).join('、') + (precisionFields.length > 8 ? '等' : '') + '；表格显示与后续计算均使用修约后的数值。');
    state = normalize(state);
    if (errorKeys.some(function (key) { return state.errorOverrides[key]; })) warnings.push('文件中已填的误差限按原值保留为手动项，不会随 L、D 更新；可用“恢复课程建议值”改回自动。');
    var empty = keys.filter(function (key) { return state.fields[key] === ''; }).length;
    if (empty) warnings.push(empty + ' 个数值留空，导入后可继续填写；尚未完成的量不会输出结果。');
    if (state.demo) warnings.push('该文件带有演示标记，不能作为实测结果提交。');
    return { ok: !errors.length, errors: errors, warnings: warnings, state: !errors.length ? normalize(state) : null };
  }

  function mount(container) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container || !container.appendChild) throw new Error('YoungData.mount 需要有效的容器。');
    var uid = 'yd-' + (++sequence), state = blankState(), undo = null, saveTimer = null, lastResult, destroyed = false, editRevision = 0, importSerial = 0;
    try { var saved = localStorage.getItem(STORAGE_KEY); if (saved) state = normalize(JSON.parse(saved)); } catch (ignore) {}
    var wrapper = document.createElement('section'); wrapper.className = 'yd'; wrapper.setAttribute('aria-label', '杨氏模量实验数据处理工作台');
    function input(key, label, placeholder) { return '<label class="yd-field" for="' + uid + '-' + key + '">' + label + '<input id="' + uid + '-' + key + '" name="' + key + '" data-field="' + key + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="' + (placeholder || '输入实测值') + '">' + (errorKeys.indexOf(key) >= 0 ? '<span class="yd-error-mode" data-error-mode="' + key + '"></span><span class="yd-error-display" data-error-display="' + key + '"></span>' : '') + '</label>'; }
    var diameterMarkup = '';
    for (var d = 0; d < 9; d++) diameterMarkup += input('d' + d, ['上部', '中部', '下部'][Math.floor(d / 3)] + ' · 方向 ' + (d % 3 + 1), 'mm');
    var rows = '';
    for (var n = 0; n < 8; n++) rows += '<tr><td data-mass="' + n + '">' + (n + 2).toFixed(2) + '</td><td><input aria-label="第 ' + (n + 1) + ' 行增载标尺读数，单位毫米，记录到十分位" id="' + uid + '-up' + n + '" data-field="up' + n + '" type="text" inputmode="decimal" autocomplete="off" placeholder="mm · 0.1"></td><td><input aria-label="第 ' + (n + 1) + ' 行减载标尺读数，单位毫米，记录到十分位" id="' + uid + '-down' + n + '" data-field="down' + n + '" type="text" inputmode="decimal" autocomplete="off" placeholder="mm · 0.1"></td><td class="yd-mean" data-mean="' + n + '">—</td></tr>';
    var pairMarkup = '';
    for (var p = 0; p < 4; p++) pairMarkup += '<label class="yd-pair"><input type="checkbox" data-pair="' + p + '" aria-label="选用第 ' + (p + 1) + ' 组逐差"><span><span data-pair-label="' + p + '">第 ' + (p + 1) + ' 组逐差</span><output data-pair-value="' + p + '">— mm</output></span></label>';
    wrapper.innerHTML = '<div class="yd-intro"><div><div class="yd-kicker">数据工作台</div><h2>把读数变成实验结果</h2><p class="yd-muted">录入原始读数，逐步检查零差修正、逐差、线性关系与结果表达。</p></div><span class="yd-badge" data-out="mode">实测数据 · 待录入</span></div>' +
      '<div class="yd-toolbar"><button class="yd-button" type="button" data-action="template">下载 CSV 导入模板</button><button class="yd-button yd-quiet" type="button" data-action="import">导入 CSV 数据</button><input type="file" data-csv-file accept=".csv,text/csv" hidden><button class="yd-button" type="button" data-action="demo">填入演示数据</button><button class="yd-button yd-quiet" type="button" data-action="csv">导出 CSV</button><button class="yd-button yd-quiet" type="button" data-action="print">打印报告</button><button class="yd-button yd-quiet yd-rules-open" type="button" data-action="rules">查看有效数字运算规则 / 放大查看</button><button class="yd-button yd-text" type="button" data-action="clear">清空记录</button><button class="yd-button yd-quiet" type="button" data-action="undo" hidden>恢复上一组</button><span class="yd-save" data-out="save">仅在本机浏览器保存</span></div>' +
      '<p class="yd-csv-help">先下载模板，用 Excel 等表格软件填写<strong>数值列</strong>，另存为 <strong>UTF-8 CSV</strong> 后导入。模板含 9 次直径、8 组增减载及课程建议误差限；L、D 用 m，其余长度和误差限用 mm。iL、iD 留空可随导入的长度自动计算；已填误差值按文件保留。文件仅在本机处理（≤128 KB）。导入前逐项检查，失败时保留当前记录；成功后也可恢复上一组。</p><div class="yd-status" data-out="importStatus" role="status" aria-live="polite" hidden></div><div class="yd-status" data-out="migration" hidden>已恢复旧版原始记录。旧版 u 值是最终标准不确定度，本次未当作误差限沿用；已按课程建议补齐右侧误差限，自动项可随时手动修改。</div>' +
      '<div class="yd-grid"><div class="yd-stack"><article class="yd-card"><div class="yd-kicker">01 / 直接测量</div><h3>几何量与金属丝直径</h3><div class="yd-fields">' + input('L', '原长 L <span class="yd-unit">/ m</span>') + input('D', '镜尺距离 D <span class="yd-unit">/ m</span>') + input('b', '光杠杆臂长 b <span class="yd-unit">/ mm</span>') + '</div><p class="yd-help">L 为上夹紧区下缘至平台夹紧区上缘的有效长度；b 为后足至前两足连线的垂距。</p><div class="yd-separator"></div>' + input('zero', '测微计零差 <span class="yd-unit">/ mm · 可正可负，无零差填 0</span>', '先记录零差，再录入直径') + '<h4>直径原始读数 d′ <span class="yd-unit">/ mm · 共 9 次</span></h4><div class="yd-diameters">' + diameterMarkup + '</div><div class="yd-inline-result"><span>零差修正后平均直径 d̄（3 位有效数字）</span><strong data-out="diameter">— mm</strong></div><p class="yd-help">每次 dᵢ = d′ᵢ − 零差；d̄ 为 9 次修正值的平均。<br><span data-out="diameterA">完整输入后显示直径均值的 A 类标准不确定度。</span></p></article>' +
      '<article class="yd-card"><div class="yd-kicker">02 / 增载与减载</div><h3>标尺读数记录</h3><p class="yd-note">资料采用 2.00 kg 预载、每级 1.00 kg，记录 2—9 kg。加至 10 kg 后回到 9 kg 再读减载值；10 kg 不计入记录。</p><div class="yd-table-wrap"><table class="yd-table"><thead><tr><th scope="col">总质量 / kg</th><th scope="col">增载 n′ / mm</th><th scope="col">减载 n″ / mm</th><th scope="col">均值 n / mm</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="yd-fields yd-step-fields">' + input('step', '每级砝码质量 m <span class="yd-unit">/ g</span>', '资料：1000') + input('g', '当地 g <span class="yd-unit">/ m·s⁻²</span>', '资料成都值：9.79') + '</div><p class="yd-help">原始标尺读数记录到 0.1 mm；n = (n′ + n″) / 2，均值按求和结果的有效数字显示，除数 2 是准确数（如 19.9 + 20.1 = 40.0，均值 20.0；60.8 + 59.9 = 120.7，均值 60.35）。输入更多位时，离开输入框将按 0.1 mm 修约并提示；修约前不使用多余位计算。若更改每级质量，表中总质量与四级跨距同步更新；起始预载仍为 2.00 kg。</p></article>' +
      '<article class="yd-card"><div class="yd-kicker">03 / 逐差检验</div><h3>选择取数方法</h3><label class="yd-method" for="' + uid + '-method">计算方法<select id="' + uid + '-method" data-method><option value="successive">原指导书：四级逐差法（默认）</option><option value="endpoint">数据处理课件：七级端点法</option></select></label><p class="yd-help" data-out="methodHint"></p><p class="yd-note">原指导书采用四组逐差的平均值，也允许合理选择两组数据求力与读数的增量比。此处默认使用全部四组，可按教师要求选择取数组。</p><div class="yd-pairs">' + pairMarkup + '</div><div class="yd-report-lines"><div class="yd-report-line"><span data-out="dnLabel">所选逐差绝对均值 Δn</span><strong data-out="dn">— mm</strong></div><div class="yd-report-line"><span data-out="forceLabel">对应力增量 ΔF = 4mg</span><strong data-out="force">— N</strong></div><div class="yd-report-line"><span data-out="ratioLabel">ΔF/Δn（按运算规则显示）</span><strong data-out="forceRatio">— N/mm</strong></div></div><p class="yd-help">逐差保留符号以检查方向，计算时取所选逐差均值的绝对值。完整输入 8 组增减载读数后再输出 E；平台不自动删除异常值。</p></article></div>' +
      '<div class="yd-stack"><article class="yd-card yd-result"><div class="yd-kicker">杨氏模量 · 实验结果</div><h3 data-out="methodResult">逐差法测得 E</h3><div class="yd-value" data-out="E">— <span>GPa</span></div><small data-out="resultHint">完成原始测量记录后自动计算</small><div class="yd-toast" data-out="demoNotice" hidden style="color:#ffe1af">当前为模拟教学数据，不能作为实测结果提交。</div></article>' +
      '<article class="yd-card"><h3>从读数到杨氏模量</h3><div class="yd-formula" aria-label="E 等于 8 乘力增量乘原长乘镜尺距离，除以 π 乘直径平方乘光杠杆臂长乘标尺位移">E = 8ΔF L D / (πd̄² b Δn)</div><p class="yd-note">内部统一换算为 m、kg、N，E 的计算单位为 Pa，显示时除以 10⁹ 转为 GPa。预载用于拉直金属丝，ΔF 取所选两读数之间的增量。</p><div class="yd-status" data-out="status" role="status" aria-live="polite"></div></article>' +
      '<article class="yd-card"><div class="yd-kicker">线性关系</div><h3>用标尺均值描点与拟合</h3><div class="yd-graph" data-out="graph"></div><div class="yd-graph-actions"><button class="yd-button yd-quiet" type="button" data-action="svg" disabled>导出 SVG 图片</button><button class="yd-button yd-quiet" type="button" data-action="png" disabled>导出高清 PNG</button><span>白底 · 含图名、单位、刻度与拟合信息</span></div><div class="yd-fit-stats"><span>斜率 <strong data-out="slope">—</strong> mm/kg</span><span>截距 <strong data-out="intercept">—</strong> mm</span><span>R² <strong data-out="r2">—</strong></span></div><p class="yd-help" data-out="fitE">8 个均值点用于最小二乘拟合，作为取数法的交叉检查。</p></article>' +
      '<article class="yd-card"><div class="yd-kicker">不确定度自动评估</div><h3>误差限自动建议，也可手动修改</h3><p class="yd-note">已按课程资料填写<strong>仪器误差限</strong>与<strong>估读误差限</strong>建议值（单位 mm）。L、D 的仪器限随原始长度自动计算；修改任何误差限后，该项保留为手动值。平台按均匀分布自动除以 √3，再合成 A、B 类分量；不必输入最终 u 值。标尺 n 的误差限指每个增减载<strong>均值端点</strong>。</p><label class="yd-digits-control">误差与不确定度显示<select data-digits><option value="1">1 位可疑数字</option><option value="2">2 位可疑数字（默认）</option></select></label><p class="yd-help">显示位数仅控制自动建议外观与报告修约，不改变计算精度；手动输入及 CSV 输入行保留原值，下方另列报告显示值。</p><button class="yd-button yd-quiet yd-restore-errors" type="button" data-action="restore-errors">恢复课程建议值</button><div class="yd-table-wrap"><table class="yd-table yd-error-table"><thead><tr><th>物理量</th><th>仪器误差限 / mm</th><th>估读误差限 / mm</th></tr></thead><tbody>' + errorQuantities.map(function (q) { return '<tr><th scope="row">' + ({L:'L',D:'D',b:'b',d:'直径 d',n:'标尺均值 n'})[q] + '</th><td>' + input('i' + q, q + ' 仪器误差限', '无此项填 0') + '</td><td>' + input('e' + q, q + ' 估读误差限', '无此项填 0') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="yd-help">估读限填写未被重复测量散度涵盖的分辨或判断分量；若已计入 A 类且无额外来源，可填 0，避免重复计算。共同仪器误差不因重复次数变多而自动缩小；直径误差限按零差修正后的直径填写；若零差改正值另有不确定度，请并入相应误差限，同一校准来源勿重复计入。</p><div class="yd-standard-components" data-out="standardComponents"></div><div class="yd-status" data-out="uncertaintyStatus" role="status" aria-live="polite">可稍后填写。</div><div class="yd-budget" data-out="budget" hidden></div><details><summary>查看建议值、自动评估模型与课程近似</summary><p>卷尺仪器误差限 = (0.2 × 测量值(mm)/1000 + 0.3) mm，因此 iL = 0.2L(m) + 0.3 mm，iD 同理；内部使用未修约值。固定建议：L 估读 2 mm、D 估读 5 mm；b 仪器 0.02 mm、估读 0.2 mm；直径仪器 0.004 mm、估读 0.002 mm；标尺仪器 0.15 mm、估读 1 mm。请按实际仪器或教师要求覆盖建议。导入文件中已填的误差值按手动值保留。</p><p>L、D、b：u(x) = √[(仪器限² + 估读限²)/3]。直径：uA(d̄) = √[Σ(dᵢ − d̄)²/(9×8)]，u(d̄) = √[uA(d̄)² + 仪器限²/3 + 估读限²/3]。</p><p>逐差法选 q≥2 组：uA(Δn) = √[Σ(δᵢ − δ̄)²/(q(q−1))]。标尺 B 类按课件保守处理：uB(Δn) = √[2(仪器限² + 估读限²)/3]，不按 q 缩小；u(Δn) = √[uA² + uB²]。此模型没有把共同系统误差当作独立重复读数；完全共同的加性零点偏差在差分中可抵消，但未分析的刻度等误差不据此减小。只有一组逐差或采用端点法时，不能从现有数据评估 Δn 的 A 类；平台按课件近似仅使用其 B 类，并为结果标注“近似评定”。</p><p>按资料近似忽略砝码与 g 的不确定度（须满足 u(ΔF)/ΔF 远小于 u(Δn)/Δn），5 个输入量之间视为独立：uᵣ(E)² = [u(L)/L]² + [u(D)/D]² + [u(b)/b]² + [2u(d̄)/d̄]² + [u(Δn)/Δn]²；u(E) = E·uᵣ(E)，U = 2u(E)。资料示例误差限：L 估读 2 mm、D 估读 5 mm、b 估读 0.2 mm，测微计仪器 0.004 mm；需按实际仪器与教师要求填写，勿照搬示例。</p></details></article>' +
      '<article class="yd-card"><h3>实验报告摘录</h3><div class="yd-report-lines"><div class="yd-report-line"><span>E（3 位有效数字）</span><strong data-out="reportE">待完成</strong></div><div class="yd-report-line"><span data-out="uDigitsLabel">合成标准不确定度 u(E)（2 位可疑数字）</span><strong data-out="u">未评定</strong></div><div class="yd-report-line"><span>相对标准不确定度</span><strong data-out="relative">未评定</strong></div><div class="yd-report-line"><span>课程结果 E ± u(E)，k = 1</span><strong data-out="standard">未评定</strong></div><div class="yd-report-line"><span>补充：E ± U，k = 2</span><strong data-out="expanded">未评定</strong></div></div><p class="yd-help">d̄ 和单独计算的 E 按资料保留 3 位有效数字；逐差与端点差按相减时最粗末位显示，逐差均值按所选逐差之和的有效位数显示，组数为准确数；ΔF 按质量与 g 的有效位数，ΔF/Δn 按两者较少的有效位数显示；误差限与标准不确定度可选择 1 或 2 位可疑数字，默认 2 位。最终先修约 u(E)，再让 E 的末位对齐；内部保留完整精度，不从单独 E 的三位显示值二次计算。补充结果 E ± U 采用相同修约方式；k = 2 为覆盖因子，不自动等同于确定的置信概率。</p></article></div></div>' +
      '<div class="yd-notice">原始记录请以实验现场观测为准。线性拟合只能辅助检查，不能替代弹性限度、摩擦、振动及调焦等实验条件的判断。</div><p class="yd-footer">数据仅保存在当前浏览器，建议完成记录后导出 CSV 留存。演示数据通过 E ≈ 200 GPa 的数学模型生成，所有演示参数均为教学假设。</p><div class="yd-toast" data-out="toast" role="status" aria-live="polite"></div>' +
      '<dialog class="yd-rules-dialog" aria-labelledby="' + uid + '-rules-title"><div class="yd-rules-header"><h3 id="' + uid + '-rules-title">有效数字运算规则</h3><button type="button" class="yd-button yd-quiet" data-action="close-rules" aria-label="关闭有效数字规则">关闭</button></div><div class="yd-rules-controls"><button type="button" class="yd-button yd-quiet" data-action="rules-fit" aria-pressed="true">适应窗口</button><button type="button" class="yd-button yd-quiet" data-action="rules-original" aria-pressed="false">原始尺寸</button><span>可纵向或横向滚动查看；按 Esc 关闭。</span></div><div class="yd-rules-viewport" data-rules-view="fit"><img data-rules-image loading="lazy" alt="有效数字加减乘除、幂根、对数指数、函数与准确常数等运算规则原图"></div></dialog>' +
      '<dialog class="yd-demo-dialog" aria-labelledby="' + uid + '-demo-title"><form data-demo-form method="dialog" novalidate><div class="yd-rules-header"><h3 id="' + uid + '-demo-title">演示数据验证</h3><button type="button" class="yd-button yd-quiet" data-action="close-demo" aria-label="关闭演示数据验证">关闭</button></div><p class="yd-note" id="' + uid + '-demo-hint">请输入教师提供的验证码后填入演示数据。每次使用均需验证。</p><label class="yd-field" for="' + uid + '-demo-code">验证码<input id="' + uid + '-demo-code" data-demo-code name="demo-code" type="text" autocomplete="off" spellcheck="false" required autofocus aria-describedby="' + uid + '-demo-hint ' + uid + '-demo-error" aria-invalid="false"></label><p class="yd-demo-error" id="' + uid + '-demo-error" data-demo-error role="status" aria-live="polite"></p><div class="yd-demo-actions"><button class="yd-button yd-quiet" type="button" data-action="close-demo">取消</button><button class="yd-button" type="submit">填入演示数据</button></div></form></dialog>';
    container.appendChild(wrapper);
    var outputs = {};
    wrapper.querySelectorAll('[data-out]').forEach(function (node) { outputs[node.dataset.out] = node; });
    var inputs = {};
    wrapper.querySelectorAll('[data-field]').forEach(function (node) { inputs[node.dataset.field] = node; });
    function displayField(key) {
      var value = state.fields[key], numeric = number(value);
      return errorKeys.indexOf(key) >= 0 && !state.errorOverrides[key] && Number.isFinite(numeric) ? sig(numeric, state.digits) : value;
    }
    function applyState() {
      state = normalize(state);
      keys.forEach(function (key) { inputs[key].value = displayField(key); });
      wrapper.querySelectorAll('[data-pair]').forEach(function (node) { node.checked = state.selected[Number(node.dataset.pair)]; });
      wrapper.querySelector('[data-method]').value = state.method;
      wrapper.querySelector('[data-digits]').value = String(state.digits);
      render();
    }
    function save() {
      clearTimeout(saveTimer);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); outputs.save.textContent = '已自动保存在本机浏览器'; }
      catch (error) { outputs.save.textContent = '浏览器未允许本地保存，请导出 CSV'; }
    }
    function text(name, value) { outputs[name].textContent = value; }
    function render() {
      state = normalize(state);
      var result = calculate(state); lastResult = result;
      var differences = differenceDisplay(result, state.fields);
      outputs.migration.hidden = !state.migrated;
      errorKeys.forEach(function (key) {
        var manual = state.errorOverrides[key], badge = wrapper.querySelector('[data-error-mode="' + key + '"]');
        if (!manual) inputs[key].value = displayField(key);
        badge.textContent = manual ? '手动值' : state.fields[key] === '' ? '待测量后自动计算' : '自动建议';
        badge.dataset.mode = manual ? 'manual' : 'auto';
        var raw = number(state.fields[key]);
        wrapper.querySelector('[data-error-display="' + key + '"]').textContent = raw === null || !Number.isFinite(raw) ? '' : '报告显示：' + sig(raw, state.digits) + ' mm';
      });
      text('methodHint', state.method === 'endpoint' ? '按《杨氏模量_实验数据处理_16x9》：Δn = |n₇ − n₀|，ΔF = 7mg。下方四组逐差仍供线性检查，勾选不会改变端点法结果。' : '默认沿用原指导书：对所选四级逐差取平均，ΔF = 4mg；至少选择一组。');
      text('dnLabel', state.method === 'endpoint' ? '首末端点标尺增量 Δn' : '所选逐差绝对均值 Δn');
      text('forceLabel', '对应力增量 ΔF = ' + result.loadLevels + 'mg');
      text('methodResult', state.method === 'endpoint' ? '端点法测得 E' : '逐差法测得 E');
      keys.forEach(function (key) { inputs[key].setAttribute('aria-invalid', result.invalidKeys.indexOf(key) >= 0 ? 'true' : 'false'); });
      text('mode', state.demo ? '演示数据 · 教学示例' : (result.ready ? '实测数据 · 已计算' : '实测数据 · 待补全'));
      outputs.mode.dataset.demo = String(state.demo); outputs.demoNotice.hidden = !state.demo;
      text('uDigitsLabel', '合成标准不确定度 u(E)（' + state.digits + ' 位可疑数字）');
      text('diameter', result.d !== null ? sig(result.d, 3) + ' mm' : '— mm');
      text('diameterA', result.uA !== null ? '直径均值的 A 类标准不确定度 uA(d̄) = ' + sig(result.uA, state.digits) + ' mm（' + state.digits + ' 位可疑数字）；此值不包含仪器和零差修正分量。' : '完整输入后显示直径均值的 A 类标准不确定度。');
      wrapper.querySelectorAll('[data-mass]').forEach(function (node) { var index = Number(node.dataset.mass); node.textContent = result.masses[index] !== null ? fixed(result.masses[index], 2) : '—'; });
      wrapper.querySelectorAll('[data-mean]').forEach(function (node) { var index = Number(node.dataset.mean), value = result.means[index]; node.textContent = value !== null ? meanDisplay(state.fields['up' + index], state.fields['down' + index]) : '—'; });
      wrapper.querySelectorAll('[data-pair-label]').forEach(function (node) { var i = Number(node.dataset.pairLabel); node.textContent = result.masses[i] !== null ? 'n(' + fixed(result.masses[i + 4], 2) + ' kg) − n(' + fixed(result.masses[i], 2) + ' kg)' : '第 ' + (i + 1) + ' 组逐差'; });
      wrapper.querySelectorAll('[data-pair-value]').forEach(function (node) { var index = Number(node.dataset.pairValue); node.textContent = differences.pairs[index] + ' mm'; });
      text('dn', result.dn !== null ? differences.dn + ' mm' + (state.method === 'endpoint' ? '（首末端点）' : '（' + result.selected.length + ' 组）') : '— mm');
      text('force', differences.force + ' N');
      text('forceRatio', differences.ratio + ' N/mm');
      text('ratioLabel', 'ΔF/Δn（' + (differences.ratioDigits ? differences.ratioDigits + ' 位有效数字' : '待确定有效位') + '）');
      outputs.E.innerHTML = (result.ready ? sig(result.E / 1e9, 3) : '—') + ' <span>GPa</span>';
      text('resultHint', result.ready ? (state.demo ? '模型生成的教学示例 · 不代表实测材料' : '根据完整原始读数与所选取数方法计算') : '完成几何量、9 次直径与 8 组增减载读数后自动计算');
      outputs.status.replaceChildren();
      var notes = result.errors.slice();
      if (result.missing.length) notes.push('尚有 ' + result.missing.length + ' 项必填读数未完成：' + result.missing.slice(0, 3).join('、') + (result.missing.length > 3 ? '等。' : '。'));
      if (result.ready) notes.push((state.method === 'endpoint' ? '已使用首末均值的七级端点差' : '已使用 ' + result.selected.length + ' 组四级逐差') + '；对应质量差为 ' + fixed(result.loadLevels * result.step / 1000, 3) + ' kg。');
      notes = notes.concat(result.warnings);
      if (differences.note) notes.push(differences.note);
      outputs.status.dataset.state = result.errors.length ? 'error' : (result.ready ? 'ready' : 'waiting');
      notes.forEach(function (message) { var line = document.createElement('div'); line.textContent = message; outputs.status.appendChild(line); });
      outputs.graph.innerHTML = graphMarkup(result, state.fields, uid);
      ['svg', 'png'].forEach(function (action) { wrapper.querySelector('[data-action="' + action + '"]').disabled = !result.fit || !outputs.graph.querySelector('svg'); });
      outputs.standardComponents.replaceChildren();
      if (result.standardComponents) errorQuantities.forEach(function (q) { var value = result.standardComponents[q], row = document.createElement('div'); row.textContent = 'u(' + (q === 'd' ? 'd̄' : q === 'n' ? 'Δn' : q) + ') = ' + (value === null ? '待原始数据' : sig(value, state.digits) + ' mm'); outputs.standardComponents.appendChild(row); });
      var fitShown = fitDisplay(result, state.fields);
      text('slope', fitShown ? fitShown.slope : '—'); text('intercept', fitShown ? fitShown.intercept : '—'); text('r2', fitShown ? fitShown.r2 : '—');
      var fitHint = result.fit && Number.isFinite(result.fit.E) ? '平均读数最小二乘拟合对应 E = ' + sig(result.fit.E / 1e9, 3) + ' GPa，供与取数法交叉检查。F = Mg，因此 n–M 图与 n–F 图线性等价；此处斜率单位为 mm/kg。' : '8 个均值点用于最小二乘拟合，作为取数法的交叉检查。F = Mg，因此 n–M 图与 n–F 图线性等价。';
      text('fitE', fitHint + (fitShown ? ' ' + fitShown.note : ''));
      text('reportE', result.ready ? sig(result.E / 1e9, 3) + ' GPa' + (state.demo ? '（演示）' : '') : '待完成');
      if (result.uncertainty) {
        var u = result.uncertainty;
        text('u', sig(u.u / 1e9, state.digits) + ' GPa'); text('relative', sig(u.relative * 100, state.digits) + '%');
        text('standard', roundedMeasurement(result.E, u.u, state.digits) + (u.approximate ? '（近似评定）' : '') + (state.demo ? '（演示）' : ''));
        text('expanded', roundedMeasurement(result.E, u.U, state.digits) + (u.approximate ? '（近似评定）' : '') + (state.demo ? '（演示）' : ''));
        text('uncertaintyStatus', (u.approximate ? '近似评定：Δn 仅包含 B 类，现有端点或单组逐差不能评估其 A 类。需要完整评定时，请记录重复周期，或使用至少两组逐差的课程模型。' : '已自动计算直径与所选逐差的 A 类，并与误差限评得的 B 类合成。') + ' 下图显示各项对总方差的贡献。' + (u.u === 0 ? '当前各项均为 0，请确认这符合你的评定。' : ''));
        outputs.uncertaintyStatus.dataset.state = 'ready'; outputs.budget.hidden = false; outputs.budget.innerHTML = '';
        u.shares.forEach(function (share, index) {
          var row = document.createElement('div'); row.className = 'yd-budget-row';
          row.innerHTML = '<span>' + ['L', 'D', 'b', 'd̄', 'Δn'][index] + '</span><span class="yd-budget-track"><i style="width:' + (share * 100).toFixed(2) + '%"></i></span><span>' + sig(share * 100, state.digits) + '%</span>';
          outputs.budget.appendChild(row);
        });
      } else {
        text('u', '未评定'); text('relative', '未评定'); text('standard', '未评定'); text('expanded', '未评定'); outputs.budget.hidden = true;
        text('uncertaintyStatus', result.uncertaintyErrors.length ? result.uncertaintyErrors.join(' ') : (result.uncertaintyMissing ? '还需填写 ' + result.uncertaintyMissing + ' 个仪器或估读误差限（无此项填 0），才会自动输出不确定度。' : '请先完成原始测量与逐差检查，再合成不确定度。'));
        outputs.uncertaintyStatus.dataset.state = result.uncertaintyErrors.length ? 'error' : 'waiting';
      }
    }
    function collect(event) {
      var target = event.target;
      if (target.dataset.field) {
        var key = target.dataset.field, raw = target.value;
        if ((event.type === 'change' || event.type === 'focusout') && scaleKeys.indexOf(key) >= 0) {
          var numeric = number(raw);
          if (numeric !== null && Number.isFinite(numeric)) {
            raw = tenthValue(numeric).toFixed(1); target.value = raw;
            if (!isTenth(numeric)) text('toast', key + ' 已按标尺记录精度 0.1 mm 修约为 ' + raw + ' mm；计算使用此显示值。');
          }
        }
        state.fields[key] = raw;
        if (errorKeys.indexOf(key) >= 0) state.errorOverrides[key] = true;
      }
      else if (target.hasAttribute('data-digits')) state.digits = target.value === '1' ? 1 : 2;
      else if (target.hasAttribute('data-method')) state.method = target.value === 'endpoint' ? 'endpoint' : 'successive';
      else if (target.dataset.pair != null) state.selected[Number(target.dataset.pair)] = target.checked;
      else return;
      editRevision++; render();
      if (event.type === 'change' && target.hasAttribute('data-digits')) save();
      else { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
    }
    function commitScaleOnBlur(event) {
      var target = event.target, key = target.dataset && target.dataset.field;
      if (scaleKeys.indexOf(key) < 0) return;
      var value = number(target.value);
      if (value === null || !Number.isFinite(value)) return;
      var formatted = tenthValue(value).toFixed(1);
      if (target.value === formatted && state.fields[key] === formatted) return;
      collect(event);
    }
    function download(content, type, filename) {
      var url = URL.createObjectURL(new Blob([content], { type: type })), a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
    function exportCSV() {
      download(exportDataCSV(state), 'text/csv;charset=utf-8;', '杨氏模量_' + (state.demo ? '演示数据' : '实验记录') + '_' + new Date().toISOString().slice(0, 10) + '.csv');
      text('toast', '已导出包含原始记录、误差限、逐差、拟合与结果的 CSV，可再次导入。');
    }
    function importFile(file) {
      if (!file) return;
      var ticket = ++importSerial, revision = editRevision;
      outputs.importStatus.hidden = false; outputs.importStatus.dataset.state = 'waiting';
      if (file.size > MAX_CSV_BYTES) { text('importStatus', '导入未应用：文件超过 128 KB。当前记录未改动。'); outputs.importStatus.dataset.state = 'error'; return; }
      text('importStatus', '正在本机检查 CSV 格式、字段和单位…');
      file.text().then(function (raw) {
        if (destroyed || ticket !== importSerial) return;
        if (revision !== editRevision) { text('importStatus', '读取期间记录已被编辑，本次导入未应用。请重新选择文件。'); outputs.importStatus.dataset.state = 'waiting'; return; }
        var parsed = parseCSV(raw);
        if (!parsed.ok) { text('importStatus', '导入未应用，当前记录未改动。' + parsed.errors.slice(0, 8).join(' ') + (parsed.errors.length > 8 ? ' 另有 ' + (parsed.errors.length - 8) + ' 项，请修正后重试。' : '')); outputs.importStatus.dataset.state = 'error'; return; }
        editRevision++; undo = normalize(state); state = parsed.state; applyState(); save();
        wrapper.querySelector('[data-action="undo"]').hidden = false;
        text('importStatus', 'CSV 检查通过，已导入 9 次直径、8 组增减载及误差限。' + parsed.warnings.join(' ') + ' 可用“恢复上一组”撤销。'); outputs.importStatus.dataset.state = 'ready';
      }).catch(function () { if (!destroyed && ticket === importSerial) { text('importStatus', '文件读取失败。请保存为 UTF-8 CSV 后重试；当前记录未改动。'); outputs.importStatus.dataset.state = 'error'; } });
    }
    function exportGraph(kind) {
      if (!lastResult.fit) return;
      var svg = graphMarkup(lastResult, state.fields, uid + '-export'), filename = '杨氏模量_标尺均值与总质量';
      if (kind === 'svg') { download(svg, 'image/svg+xml;charset=utf-8', filename + '.svg'); text('toast', '已导出自包含 SVG 图片，可用于实验报告。'); return; }
      var objectURL = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(objectURL);
        if (destroyed) return;
        var canvas = document.createElement('canvas'); canvas.width = 2880; canvas.height = 1920;
        var context = canvas.getContext('2d');
        if (!context) { text('toast', '浏览器无法创建 PNG，请使用 SVG 导出。'); return; }
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) { if (destroyed) return; if (blob) { download(blob, 'image/png', filename + '.png'); text('toast', '已导出 2880 × 1920 高清 PNG 图片。'); } else text('toast', 'PNG 导出失败，请使用 SVG 导出。'); }, 'image/png');
      };
      image.onerror = function () { URL.revokeObjectURL(objectURL); if (!destroyed) text('toast', 'PNG 导出失败，请使用 SVG 导出。'); };
      image.src = objectURL;
    }
    function rulesView(mode) {
      var view = wrapper.querySelector('[data-rules-view]'); view.dataset.rulesView = mode;
      wrapper.querySelector('[data-action="rules-fit"]').setAttribute('aria-pressed', String(mode === 'fit'));
      wrapper.querySelector('[data-action="rules-original"]').setAttribute('aria-pressed', String(mode === 'original'));
    }
    function openRules() {
      var dialog = wrapper.querySelector('.yd-rules-dialog'), img = wrapper.querySelector('[data-rules-image]');
      if (!img.getAttribute('src')) img.setAttribute('src', 'assets/significant-figures-rules.png');
      rulesView('fit');
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    function closeRules() { var dialog = wrapper.querySelector('.yd-rules-dialog'); if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
    function openDemoVerification() {
      var dialog = wrapper.querySelector('.yd-demo-dialog'), input = wrapper.querySelector('[data-demo-code]');
      wrapper.querySelector('[data-demo-form]').reset();
      wrapper.querySelector('[data-demo-error]').textContent = '';
      input.setAttribute('aria-invalid', 'false');
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
      input.focus();
    }
    function closeDemoVerification() {
      var dialog = wrapper.querySelector('.yd-demo-dialog');
      if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
      wrapper.querySelector('[data-demo-form]').reset();
      wrapper.querySelector('[data-demo-error]').textContent = '';
    }
    function loadVerifiedDemo() {
      editRevision++; undo = normalize(state); state = demoData(); applyState(); save();
      wrapper.querySelector('[data-action="undo"]').hidden = false;
      text('toast', '已载入演示数据。数值由教学模型生成，修改后仍保留演示标记；开始实测前请清空。');
    }
    function submitDemoVerification(event) {
      event.preventDefault();
      var dialog = wrapper.querySelector('.yd-demo-dialog'), input = wrapper.querySelector('[data-demo-code]');
      if (!dialog.open) return;
      var code = input.value.trim();
      if (code !== 'YSMLTEST') {
        wrapper.querySelector('[data-demo-error]').textContent = code ? '验证码不正确，请重新输入。' : '请输入验证码。';
        input.setAttribute('aria-invalid', 'true'); input.focus(); return;
      }
      closeDemoVerification(); loadVerifiedDemo();
    }
    function printCleanup() { document.body.classList.remove('yd-print-active'); }
    function click(event) {
      var button = event.target.closest('[data-action]'); if (!button || !wrapper.contains(button)) return;
      if (['clear', 'undo', 'restore-errors'].indexOf(button.dataset.action) >= 0) editRevision++;
      switch (button.dataset.action) {
        case 'demo': openDemoVerification(); break;
        case 'close-demo': closeDemoVerification(); break;
        case 'clear': undo = normalize(state); state = blankState(); applyState(); save(); text('toast', '已清空输入；可使用“恢复上一组”撤销。'); break;
        case 'undo': if (undo) { var previous = normalize(state); state = normalize(undo); undo = previous; applyState(); save(); text('toast', '已恢复上一组记录。'); } break;
        case 'template': download(csvTemplate(), 'text/csv;charset=utf-8;', '杨氏模量_数据导入模板.csv'); text('toast', '已下载模板。只填写数值列，另存为 UTF-8 CSV 后导入。'); break;
        case 'import': wrapper.querySelector('[data-csv-file]').click(); break;
        case 'svg': exportGraph('svg'); break;
        case 'png': exportGraph('png'); break;
        case 'restore-errors': undo = normalize(state); errorKeys.forEach(function (key) { state.errorOverrides[key] = false; }); applyState(); save(); text('toast', '已恢复全部课程建议值；L、D 仪器限将随测量自动更新。可用“恢复上一组”撤销。'); break;
        case 'csv': exportCSV(); break;
        case 'rules': openRules(); break;
        case 'close-rules': closeRules(); break;
        case 'rules-fit': rulesView('fit'); break;
        case 'rules-original': rulesView('original'); break;
        case 'print': document.body.classList.add('yd-print-active'); global.print(); setTimeout(printCleanup, 1000); break;
      }
      wrapper.querySelector('[data-action="undo"]').hidden = !undo;
    }
    wrapper.querySelector('[data-demo-form]').addEventListener('submit', submitDemoVerification);
    wrapper.querySelector('[data-csv-file]').addEventListener('change', function (event) { importFile(event.target.files[0]); event.target.value = ''; });
    wrapper.addEventListener('input', collect); wrapper.addEventListener('change', collect); wrapper.addEventListener('focusout', commitScaleOnBlur); wrapper.addEventListener('click', click);
    global.addEventListener('afterprint', printCleanup); applyState();
    return {
      getData: function () { return normalize(state); },
      getResult: function () { return calculate(state); },
      setData: function (data) { editRevision++; undo = normalize(state); state = normalize(data); applyState(); save(); wrapper.querySelector('[data-action="undo"]').hidden = false; },
      reset: function () { editRevision++; undo = normalize(state); state = blankState(); applyState(); save(); wrapper.querySelector('[data-action="undo"]').hidden = false; },
      destroy: function () { destroyed = true; clearTimeout(saveTimer); global.removeEventListener('afterprint', printCleanup); wrapper.remove(); }
    };
  }
  global.YoungData = { mount: mount, calculate: calculate, demoData: demoData, storageKey: STORAGE_KEY, csvTemplate: csvTemplate, exportCSV: exportDataCSV, parseCSV: parseCSV, graphSVG: function (state) { var normalized = normalize(state); return graphMarkup(calculate(normalized), normalized.fields, 'young-data-export'); }, normalize: normalize, maxCSVBytes: MAX_CSV_BYTES, formatMean: meanDisplay, formatMeasurement: roundedMeasurement, formatDifferences: function (state) { var normalized = normalize(state); return differenceDisplay(calculate(normalized), normalized.fields); }, formatFit: function (state) { var normalized = normalize(state); return fitDisplay(calculate(normalized), normalized.fields); } };
})(window);
