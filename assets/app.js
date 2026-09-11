(function () {
  "use strict";

  var STORAGE_KEY = "walktoburn:profile";

  var DEFAULT_BODY_FAT = { male: 20, female: 28, other: 24 };

  var state = {
    weightKg: 70,
    heightCm: 170,
    gender: "male",
    bodyFatPct: DEFAULT_BODY_FAT.male,
    bodyFatTouched: false,
    rmrEnabled: false,
    speedMph: 3.0,
    speedMode: "speed",
    inclinePct: 0,
    calorieTarget: 100,
    unitSystem: detectUnitSystem(),
    onboarded: false
  };

  var els = {
    unitButtons: document.querySelectorAll('[data-target="unit-system"] .unit-btn-lg'),
    modeButtons: document.querySelectorAll('[data-target="speed-mode"] .mode-btn'),
    calcGroup: document.getElementById("calc-group"),
    continueToCalc: document.getElementById("continue-to-calc"),
    weight: document.getElementById("weight"),
    height: document.getElementById("height"),
    gender: document.getElementById("gender"),
    weightUnitHint: document.getElementById("weight-unit-hint"),
    heightUnitHint: document.getElementById("height-unit-hint"),
    rmrToggle: document.getElementById("rmr-toggle"),
    bodyFatPanel: document.getElementById("body-fat-panel"),
    bodyfat: document.getElementById("bodyfat"),
    bodyfatValue: document.getElementById("bodyfat-value"),
    bodyfatNote: document.getElementById("bodyfat-note"),
    restingKcalHour: document.getElementById("resting-kcalhour"),
    restingKcalDay: document.getElementById("resting-kcalday"),
    speed: document.getElementById("speed"),
    speedLabel: document.getElementById("speed-label"),
    incline: document.getElementById("incline"),
    speedValue: document.getElementById("speed-value"),
    speedUnit: document.getElementById("speed-unit"),
    speedTicks: document.getElementById("speed-ticks"),
    inclineValue: document.getElementById("incline-value"),
    target: document.getElementById("target"),
    targetValue: document.getElementById("target-value"),
    resultTarget: document.getElementById("result-target"),
    resultMinutes: document.getElementById("result-minutes"),
    resultKcalH: document.getElementById("result-kcalh"),
    statMets: document.getElementById("stat-mets"),
    statDistance: document.getElementById("stat-distance"),
    statSteps: document.getElementById("stat-steps"),
    compareChart: document.getElementById("compare-chart")
  };

  var PRESETS = [
    { label: "Slow stroll", speed: 2.0, incline: 0, type: "flat" },
    { label: "Brisk walk", speed: 3.5, incline: 0, type: "flat" },
    { label: "Power walk", speed: 4.5, incline: 0, type: "flat" },
    { label: "Easy hill", speed: 2.0, incline: 6, type: "incline" },
    { label: "Steady hill", speed: 2.5, incline: 10, type: "incline" },
    { label: "Steep hill", speed: 2.0, incline: 15, type: "incline" }
  ];

  // The speed slider's native min/max switch to these clean, unit-appropriate
  // bounds whenever the unit system changes — rather than always keeping one
  // fixed mph-based range and converting it, which made the metric ticks
  // (and the slider's actual endpoints) drift away from round km/h numbers.
  // Capped at a brisk-walk ceiling (well under the walk/run gait transition)
  // since this is a walking calculator, not a running one.
  var SPEED_BOUNDS = {
    imperial: { min: 1, max: 5, ticks: [1, 2, 3, 4, 5] },
    metric: { min: 2, max: 8, ticks: [2, 3, 4, 5, 6, 7, 8] }
  };

  var MPH_TO_M_PER_MIN = 26.8224;
  var MPH_TO_KPH = 1.60934;

  function detectUnitSystem() {
    try {
      var locale = navigator.language || (navigator.languages && navigator.languages[0]) || "";
      var region = locale.split("-")[1];
      if (region === "US" || region === "GB") return "imperial";
    } catch (e) { /* navigator unavailable, fall through to default */ }
    return "metric";
  }

  // ACSM walking metabolic equation. The speed slider is capped at a brisk-
  // walk ceiling (see SPEED_BOUNDS), so this is the only formula in play —
  // no running branch, no gait-transition jump to explain.
  function vo2MlPerKgMin(speedMph, inclinePct) {
    var speedMPerMin = speedMph * MPH_TO_M_PER_MIN;
    var grade = inclinePct / 100;
    return 3.5 + 0.1 * speedMPerMin + 1.8 * speedMPerMin * grade;
  }

  // Inverse of vo2MlPerKgMin: given a speed and a target VO2, solves for the
  // incline (%) needed to hit it. Used to find "similar burn, slower pace"
  // alternatives — negative or >25% results mean that speed can't reach the
  // target within the slider's own range, so callers should discard those.
  function inclineForTargetVO2(speedMph, targetVO2) {
    var speedMPerMin = speedMph * MPH_TO_M_PER_MIN;
    var grade = (targetVO2 - 3.5 - 0.1 * speedMPerMin) / (1.8 * speedMPerMin);
    return grade * 100;
  }

  function kcalPerMin(speedMph, inclinePct, weightKg) {
    var vo2 = vo2MlPerKgMin(speedMph, inclinePct);
    return (vo2 * weightKg) / 200;
  }

  function minutesToBurnTarget(speedMph, inclinePct, weightKg, targetKcal) {
    return targetKcal / kcalPerMin(speedMph, inclinePct, weightKg);
  }

  // Katch-McArdle resting metabolic rate — uses lean body mass (from body
  // fat %) instead of age. Shown as a standalone reference figure only;
  // it never factors into the walking calculations above.
  function restingKcalPerDay(weightKg, bodyFatPct) {
    var leanMassKg = weightKg * (1 - bodyFatPct / 100);
    return 370 + 21.6 * leanMassKg;
  }

  function stepLengthMeters(heightCm, gender) {
    var coeff = gender === "male" ? 0.415 : gender === "female" ? 0.413 : 0.414;
    return (heightCm * coeff) / 100;
  }

  function lbToKg(lb) { return lb * 0.453592; }
  function kgToLb(kg) { return kg / 0.453592; }
  function cmToFtIn(cm) {
    var totalIn = cm / 2.54;
    var ft = Math.floor(totalIn / 12);
    var inch = Math.round(totalIn - ft * 12);
    if (inch === 12) { ft += 1; inch = 0; }
    return { ft: ft, inch: inch };
  }
  function ftInToCm(ft, inch) { return (ft * 12 + inch) * 2.54; }

  // Minutes-per-unit pace, formatted as "MM:SS". unitPerHour is speed in
  // whatever unit (mph or km/h) the pace should be expressed per.
  function paceString(unitPerHour) {
    var minPerUnit = 60 / unitPerHour;
    var mm = Math.floor(minPerUnit);
    var ss = Math.round((minPerUnit - mm) * 60);
    if (ss === 60) { mm += 1; ss = 0; }
    return mm + ":" + (ss < 10 ? "0" : "") + ss;
  }

  // Reveals a step-locked section with a fade-in and scrolls it into view.
  // No-ops if the section is already unlocked, so it's safe to call from
  // handlers that fire repeatedly (e.g. re-picking a unit system).
  function unlockSection(el) {
    if (!el.classList.contains("step-locked")) return;
    el.classList.remove("step-locked");
    el.classList.add("step-reveal");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setRangeFill(input) {
    var min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
    var pct = ((val - min) / (max - min)) * 100;
    input.style.setProperty("--fill", pct + "%");
  }

  function fmt(n, digits) {
    return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function speedLabel(speedMph) {
    if (state.unitSystem === "imperial") {
      return fmt(speedMph, 1) + " mph";
    }
    return fmt(speedMph * MPH_TO_KPH, 1) + " km/h";
  }

  // Rewrites the speed <input>'s min/max/step/value to the clean bounds for
  // the current unit system, converting (and clamping) the canonical mph
  // value as needed. Called on load and whenever the unit system changes —
  // never on every render, so it doesn't fight the user mid-drag.
  function syncSpeedSliderBounds() {
    var bounds = state.unitSystem === "imperial" ? SPEED_BOUNDS.imperial : SPEED_BOUNDS.metric;
    var displayVal = state.unitSystem === "imperial" ? state.speedMph : state.speedMph * MPH_TO_KPH;
    displayVal = Math.min(Math.max(displayVal, bounds.min), bounds.max);

    els.speed.min = bounds.min;
    els.speed.max = bounds.max;
    els.speed.step = "0.1";
    els.speed.value = displayVal;

    state.speedMph = state.unitSystem === "imperial" ? displayVal : displayVal / MPH_TO_KPH;
    setRangeFill(els.speed);
  }

  function updateSpeedReadout() {
    var mph = state.speedMph;
    var kph = mph * MPH_TO_KPH;
    var imperial = state.unitSystem === "imperial";

    if (state.speedMode === "speed") {
      els.speedValue.textContent = imperial ? fmt(mph, 1) : fmt(kph, 1);
      els.speedUnit.textContent = imperial ? "mph" : "km/h";
    } else {
      els.speedValue.textContent = imperial ? paceString(mph) : paceString(kph);
      els.speedUnit.textContent = imperial ? "/mi" : "/km";
    }

    els.speedLabel.textContent = state.speedMode === "speed" ? "Speed" : "Pace";

    var bounds = imperial ? SPEED_BOUNDS.imperial : SPEED_BOUNDS.metric;
    els.speedTicks.innerHTML = bounds.ticks.map(function (a) {
      var label = state.speedMode === "speed" ? fmt(a, 0) : paceString(a);
      return "<span>" + label + "</span>";
    }).join("");
  }

  function render() {
    var mins = minutesToBurnTarget(state.speedMph, state.inclinePct, state.weightKg, state.calorieTarget);
    var kcalMin = kcalPerMin(state.speedMph, state.inclinePct, state.weightKg);
    var kcalHour = kcalMin * 60;
    var mets = vo2MlPerKgMin(state.speedMph, state.inclinePct) / 3.5;
    var distanceMeters = state.speedMph * MPH_TO_M_PER_MIN * mins;
    var steps = distanceMeters / stepLengthMeters(state.heightCm, state.gender);

    updateSpeedReadout();
    els.inclineValue.textContent = state.inclinePct;

    els.targetValue.textContent = state.calorieTarget;
    els.resultTarget.textContent = state.calorieTarget;

    els.bodyfatValue.textContent = Math.round(state.bodyFatPct);
    els.bodyfatNote.textContent = state.bodyFatTouched ? "" : "(typical estimate)";
    if (state.rmrEnabled) {
      var restingDay = restingKcalPerDay(state.weightKg, state.bodyFatPct);
      els.restingKcalDay.textContent = Math.round(restingDay).toLocaleString();
      els.restingKcalHour.textContent = Math.round(restingDay / 24);
    }

    els.resultMinutes.textContent = mins >= 100 ? Math.round(mins) : fmt(mins, 1);
    els.resultKcalH.textContent = Math.round(kcalHour).toLocaleString();
    els.statMets.textContent = fmt(mets, 1);

    if (state.unitSystem === "imperial") {
      var miles = distanceMeters / 1609.34;
      els.statDistance.textContent = fmt(miles, 2) + " mi";
    } else {
      els.statDistance.textContent = distanceMeters >= 1000
        ? fmt(distanceMeters / 1000, 2) + " km"
        : Math.round(distanceMeters) + " m";
    }
    els.statSteps.textContent = Math.round(steps).toLocaleString();

    renderCompare();
  }

  // Builds a "similar burn rate, slower pace" row: takes the user's current
  // walk, slows it down by speedFactor, and solves for the incline that
  // reproduces roughly the same VO2 (and therefore roughly the same kcal/h)
  // at that slower speed. The incline is rounded to a whole percent to match
  // what the slider can actually set, so the resulting kcal/h is close to
  // but not exactly equal to the current walk's — hence "similar," not
  // "same." Returns null when the slower speed or the required incline
  // falls outside what the sliders actually support.
  function buildSimilarBurnRow(label, speedFactor) {
    var candidateSpeed = Math.round(state.speedMph * speedFactor * 10) / 10;
    if (candidateSpeed < 1) return null;

    var targetVO2 = vo2MlPerKgMin(state.speedMph, state.inclinePct);
    var inclinePct = Math.round(inclineForTargetVO2(candidateSpeed, targetVO2));
    if (inclinePct <= state.inclinePct || inclinePct > 25) return null;

    var kcalHour = kcalPerMin(candidateSpeed, inclinePct, state.weightKg) * 60;
    return {
      label: label,
      type: "incline",
      kcalHour: kcalHour,
      detail: speedLabel(candidateSpeed) + " · " + inclinePct + "% incline"
    };
  }

  function renderCompare() {
    var rows = PRESETS.map(function (p) {
      return {
        label: p.label,
        type: p.type,
        kcalHour: kcalPerMin(p.speed, p.incline, state.weightKg) * 60,
        detail: speedLabel(p.speed) + " · " + p.incline + "% incline"
      };
    });

    rows.push({
      label: "Your walk",
      type: "you",
      kcalHour: kcalPerMin(state.speedMph, state.inclinePct, state.weightKg) * 60,
      detail: speedLabel(state.speedMph) + " · " + state.inclinePct + "% incline",
      isYou: true
    });

    var slower = buildSimilarBurnRow("Similar burn, slower", 0.7);
    var muchSlower = buildSimilarBurnRow("Similar burn, much slower", 0.5);
    if (slower) rows.push(slower);
    if (muchSlower) rows.push(muchSlower);

    rows.sort(function (a, b) { return b.kcalHour - a.kcalHour; });

    var maxKcalHour = Math.max.apply(null, rows.map(function (r) { return r.kcalHour; }));

    els.compareChart.innerHTML = rows.map(function (r) {
      var widthPct = Math.max(4, (r.kcalHour / maxKcalHour) * 100);
      return (
        '<div class="compare-row' + (r.isYou ? " is-you" : "") + '">' +
          '<span class="compare-label">' + r.label + '<span class="compare-tag">' + r.detail + '</span></span>' +
          '<span class="compare-bar-track"><span class="compare-bar type-' + r.type + '" style="width:' + widthPct.toFixed(1) + '%"></span></span>' +
          '<span class="compare-rate">' + Math.round(r.kcalHour) + '<span class="compare-tag">kcal/h</span></span>' +
        '</div>'
      );
    }).join("");
  }

  function saveProfile() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        weightKg: state.weightKg,
        heightCm: state.heightCm,
        gender: state.gender,
        bodyFatPct: state.bodyFatPct,
        bodyFatTouched: state.bodyFatTouched,
        rmrEnabled: state.rmrEnabled,
        speedMode: state.speedMode,
        calorieTarget: state.calorieTarget,
        unitSystem: state.unitSystem,
        onboarded: state.onboarded
      }));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.assign(state, saved);
    } catch (e) { /* ignore malformed/unavailable storage */ }
  }

  function syncWeightInput() {
    els.weight.value = state.unitSystem === "metric"
      ? fmt(state.weightKg, 0)
      : fmt(kgToLb(state.weightKg), 0);
    els.weightUnitHint.textContent = state.unitSystem === "metric" ? "kg" : "lb";
  }

  function syncHeightInput() {
    if (state.unitSystem === "metric") {
      els.height.type = "number";
      els.height.value = Math.round(state.heightCm);
      els.heightUnitHint.textContent = "cm";
    } else {
      var fi = cmToFtIn(state.heightCm);
      els.height.type = "text";
      els.height.value = fi.ft + "'" + fi.inch + '"';
      els.heightUnitHint.textContent = "ft/in";
    }
  }

  function syncUnitButtons() {
    els.unitButtons.forEach(function (b) {
      b.classList.toggle("active", b.dataset.unit === state.unitSystem);
    });
  }

  function syncModeButtons() {
    els.modeButtons.forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === state.speedMode);
    });
  }

  function applyUnitSystem(unit) {
    state.unitSystem = unit;
    syncUnitButtons();
    syncWeightInput();
    syncHeightInput();
    syncSpeedSliderBounds();
    render();
    saveProfile();
  }

  function applySpeedMode(mode) {
    state.speedMode = mode;
    syncModeButtons();
    render();
    saveProfile();
  }

  function applyRmrEnabled(enabled) {
    state.rmrEnabled = enabled;
    els.bodyFatPanel.hidden = !enabled;
    render();
    saveProfile();
  }

  function initToggles() {
    els.unitButtons.forEach(function (btn) {
      btn.addEventListener("click", function () { applyUnitSystem(btn.dataset.unit); });
    });
    els.modeButtons.forEach(function (btn) {
      btn.addEventListener("click", function () { applySpeedMode(btn.dataset.mode); });
    });
    els.rmrToggle.addEventListener("change", function () {
      applyRmrEnabled(els.rmrToggle.checked);
    });
    els.continueToCalc.addEventListener("click", function () {
      unlockSection(els.calcGroup);
      state.onboarded = true;
      saveProfile();
    });
  }

  function bindEvents() {
    els.weight.addEventListener("input", function () {
      var v = parseFloat(els.weight.value);
      if (isNaN(v) || v <= 0) return;
      state.weightKg = state.unitSystem === "metric" ? v : lbToKg(v);
      render();
      saveProfile();
    });

    els.height.addEventListener("input", function () {
      if (state.unitSystem === "metric") {
        var v = parseFloat(els.height.value);
        if (isNaN(v) || v <= 0) return;
        state.heightCm = v;
      } else {
        var nums = els.height.value.match(/\d+(\.\d+)?/g) || [];
        var ft = parseFloat(nums[0]) || 0;
        var inch = parseFloat(nums[1]) || 0;
        state.heightCm = ftInToCm(ft, inch);
      }
      render();
      saveProfile();
    });

    els.gender.addEventListener("change", function () {
      state.gender = els.gender.value;
      if (!state.bodyFatTouched) {
        state.bodyFatPct = DEFAULT_BODY_FAT[state.gender];
        els.bodyfat.value = state.bodyFatPct;
        setRangeFill(els.bodyfat);
      }
      render();
      saveProfile();
    });

    els.bodyfat.addEventListener("input", function () {
      state.bodyFatPct = parseFloat(els.bodyfat.value);
      state.bodyFatTouched = true;
      setRangeFill(els.bodyfat);
      render();
      saveProfile();
    });

    els.speed.addEventListener("input", function () {
      var raw = parseFloat(els.speed.value);
      state.speedMph = state.unitSystem === "imperial" ? raw : raw / MPH_TO_KPH;
      setRangeFill(els.speed);
      render();
    });

    els.incline.addEventListener("input", function () {
      state.inclinePct = parseFloat(els.incline.value);
      setRangeFill(els.incline);
      render();
    });

    els.target.addEventListener("input", function () {
      state.calorieTarget = parseFloat(els.target.value);
      setRangeFill(els.target);
      render();
      saveProfile();
    });
  }

  function init() {
    loadProfile();

    els.gender.value = state.gender;
    syncUnitButtons();
    syncModeButtons();
    syncWeightInput();
    syncHeightInput();

    els.rmrToggle.checked = state.rmrEnabled;
    els.bodyFatPanel.hidden = !state.rmrEnabled;

    els.bodyfat.value = state.bodyFatPct;
    els.incline.value = state.inclinePct;
    els.target.value = state.calorieTarget;
    setRangeFill(els.bodyfat);
    setRangeFill(els.incline);
    setRangeFill(els.target);
    syncSpeedSliderBounds();

    if (state.onboarded) {
      els.calcGroup.classList.remove("step-locked");
    }

    initToggles();
    bindEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
