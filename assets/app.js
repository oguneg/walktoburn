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
    unitSystem: detectUnitSystem()
  };

  var els = {
    unitButtons: document.querySelectorAll('[data-target="unit-system"] .unit-btn-lg'),
    modeButtons: document.querySelectorAll('[data-target="speed-mode"] .mode-btn'),
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
    speed: document.getElementById("speed"),
    speedLabel: document.getElementById("speed-label"),
    incline: document.getElementById("incline"),
    speedValue: document.getElementById("speed-value"),
    speedUnit: document.getElementById("speed-unit"),
    speedAlt: document.getElementById("speed-alt"),
    speedTickMin: document.getElementById("speed-tick-min"),
    speedTickMid: document.getElementById("speed-tick-mid"),
    speedTickMax: document.getElementById("speed-tick-max"),
    inclineValue: document.getElementById("incline-value"),
    resultMinutes: document.getElementById("result-minutes"),
    resultCaption: document.getElementById("result-caption"),
    activeWordEls: document.querySelectorAll(".active-word"),
    statKcalMin: document.getElementById("stat-kcalmin"),
    statMets: document.getElementById("stat-mets"),
    statDistance: document.getElementById("stat-distance"),
    statSteps: document.getElementById("stat-steps"),
    compareChart: document.getElementById("compare-chart")
  };

  var PRESETS = [
    { label: "Slow stroll", speed: 2.0, incline: 0, type: "flat" },
    { label: "Brisk walk", speed: 3.5, incline: 0, type: "flat" },
    { label: "Power walk", speed: 4.5, incline: 0, type: "flat" },
    { label: "Light jog", speed: 5.5, incline: 0, type: "jog" },
    { label: "Easy hill", speed: 2.0, incline: 6, type: "incline" },
    { label: "Steady hill", speed: 2.5, incline: 10, type: "incline" },
    { label: "Steep hill", speed: 2.0, incline: 15, type: "incline" }
  ];

  var SPEED_TICK_ANCHORS = [
    { mph: 1.0, word: "stroll" },
    { mph: 3.5, word: "brisk" },
    { mph: 6.0, word: "jog" }
  ];

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

  function vo2MlPerKgMin(speedMph, inclinePct) {
    var speedMPerMin = speedMph * MPH_TO_M_PER_MIN;
    var grade = inclinePct / 100;
    if (speedMph < 5) {
      return 3.5 + 0.1 * speedMPerMin + 1.8 * speedMPerMin * grade;
    }
    return 3.5 + 0.2 * speedMPerMin + 0.9 * speedMPerMin * grade;
  }

  function grossKcalPerMin(speedMph, inclinePct, weightKg) {
    var vo2 = vo2MlPerKgMin(speedMph, inclinePct);
    return (vo2 * weightKg) / 200;
  }

  // Katch-McArdle resting metabolic rate — uses lean body mass (from body fat %)
  // instead of age, so it stays accurate without asking for another field.
  function restingKcalPerDay(weightKg, bodyFatPct) {
    var leanMassKg = weightKg * (1 - bodyFatPct / 100);
    return 370 + 21.6 * leanMassKg;
  }

  function resultKcalPerMin(speedMph, inclinePct, weightKg, bodyFatPct, rmrEnabled) {
    var gross = grossKcalPerMin(speedMph, inclinePct, weightKg);
    if (!rmrEnabled) return gross;
    var resting = restingKcalPerDay(weightKg, bodyFatPct) / 1440;
    return Math.max(gross - resting, 0.1);
  }

  function minutesToBurn100(speedMph, inclinePct, weightKg, bodyFatPct, rmrEnabled) {
    return 100 / resultKcalPerMin(speedMph, inclinePct, weightKg, bodyFatPct, rmrEnabled);
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

  function updateSpeedReadout() {
    var mph = state.speedMph;
    var kph = mph * MPH_TO_KPH;
    var imperial = state.unitSystem === "imperial";

    if (state.speedMode === "speed") {
      els.speedValue.textContent = imperial ? fmt(mph, 1) : fmt(kph, 1);
      els.speedUnit.textContent = imperial ? "mph" : "km/h";
      els.speedAlt.textContent = imperial ? "(" + fmt(kph, 1) + " km/h)" : "(" + fmt(mph, 1) + " mph)";
    } else {
      els.speedValue.textContent = imperial ? paceString(mph) : paceString(kph);
      els.speedUnit.textContent = imperial ? "/mi" : "/km";
      els.speedAlt.textContent = imperial ? "(" + paceString(kph) + " /km)" : "(" + paceString(mph) + " /mi)";
    }

    els.speedLabel.textContent = state.speedMode === "speed" ? "Speed" : "Pace";

    SPEED_TICK_ANCHORS.forEach(function (anchor, i) {
      var target = [els.speedTickMin, els.speedTickMid, els.speedTickMax][i];
      var value;
      if (state.speedMode === "speed") {
        value = imperial ? fmt(anchor.mph, 1) : fmt(anchor.mph * MPH_TO_KPH, 1);
      } else {
        value = imperial ? paceString(anchor.mph) : paceString(anchor.mph * MPH_TO_KPH);
      }
      target.textContent = value + " " + anchor.word;
    });
  }

  function render() {
    var mins = minutesToBurn100(state.speedMph, state.inclinePct, state.weightKg, state.bodyFatPct, state.rmrEnabled);
    var kcalMin = resultKcalPerMin(state.speedMph, state.inclinePct, state.weightKg, state.bodyFatPct, state.rmrEnabled);
    var mets = vo2MlPerKgMin(state.speedMph, state.inclinePct) / 3.5;
    var distanceMeters = state.speedMph * MPH_TO_M_PER_MIN * mins;
    var steps = distanceMeters / stepLengthMeters(state.heightCm, state.gender);

    updateSpeedReadout();
    els.inclineValue.textContent = state.inclinePct;
    els.bodyfatValue.textContent = Math.round(state.bodyFatPct);
    els.bodyfatNote.textContent = state.bodyFatTouched ? "" : "(typical estimate)";

    var activeWord = state.rmrEnabled ? "active " : "";
    els.activeWordEls.forEach(function (el) { el.textContent = activeWord; });
    els.resultCaption.hidden = !state.rmrEnabled;

    els.resultMinutes.textContent = mins >= 100 ? Math.round(mins) : fmt(mins, 1);
    els.statKcalMin.textContent = fmt(kcalMin, 1);
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

    renderCompare(mins);
  }

  function renderCompare(yourMinutes) {
    var rows = PRESETS.map(function (p) {
      return {
        label: p.label,
        type: p.type,
        minutes: minutesToBurn100(p.speed, p.incline, state.weightKg, state.bodyFatPct, state.rmrEnabled),
        detail: speedLabel(p.speed) + " · " + p.incline + "% incline"
      };
    });

    rows.push({
      label: "Your walk",
      type: "you",
      minutes: yourMinutes,
      detail: speedLabel(state.speedMph) + " · " + state.inclinePct + "% incline",
      isYou: true
    });

    rows.sort(function (a, b) { return a.minutes - b.minutes; });

    var maxMinutes = Math.max.apply(null, rows.map(function (r) { return r.minutes; }));

    els.compareChart.innerHTML = rows.map(function (r) {
      var widthPct = Math.max(4, (r.minutes / maxMinutes) * 100);
      return (
        '<div class="compare-row' + (r.isYou ? " is-you" : "") + '">' +
          '<span class="compare-label">' + r.label + '<span class="compare-tag">' + r.detail + '</span></span>' +
          '<span class="compare-bar-track"><span class="compare-bar type-' + r.type + '" style="width:' + widthPct.toFixed(1) + '%"></span></span>' +
          '<span class="compare-time">' + fmt(r.minutes, 1) + '<span class="compare-tag">min</span></span>' +
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
        unitSystem: state.unitSystem
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
      state.speedMph = parseFloat(els.speed.value);
      setRangeFill(els.speed);
      render();
    });

    els.incline.addEventListener("input", function () {
      state.inclinePct = parseFloat(els.incline.value);
      setRangeFill(els.incline);
      render();
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
    els.speed.value = state.speedMph;
    els.incline.value = state.inclinePct;
    setRangeFill(els.bodyfat);
    setRangeFill(els.speed);
    setRangeFill(els.incline);

    initToggles();
    bindEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
