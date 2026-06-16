const DB_NAME = "bp-log-db";
const DB_VERSION = 1;
const STORE = "sessions";

const els = {
  sessionTime: document.querySelector("#sessionTime"),
  entryForm: document.querySelector("#entryForm"),
  sysInput: document.querySelector("#sysInput"),
  diaInput: document.querySelector("#diaInput"),
  pulseInput: document.querySelector("#pulseInput"),
  addMeasurementBtn: document.querySelector("#addMeasurementBtn"),
  clearPendingBtn: document.querySelector("#clearPendingBtn"),
  pendingList: document.querySelector("#pendingList"),
  historyList: document.querySelector("#historyList"),
  latestAvg: document.querySelector("#latestAvg"),
  latestPulse: document.querySelector("#latestPulse"),
  monthAvg: document.querySelector("#monthAvg"),
  monthCount: document.querySelector("#monthCount"),
  highestRecent: document.querySelector("#highestRecent"),
  trendChart: document.querySelector("#trendChart"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  importInput: document.querySelector("#importInput"),
  installBtn: document.querySelector("#installBtn"),
  pendingTemplate: document.querySelector("#pendingTemplate"),
  sessionTemplate: document.querySelector("#sessionTemplate"),
};

let db;
let pending = [];
let sessions = [];
let chartRange = "14";
let deferredPrompt;

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      }
    };
  });
}

function tx(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllSessions() {
  return new Promise((resolve, reject) => {
    const request = tx().getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)));
    };
  });
}

function saveSession(session) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").put(session);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function deleteSession(id) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function clearStore() {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function nowLabel() {
  els.sessionTime.textContent = dateFmt.format(new Date());
}

function normalizeReading(sys, dia, pulse) {
  const reading = {
    sys: Number(sys),
    dia: Number(dia),
    pulse: Number(pulse),
    recordedAt: new Date().toISOString(),
  };
  if (reading.sys < 60 || reading.sys > 260) return null;
  if (reading.dia < 35 || reading.dia > 160) return null;
  if (reading.pulse < 30 || reading.pulse > 220) return null;
  return reading;
}

function addPending(reading) {
  pending.push(reading);
  renderPending();
  els.sysInput.value = "";
  els.diaInput.value = "";
  els.pulseInput.value = "";
  els.sysInput.focus();
}

function addFromFields() {
  const reading = normalizeReading(els.sysInput.value, els.diaInput.value, els.pulseInput.value);
  if (!reading) {
    pulseInvalid([els.sysInput, els.diaInput, els.pulseInput]);
    return false;
  }
  addPending(reading);
  return true;
}

function fieldsHaveData() {
  return [els.sysInput, els.diaInput, els.pulseInput].some((input) => input.value.trim());
}

function pulseInvalid(inputs) {
  inputs.forEach((input) => {
    input.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-5px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 180 }
    );
    input.focus();
  });
}

function average(readings) {
  if (!readings.length) return null;
  const total = readings.reduce(
    (acc, reading) => ({
      sys: acc.sys + reading.sys,
      dia: acc.dia + reading.dia,
      pulse: acc.pulse + reading.pulse,
    }),
    { sys: 0, dia: 0, pulse: 0 }
  );
  return {
    sys: Math.round(total.sys / readings.length),
    dia: Math.round(total.dia / readings.length),
    pulse: Math.round(total.pulse / readings.length),
  };
}

function renderPending() {
  els.pendingList.innerHTML = "";
  if (!pending.length) {
    els.pendingList.className = "pending-list empty-state";
    els.pendingList.textContent = "No measurements yet.";
    return;
  }
  els.pendingList.className = "pending-list";
  pending.forEach((reading, index) => {
    const row = els.pendingTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".reading-main").textContent = `${reading.sys}/${reading.dia}`;
    row.querySelector(".reading-pulse").textContent = `${reading.pulse} bpm`;
    row.querySelector("button").addEventListener("click", () => {
      pending.splice(index, 1);
      renderPending();
    });
    els.pendingList.append(row);
  });
}

async function submitSession(event) {
  event.preventDefault();
  if (fieldsHaveData() && !addFromFields()) return;
  if (!pending.length) return;

  const startedAt = new Date().toISOString();
  await saveSession({
    id: crypto.randomUUID(),
    startedAt,
    readings: pending.map((reading, index) => ({
      ...reading,
      recordedAt: new Date(Date.parse(startedAt) + index * 60000).toISOString(),
    })),
  });
  pending = [];
  renderPending();
  nowLabel();
  await refresh();
}

function sessionAverage(session) {
  return average(session.readings);
}

function readingsInLast(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.flatMap((session) =>
    session.readings.filter((reading) => Date.parse(reading.recordedAt || session.startedAt) >= cutoff)
  );
}

function setText(id, value) {
  els[id].textContent = value;
}

function renderStats() {
  const latest = sessions[0] ? sessionAverage(sessions[0]) : null;
  setText("latestAvg", latest ? `${latest.sys}/${latest.dia}` : "--/--");
  setText("latestPulse", latest ? `${latest.pulse} bpm` : "-- bpm");

  const recent = readingsInLast(30);
  const recentAvg = average(recent);
  setText("monthAvg", recentAvg ? `${recentAvg.sys}/${recentAvg.dia}` : "--/--");
  setText("monthCount", `${recent.length} reading${recent.length === 1 ? "" : "s"}`);

  const highest = recent.reduce((max, reading) => {
    if (!max || reading.sys > max.sys || (reading.sys === max.sys && reading.dia > max.dia)) return reading;
    return max;
  }, null);
  setText("highestRecent", highest ? `${highest.sys}/${highest.dia}` : "--/--");
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!sessions.length) {
    els.historyList.className = "history-list empty-state";
    els.historyList.textContent = "No saved sessions.";
    return;
  }

  els.historyList.className = "history-list";
  sessions.forEach((session) => {
    const card = els.sessionTemplate.content.firstElementChild.cloneNode(true);
    const avg = sessionAverage(session);
    card.querySelector("time").textContent = dateFmt.format(new Date(session.startedAt));
    card.querySelector("strong").textContent = `${avg.sys}/${avg.dia} avg · ${avg.pulse} bpm`;
    card.querySelector(".remove-session").addEventListener("click", async () => {
      if (!confirm("Delete this session?")) return;
      await deleteSession(session.id);
      await refresh();
    });

    const readings = card.querySelector(".session-readings");
    session.readings.forEach((reading) => {
      const chip = document.createElement("span");
      chip.className = "reading-chip";
      chip.innerHTML = `<strong>${reading.sys}/${reading.dia}</strong><span>${reading.pulse} bpm</span>`;
      readings.append(chip);
    });
    els.historyList.append(card);
  });
}

function chartData() {
  let rows = sessions
    .map((session) => ({ session, avg: sessionAverage(session), t: Date.parse(session.startedAt) }))
    .filter((row) => row.avg)
    .sort((a, b) => a.t - b.t);

  if (chartRange !== "all") {
    const cutoff = Date.now() - Number(chartRange) * 24 * 60 * 60 * 1000;
    rows = rows.filter((row) => row.t >= cutoff);
  }
  return rows;
}

function renderChart() {
  const canvas = els.trendChart;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(240, Math.floor(rect.height * dpr));
  ctx.scale(dpr, dpr);

  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.clearRect(0, 0, width, height);

  const rows = chartData();
  const pad = { left: 42, right: 16, top: 18, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#ddd8cc";
  ctx.lineWidth = 1;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#6a6760";

  const minY = 40;
  const maxY = 180;
  for (let value = 60; value <= 180; value += 30) {
    const y = pad.top + plotH - ((value - minY) / (maxY - minY)) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(value), 8, y + 4);
  }

  if (!rows.length) {
    ctx.fillStyle = "#6a6760";
    ctx.textAlign = "center";
    ctx.fillText("Add sessions to see your trend", width / 2, height / 2);
    return;
  }

  const xFor = (index) => pad.left + (rows.length === 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
  const yFor = (value) => pad.top + plotH - ((value - minY) / (maxY - minY)) * plotH;

  drawLine(ctx, rows.map((row, index) => [xFor(index), yFor(row.avg.sys)]), "#0f766e");
  drawLine(ctx, rows.map((row, index) => [xFor(index), yFor(row.avg.dia)]), "#6d5dfc");

  rows.forEach((row, index) => {
    const x = xFor(index);
    dot(ctx, x, yFor(row.avg.sys), "#0f766e");
    dot(ctx, x, yFor(row.avg.dia), "#6d5dfc");
    if (index === 0 || index === rows.length - 1) {
      ctx.fillStyle = "#6a6760";
      ctx.textAlign = index === 0 ? "left" : "right";
      ctx.fillText(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(row.t)), x, height - 10);
    }
  });

  legend(ctx, width);
}

function drawLine(ctx, points, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function dot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function legend(ctx, width) {
  ctx.textAlign = "right";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#0f766e";
  ctx.fillText("Sys", width - 54, 18);
  ctx.fillStyle = "#6d5dfc";
  ctx.fillText("Dia", width - 16, 18);
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  download(`bp-log-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json", JSON.stringify({ sessions }, null, 2));
}

function exportCsv() {
  const rows = [["session_id", "session_time", "reading_time", "systolic", "diastolic", "pulse"]];
  sessions.forEach((session) => {
    session.readings.forEach((reading) => {
      rows.push([session.id, session.startedAt, reading.recordedAt || session.startedAt, reading.sys, reading.dia, reading.pulse]);
    });
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  download(`bp-log-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", csv);
}

async function importJson(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data.sessions)) throw new Error("Backup file does not contain sessions.");
  await clearStore();
  for (const session of data.sessions) {
    if (!session.id || !session.startedAt || !Array.isArray(session.readings)) continue;
    await saveSession(session);
  }
  await refresh();
}

async function refresh() {
  sessions = await getAllSessions();
  renderStats();
  renderHistory();
  renderChart();
}

function wireEvents() {
  els.addMeasurementBtn.addEventListener("click", addFromFields);
  els.entryForm.addEventListener("submit", submitSession);
  els.clearPendingBtn.addEventListener("click", () => {
    pending = [];
    renderPending();
  });

  [els.sysInput, els.diaInput, els.pulseInput].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (input === els.sysInput) els.diaInput.focus();
        else if (input === els.diaInput) els.pulseInput.focus();
        else addFromFields();
      }
    });
  });

  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segmented button").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      chartRange = button.dataset.range;
      renderChart();
    });
  });

  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.exportJsonBtn.addEventListener("click", exportJson);
  els.importInput.addEventListener("change", async () => {
    const file = els.importInput.files[0];
    if (!file) return;
    try {
      await importJson(file);
    } catch (error) {
      alert(error.message);
    } finally {
      els.importInput.value = "";
    }
  });

  window.addEventListener("resize", renderChart);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.hidden = true;
  });
}

async function init() {
  nowLabel();
  setInterval(nowLabel, 30_000);
  renderPending();
  wireEvents();
  db = await openDb();
  await refresh();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init().catch((error) => {
  console.error(error);
  alert("Could not open the local database.");
});
