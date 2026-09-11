(function () {
  "use strict";

  var STORAGE_KEY = "walktoburn:profile";

  var state = {
    weightKg: 70,
    heightCm: 170,
    gender: "male",
    speedMph: 3.0,
    inclinePct: 0,
    weightUnit: "kg",
    heightUnit: "cm"
  };

  var els = {
    weight: document.getElementById("weight"),
    height: document.getElementById("height"),
    gender: document.getElementById("gender"),
    speed: document.getElementById("speed"),
    incline: document.getElementById("incline"),
    speedValue: document.getElementById("speed-value"),
    speedKph: document.getElementById("speed-kph"),
    inclineValue: document.getElementById("incline-value"),
    resultMinutes: document.getElementById("result-minutes"),
    statKcalMin: document.getElementById("stat-kcalmin"),
    statMets: document.getElementById("stat-mets"),
    statDistance: document.getElementById("stat-distance"),
    statSteps: document.getElementById("stat-steps"),
    compareChart: document.getElementById("compare-chart")
  };

  var PRESETS = [
    { label: "Slow stroll", tag: "flat", speed: 2.0, incline: 0, type: "flat" },
    { label: "Brisk walk", tag: "flat", speed: 3.5, incline: 0, type: "flat" },
    { label: "Power walk", tag: "flat", speed: 4.5, incline: 0, type: "flat" },
    { label: "Light jog", tag: "jog", speed: 5.5, incline: 0, type: "jog" },
    { label: "Easy hill", tag: "incline", speed: 2.0, incline: 6, type: "incline" },
    { label: "Steady hill", tag: "incline", speed: 2.5, incline: 10, type: "incline" },
    { label: "Steep hill", tag: "incline", speed: 2.0, incline: 15, type: "incline" }
  ];

  var MPH_TO_M_PER_MIN = 26.8224;

  function vo2MlPerKgMin(speedMph, inclinePct) {
    var speedMPerMin = speedMph * MPH_TO_M_PER_MIN;
    var grade = inclinePct / 100;
    if (speedMph < 5) {
      return 3.5 + 0.1 * speedMPerMin + 1.8 * speedMPerMin * grade;
    }
    return 3.5 + 0.2 * speedMPerMin + 0.9 * speedMPerMin * grade;
  }

  function kcalPerMin(speedMph, inclinePct, weightKg) {
    var vo2 = vo2MlPerKgMin(speedMph, inclinePct);
    return (vo2 * weightKg) / 200;
  }

  function minutesToBurn100(speedMph, inclinePct, weightKg) {
    return 100 / kcalPerMin(speedMph, inclinePct, weightKg);
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

  function setRangeFill(input) {
    var min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
    var pct = ((val - min) / (max - min)) * 100;
    input.style.setProperty("--fill", pct + "%");
  }

  function fmt(n, digits) {
    return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function render() {
    var mins = minutesToBurn100(state.speedMph, state.inclinePct, state.weightKg);
    var kcalMin = kcalPerMin(state.speedMph, state.inclinePct, state.weightKg);
    var mets = vo2MlPerKgMin(state.speedMph, state.inclinePct) / 3.5;
    var distanceMeters = state.speedMph * MPH_TO_M_PER_MIN * mins;
    var steps = distanceMeters / stepLengthMeters(state.heightCm, state.gender);

    els.speedValue.textContent = fmt(state.speedMph, 1);
    els.speedKph.textContent = "(" + fmt(state.speedMph * 1.60934, 1) + " km/h)";
    els.inclineValue.textContent = state.inclinePct;

    els.resultMinutes.textContent = mins >= 100 ? Math.round(mins) : fmt(mins, 1);
    els.statKcalMin.textContent = fmt(kcalMin, 1);
    els.statMets.textContent = fmt(mets, 1);
    els.statDistance.textContent = distanceMeters >= 1000
      ? fmt(distanceMeters / 1000, 2) + " km"
      : Math.round(distanceMeters) + " m";
    els.statSteps.textContent = Math.round(steps).toLocaleString();

    renderCompare(mins);
  }

  function renderCompare(yourMinutes) {
    var rows = PRESETS.map(function (p) {
      return {
        label: p.label,
        type: p.type,
        minutes: minutesToBurn100(p.speed, p.incline, state.weightKg),
        detail: fmt(p.speed, 1) + " mph · " + p.incline + "% incline"
      };
    });

    rows.push({
      label: "Your walk",
      type: "you",
      minutes: yourMinutes,
      detail: fmt(state.speedMph, 1) + " mph · " + state.inclinePct + "% incline",
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
        weightUnit: state.weightUnit,
        heightUnit: state.heightUnit
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
    els.weight.value = state.weightUnit === "kg"
      ? fmt(state.weightKg, 0)
      : fmt(kgToLb(state.weightKg), 0);
  }

  function syncHeightInput() {
    if (state.heightUnit === "cm") {
      els.height.type = "number";
      els.height.value = Math.round(state.heightCm);
    } else {
      var fi = cmToFtIn(state.heightCm);
      els.height.type = "text";
      els.height.value = fi.ft + "'" + fi.inch + '"';
    }
  }

  function initUnitToggles() {
    document.querySelectorAll(".unit-toggle").forEach(function (group) {
      var buttons = group.querySelectorAll(".unit-btn");
      buttons.forEach(function (btn) {
        btn.addEventListener("click", function () {
          buttons.forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          var unit = btn.dataset.unit;
          if (group.dataset.target === "weight-unit") {
            state.weightUnit = unit;
            syncWeightInput();
            els.weight.step = unit === "kg" ? "1" : "1";
          } else {
            state.heightUnit = unit;
            syncHeightInput();
          }
          saveProfile();
        });
      });
    });
  }

  function bindEvents() {
    els.weight.addEventListener("input", function () {
      var v = parseFloat(els.weight.value);
      if (isNaN(v) || v <= 0) return;
      state.weightKg = state.weightUnit === "kg" ? v : lbToKg(v);
      render();
      saveProfile();
    });

    els.height.addEventListener("input", function () {
      if (state.heightUnit === "cm") {
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
    document.querySelectorAll('[data-target="weight-unit"] .unit-btn').forEach(function (b) {
      b.classList.toggle("active", b.dataset.unit === state.weightUnit);
    });
    document.querySelectorAll('[data-target="height-unit"] .unit-btn').forEach(function (b) {
      b.classList.toggle("active", b.dataset.unit === state.heightUnit);
    });
    syncWeightInput();
    syncHeightInput();

    els.speed.value = state.speedMph;
    els.incline.value = state.inclinePct;
    setRangeFill(els.speed);
    setRangeFill(els.incline);

    initUnitToggles();
    bindEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
