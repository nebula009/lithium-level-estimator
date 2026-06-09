const MS_PER_HOUR = 60 * 60 * 1000;
const LITHIUM_UNIT = "mEq/L";
const TYPICAL_HALF_LIFE = 24;
const FAST_HALF_LIFE = 18;
const SLOW_HALF_LIFE = 36;
const DOSE_INCREMENT = 50;

const formulationProfiles = {
  liquid: { label: "Liquid", absorptionHalfLife: 0.35, note: "fast absorption" },
  ir: { label: "Immediate-release", absorptionHalfLife: 1.2, note: "standard absorption" },
  er: { label: "Extended-release", absorptionHalfLife: 4.5, note: "slower absorption" }
};

const schedules = {
  qd: { label: "qD", frequency: 1 },
  qhs: { label: "qHS", frequency: 1 },
  bid: { label: "BID", frequency: 2 },
  tid: { label: "TID", frequency: 3 }
};

let activeMode = "initiation";

const elements = {
  modeButtons: [...document.querySelectorAll(".mode-button")],
  initiationInputs: document.querySelector("#initiationInputs"),
  changeInputs: document.querySelector("#changeInputs"),
  initMeasuredLevel: document.querySelector("#initMeasuredLevel"),
  initDrawTime: document.querySelector("#initDrawTime"),
  initDoseAmount: document.querySelector("#initDoseAmount"),
  initSchedule: document.querySelector("#initSchedule"),
  initFormulation: document.querySelector("#initFormulation"),
  doseRows: document.querySelector("#doseRows"),
  doseRowTemplate: document.querySelector("#doseRowTemplate"),
  addDoseButton: document.querySelector("#addDoseButton"),
  priorSteadyLevel: document.querySelector("#priorSteadyLevel"),
  oldDoseAmount: document.querySelector("#oldDoseAmount"),
  oldSchedule: document.querySelector("#oldSchedule"),
  newDoseAmount: document.querySelector("#newDoseAmount"),
  newSchedule: document.querySelector("#newSchedule"),
  targetLevel: document.querySelector("#targetLevel"),
  resetButton: document.querySelector("#resetButton"),
  assumptionBox: document.querySelector("#assumptionBox"),
  sensitivityPanel: document.querySelector(".sensitivity-panel"),
  steadyLevel: document.querySelector("#steadyLevel"),
  rangeLow: document.querySelector("#rangeLow"),
  rangeHigh: document.querySelector("#rangeHigh"),
  rangeMarker: document.querySelector("#rangeMarker"),
  rangeSummary: document.querySelector("#rangeSummary"),
  targetDose: document.querySelector("#targetDose"),
  targetDoseRaw: document.querySelector("#targetDoseRaw"),
  timingLabel: document.querySelector("#timingLabel"),
  observedTiming: document.querySelector("#observedTiming"),
  observedSummary: document.querySelector("#observedSummary"),
  formulaStrip: document.querySelector("#formulaStrip"),
  fastEstimate: document.querySelector("#fastEstimate"),
  typicalEstimate: document.querySelector("#typicalEstimate"),
  slowEstimate: document.querySelector("#slowEstimate"),
  chart: document.querySelector("#levelChart")
};

function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: value > 0 && value < 10 ? Math.min(1, maximumFractionDigits) : 0
  }).format(value);
}

function formatLevel(value) {
  return `${formatNumber(value, 2)} ${LITHIUM_UNIT}`;
}

function formatDose(value) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `${formatNumber(value, 0)} mg/day`;
}

function scheduleFor(value) {
  return schedules[value] || schedules.bid;
}

function dailyDoseFrom(amount, scheduleValue) {
  return amount * scheduleFor(scheduleValue).frequency;
}

function formatRegimen(doseAmount, scheduleValue) {
  const schedule = scheduleFor(scheduleValue);
  if (!Number.isFinite(doseAmount) || doseAmount <= 0) return "--";
  const dailyDose = doseAmount * schedule.frequency;
  return `${formatNumber(doseAmount, 0)} mg ${schedule.label} (${formatNumber(dailyDose, 0)} mg/day)`;
}

function roundedRegimenForDailyDose(rawDailyDose, scheduleValue, increment) {
  const schedule = scheduleFor(scheduleValue);
  const rawDoseAmount = rawDailyDose / schedule.frequency;
  const roundedDoseAmount = roundedDose(rawDoseAmount, increment);
  return {
    rawDoseAmount,
    roundedDoseAmount,
    roundedDailyDose: roundedDoseAmount * schedule.frequency
  };
}

function numberValue(input) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : 0;
}

function dateToLocalInput(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function localInputToDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function roundedDose(rawDose, increment) {
  if (!Number.isFinite(rawDose) || rawDose <= 0) return NaN;
  return Math.round(rawDose / Math.max(1, increment || 1)) * Math.max(1, increment || 1);
}

function decayFraction(hours, halfLife) {
  if (hours < 0 || halfLife <= 0) return NaN;
  return Math.exp((-Math.LN2 * hours) / halfLife);
}

function doseContribution({ amount, formulation }, hoursAfterDose, halfLife) {
  if (amount <= 0 || hoursAfterDose <= 0 || halfLife <= 0) return 0;
  const profile = formulationProfiles[formulation] || formulationProfiles.ir;
  const k = Math.LN2 / halfLife;
  const ka = Math.LN2 / profile.absorptionHalfLife;
  if (Math.abs(ka - k) < 0.0001) {
    return amount * k * hoursAfterDose * Math.exp(-k * hoursAfterDose);
  }
  return Math.max(0, amount * (ka / (ka - k)) * (Math.exp(-k * hoursAfterDose) - Math.exp(-ka * hoursAfterDose)));
}

function observedExposureAtTime(doses, time, halfLife, formulation) {
  return doses.reduce((sum, dose) => {
    const hoursAfterDose = (time.getTime() - dose.time.getTime()) / MS_PER_HOUR;
    return sum + doseContribution({ amount: dose.amount, formulation }, hoursAfterDose, halfLife);
  }, 0);
}

function steadyExposureForSchedule(dailyDose, frequency, formulation, halfLife) {
  if (frequency <= 0) return NaN;
  let exposure = 0;
  const interval = 24 / frequency;
  const dose = { amount: dailyDose / frequency, formulation };
  const maxLookback = Math.max(halfLife * 12, 24 * 14);
  for (let hours = 12; hours <= maxLookback; hours += interval) {
    exposure += doseContribution(dose, hours, halfLife);
  }
  return exposure;
}

function readDoses() {
  return [...elements.doseRows.querySelectorAll(".dose-row")]
    .map((row) => ({
      time: localInputToDate(row.querySelector(".dose-time").value),
      amount: numberValue(row.querySelector(".dose-amount"))
    }))
    .filter((dose) => dose.time && dose.amount > 0)
    .sort((a, b) => a.time - b.time);
}

function addDoseRow({ time, amount } = {}) {
  const fragment = elements.doseRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".dose-row");
  row.querySelector(".dose-time").value = time ? dateToLocalInput(time) : "";
  row.querySelector(".dose-amount").value = amount || "";
  row.querySelector(".remove-dose").addEventListener("click", () => {
    row.remove();
    update();
  });
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
  elements.doseRows.appendChild(fragment);
}

function clearCaseInputs() {
  elements.initDrawTime.value = "";
  elements.initMeasuredLevel.value = "";
  elements.initDoseAmount.value = "";
  elements.initSchedule.value = "bid";
  elements.initFormulation.value = "ir";
  elements.doseRows.innerHTML = "";
  addDoseRow();

  elements.priorSteadyLevel.value = "";
  elements.oldDoseAmount.value = "";
  elements.oldSchedule.value = "bid";
  elements.newDoseAmount.value = "";
  elements.newSchedule.value = "bid";

  elements.targetLevel.value = "";
  setMode(activeMode);
}

function setMode(mode) {
  activeMode = mode;
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  elements.initiationInputs.classList.toggle("hidden", mode !== "initiation");
  elements.changeInputs.classList.toggle("hidden", mode !== "change");
  update();
}

function computeInitiation(halfLife) {
  const drawTime = localInputToDate(elements.initDrawTime.value);
  const measured = numberValue(elements.initMeasuredLevel);
  const ongoingDoseAmount = numberValue(elements.initDoseAmount);
  const scheduleValue = elements.initSchedule.value;
  const frequency = scheduleFor(scheduleValue).frequency;
  const ongoingDailyDose = dailyDoseFrom(ongoingDoseAmount, scheduleValue);
  const formulation = elements.initFormulation.value;
  const doses = readDoses().filter((dose) => drawTime && dose.time < drawTime);
  const target = numberValue(elements.targetLevel);
  const observedExposure = drawTime ? observedExposureAtTime(doses, drawTime, halfLife, formulation) : NaN;
  const scale = observedExposure > 0 && measured > 0 ? measured / observedExposure : NaN;
  const steadyExposure = steadyExposureForSchedule(ongoingDailyDose, frequency, formulation, halfLife);
  const steadyLevel = scale * steadyExposure;
  const rawTargetDailyDose = ongoingDailyDose * (target / steadyLevel);
  const targetRegimen = roundedRegimenForDailyDose(rawTargetDailyDose, scheduleValue, DOSE_INCREMENT);
  const lastDose = doses.length ? doses[doses.length - 1] : null;
  const hoursSinceLastDose = drawTime && lastDose ? (drawTime - lastDose.time) / MS_PER_HOUR : NaN;
  const totalDose = doses.reduce((sum, dose) => sum + dose.amount, 0);
  const firstDose = doses[0];
  const observedWindow = firstDose && drawTime ? (drawTime - firstDose.time) / MS_PER_HOUR : NaN;

  return {
    mode: "initiation",
    halfLife,
    drawTime,
    measured,
    doses,
    formulation,
    ongoingDoseAmount,
    scheduleValue,
    ongoingDailyDose,
    frequency,
    target,
    steadyLevel,
    rawTargetDailyDose,
    targetRegimen,
    hoursSinceLastDose,
    totalDose,
    observedWindow,
    scale,
    valid:
      Boolean(drawTime) &&
      measured > 0 &&
      doses.length > 0 &&
      observedExposure > 0 &&
      ongoingDailyDose > 0 &&
      frequency > 0 &&
      target > 0 &&
      Number.isFinite(steadyLevel) &&
      steadyLevel > 0
  };
}

function computeChange(halfLife) {
  const priorLevel = numberValue(elements.priorSteadyLevel);
  const oldDoseAmount = numberValue(elements.oldDoseAmount);
  const oldScheduleValue = elements.oldSchedule.value;
  const newDoseAmount = numberValue(elements.newDoseAmount);
  const newScheduleValue = elements.newSchedule.value;
  const oldDose = dailyDoseFrom(oldDoseAmount, oldScheduleValue);
  const newDose = dailyDoseFrom(newDoseAmount, newScheduleValue);
  const target = numberValue(elements.targetLevel);
  const steadyLevel = oldDose > 0 ? priorLevel * (newDose / oldDose) : NaN;
  const rawTargetDailyDose = newDose * (target / steadyLevel);
  const targetRegimen = roundedRegimenForDailyDose(rawTargetDailyDose, newScheduleValue, DOSE_INCREMENT);

  return {
    mode: "change",
    halfLife,
    priorLevel,
    oldDoseAmount,
    oldScheduleValue,
    newDoseAmount,
    newScheduleValue,
    oldDose,
    newDose,
    target,
    steadyLevel,
    rawTargetDailyDose,
    targetRegimen,
    valid:
      priorLevel > 0 &&
      oldDoseAmount > 0 &&
      newDoseAmount > 0 &&
      oldDose > 0 &&
      newDose > 0 &&
      target > 0 &&
      Number.isFinite(steadyLevel) &&
      steadyLevel > 0
  };
}

function compute(halfLife = TYPICAL_HALF_LIFE) {
  return activeMode === "initiation" ? computeInitiation(halfLife) : computeChange(halfLife);
}

function resultRange() {
  const fast = compute(FAST_HALF_LIFE);
  const typical = compute(TYPICAL_HALF_LIFE);
  const slow = compute(SLOW_HALF_LIFE);
  const values = [fast, typical, slow].filter((result) => result.valid).map((result) => result.steadyLevel);
  return {
    fast,
    typical,
    slow,
    low: values.length ? Math.min(...values) : NaN,
    high: values.length ? Math.max(...values) : NaN
  };
}

function renderAssumptions(result) {
  if (activeMode === "initiation") {
    const profile = formulationProfiles[result.formulation] || formulationProfiles.ir;
    elements.assumptionBox.innerHTML = `
      <strong>New start model</strong><br>
      Uses the actual doses before the level and a ${profile.note} profile for ${profile.label.toLowerCase()} lithium.
      The main estimate assumes a 24 hour half-life; the range shows 18 to 36 hours.
    `;
  } else {
    elements.assumptionBox.innerHTML = `
      <strong>Dose change model</strong><br>
      Uses dose proportionality from a known prior steady-state lithium level. This works best when the prior and new regimens use comparable formulation, timing, and adherence.
    `;
  }

  if (!result.valid) {
    elements.assumptionBox.innerHTML += `<br><span class="warning">Enter the required fields above to calculate an estimate.</span>`;
  }
}

function renderResults() {
  const range = resultRange();
  const result = range.typical;
  renderAssumptions(result);

  elements.fastEstimate.textContent = range.fast.valid ? formatLevel(range.fast.steadyLevel) : "--";
  elements.typicalEstimate.textContent = result.valid ? formatLevel(result.steadyLevel) : "--";
  elements.slowEstimate.textContent = range.slow.valid ? formatLevel(range.slow.steadyLevel) : "--";
  elements.sensitivityPanel.classList.toggle("hidden", activeMode === "change");

  if (!result.valid) {
    elements.steadyLevel.textContent = "--";
    elements.rangeLow.textContent = "--";
    elements.rangeHigh.textContent = "--";
    elements.rangeMarker.style.left = "50%";
    elements.targetDose.textContent = "--";
    elements.targetDoseRaw.textContent = "--";
    elements.observedTiming.textContent = "--";
    elements.observedSummary.textContent = "Complete the inputs for this situation.";
    elements.formulaStrip.textContent = "Choose a situation and enter the few required values to estimate the steady-state lithium level.";
    drawChart(result, range);
    return;
  }

  elements.steadyLevel.textContent = formatLevel(result.steadyLevel);
  elements.rangeLow.textContent = formatLevel(range.low);
  elements.rangeHigh.textContent = formatLevel(range.high);
  const markerPercent = range.high > range.low ? ((result.steadyLevel - range.low) / (range.high - range.low)) * 100 : 50;
  elements.rangeMarker.style.left = `${Math.min(95, Math.max(5, markerPercent))}%`;
  if (activeMode === "change") {
    elements.rangeSummary.textContent = "Dose-change estimate uses proportional dosing from the prior steady level. Half-life affects time to reach the new level, not the final steady-state estimate.";
  } else {
    elements.rangeSummary.textContent = `Plausible range from ${formatLevel(range.low)} to ${formatLevel(range.high)} using half-lives from 18 to 36 hours. Main estimate uses 24 hours.`;
  }
  const recommendationSchedule = activeMode === "initiation" ? result.scheduleValue : result.newScheduleValue;
  elements.targetDose.textContent = formatRegimen(result.targetRegimen.roundedDoseAmount, recommendationSchedule);
  elements.targetDoseRaw.textContent = `Rounded to nearest ${DOSE_INCREMENT} mg; unrounded: ${formatNumber(result.targetRegimen.rawDoseAmount, 0)} mg ${scheduleFor(recommendationSchedule).label}`;

  if (activeMode === "initiation") {
    elements.timingLabel.textContent = "Blood draw timing";
    elements.observedTiming.textContent = `${formatNumber(result.hoursSinceLastDose, 1)} hours`;
    elements.observedSummary.textContent = `Time from last recorded dose to the lithium level. ${result.doses.length} doses totaling ${formatNumber(result.totalDose, 0)} mg were entered over ${formatNumber(result.observedWindow, 1)} hours; ongoing ${formatRegimen(result.ongoingDoseAmount, result.scheduleValue)}.`;
    elements.formulaStrip.innerHTML = `
      New start: the measured level calibrates this patient's response to the doses already given.
    The app then simulates the ongoing daily dose and schedule at steady state and shows a half-life range.
    `;
  } else {
    elements.timingLabel.textContent = "Regimen change";
    elements.observedTiming.textContent = `${formatRegimen(result.oldDoseAmount, result.oldScheduleValue)} to ${formatRegimen(result.newDoseAmount, result.newScheduleValue)}`;
    elements.observedSummary.textContent = `Estimated by dose ratio from prior steady level ${formatLevel(result.priorLevel)}.`;
    elements.formulaStrip.innerHTML = `
      Dose change: estimated new steady level = prior steady level x (new daily dose / prior daily dose).
      Recommended regimen = current new regimen x (desired level / estimated new steady level).
    `;
  }

  drawChart(result, range);
}

function drawAxes(ctx, width, height, yMax, xMax, showXLabels = true) {
  const pad = { left: 58, right: 28, top: 24, bottom: 44 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const toX = (x) => pad.left + (x / xMax) * plotWidth;
  const toY = (y) => pad.top + plotHeight - (y / yMax) * plotHeight;

  ctx.strokeStyle = "#d9e1ea";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5b6472";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const yValue = (yMax / 4) * i;
    const y = toY(yValue);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(formatNumber(yValue, 1), pad.left - 10, y);
  }

  if (showXLabels) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 4; i += 1) {
      const xValue = (xMax / 4) * i;
      ctx.fillText(`${formatNumber(xValue, 0)}h`, toX(xValue), height - pad.bottom + 16);
    }
  }

  return { toX, toY, pad };
}

function drawHorizontal(ctx, toY, width, pad, value, color, label) {
  if (!Number.isFinite(value) || value <= 0) return;
  const y = toY(value);
  ctx.strokeStyle = color;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y);
  ctx.lineTo(width - pad.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, pad.left + 6, y - 4);
}

function drawChart(result, range) {
  const canvas = elements.chart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!result.valid) {
    ctx.fillStyle = "#5b6472";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Complete the inputs to render the projection.", width / 2, height / 2);
    return;
  }

  if (activeMode === "change") {
    drawChangeChart(ctx, width, height, result, range);
  } else {
    drawInitiationChart(ctx, width, height, result, range);
  }
}

function drawChangeChart(ctx, width, height, result, range) {
  const xMax = 2;
  const yMax = Math.max(result.priorLevel, result.target, result.steadyLevel, range.high, 0.2) * 1.2;
  const { toX, toY, pad } = drawAxes(ctx, width, height, yMax, xMax, false);
  drawHorizontal(ctx, toY, width, pad, result.target, "#244f9e", "Target");

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(toX(0.4), toY(result.priorLevel));
  ctx.lineTo(toX(1.6), toY(result.steadyLevel));
  ctx.stroke();

  drawPoint(ctx, toX(0.4), toY(result.priorLevel), "Prior steady");
  drawPoint(ctx, toX(1.6), toY(result.steadyLevel), "New estimate");

  ctx.fillStyle = "#5b6472";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Prior regimen", toX(0.4), height - pad.bottom + 16);
  ctx.fillText("New regimen", toX(1.6), height - pad.bottom + 16);
  drawXAxisLabel(ctx, width, height, "Steady-state level estimated by dose ratio");
}

function drawInitiationChart(ctx, width, height, result, range) {
  const firstDoseTime = result.doses[0].time;
  const observedHours = Math.max(1, (result.drawTime - firstDoseTime) / MS_PER_HOUR);
  const xMax = observedHours;
  const yMax = Math.max(result.measured, result.target, result.steadyLevel, range.high, 0.2) * 1.2;
  const { toX, toY, pad } = drawAxes(ctx, width, height, yMax, xMax);
  drawHorizontal(ctx, toY, width, pad, result.target, "#244f9e", "Target");
  drawHorizontal(ctx, toY, width, pad, result.steadyLevel, "#0f766e", "Estimated steady");

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 180; i += 1) {
    const hours = (xMax / 180) * i;
    const time = new Date(firstDoseTime.getTime() + hours * MS_PER_HOUR);
    const exposure = observedExposureAtTime(result.doses, time, TYPICAL_HALF_LIFE, result.formulation);
    const level = exposure * result.scale;
    const x = toX(hours);
    const y = toY(level);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  result.doses.forEach((dose) => {
    const hours = (dose.time - firstDoseTime) / MS_PER_HOUR;
    ctx.strokeStyle = "#a54826";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toX(hours), toY(0));
    ctx.lineTo(toX(hours), toY(yMax * 0.08));
    ctx.stroke();
  });

  drawPoint(ctx, toX(observedHours), toY(result.measured), "Measured");
  drawXAxisLabel(ctx, width, height, "Hours from first recorded dose to blood draw");
}

function drawPoint(ctx, x, y, label) {
  ctx.fillStyle = "#a54826";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#17202a";
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x - 34, y - 10);
}

function drawXAxisLabel(ctx, width, height, text) {
  ctx.fillStyle = "#5b6472";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, width / 2, height - 8);
}

function update() {
  renderResults();
}

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.addDoseButton.addEventListener("click", () => {
  const draw = localInputToDate(elements.initDrawTime.value) || new Date();
  addDoseRow({ time: new Date(draw.getTime() - 12 * MS_PER_HOUR), amount: 300 });
  update();
});

elements.resetButton.addEventListener("click", clearCaseInputs);

[
  elements.initMeasuredLevel,
  elements.initDrawTime,
  elements.initDoseAmount,
  elements.initSchedule,
  elements.initFormulation,
  elements.priorSteadyLevel,
  elements.oldDoseAmount,
  elements.oldSchedule,
  elements.newDoseAmount,
  elements.newSchedule,
  elements.targetLevel
].forEach((element) => element.addEventListener("input", update));

window.setTimeout(clearCaseInputs, 0);
