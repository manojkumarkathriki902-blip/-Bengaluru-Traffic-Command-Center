/**
 * ═══════════════════════════════════════════════════════
 * BENGALURU TRAFFIC COMMAND CENTER — script.js
 * Real-time traffic simulation, map, charts, and UI logic
 * ═══════════════════════════════════════════════════════
 */

'use strict';

/* ── Configuration constants ─────────────────────────── */
const CONFIG = {
  DATA_PATH:        'data/bengaluru_junctions.json',
  REFRESH_INTERVAL: 15000,          // ms between data updates
  MAP_CENTER:       [12.9716, 77.5946],
  MAP_ZOOM:         12,
  CHART_HISTORY:    10,             // data points kept in trend chart
  TOAST_DURATION:   3500,           // ms toast is visible
  ALERT_MAX:        8,              // max visible alerts
  WEATHER_UPDATE:   300000,         // 5 min weather refresh
};

/* ── Global state ─────────────────────────────────────── */
let junctionData    = [];           // raw junction definitions
let liveData        = {};           // id → live traffic object
let mapInstance     = null;
let mapMarkers      = {};           // id → Leaflet marker
let charts          = {};           // named Chart.js instances
let trendHistory    = [];           // [{time, critical, medium, clear}]
let refreshTimer    = null;
let refreshCountdown= CONFIG.REFRESH_INTERVAL / 1000;
let countdownTimer  = null;

/* ────────────────────────────────────────────────────────
   BOOT SEQUENCE
──────────────────────────────────────────────────────── */

/** Show loading overlay then boot */
document.addEventListener('DOMContentLoaded', () => {
  // Inject loading overlay
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loadingOverlay';
  overlay.innerHTML = `<div class="loading-ring"></div>
    <div class="loading-text">INITIALISING COMMAND CENTER…</div>`;
  document.body.prepend(overlay);

  startClock();
  loadJunctionData();
});

/* ────────────────────────────────────────────────────────
   DATA LOADING
──────────────────────────────────────────────────────── */

/** Fetch junction definitions from JSON then boot UI */
async function loadJunctionData() {
  try {
    const res  = await fetch(CONFIG.DATA_PATH);
    const json = await res.json();
    junctionData = json.junctions;
  } catch (err) {
    // If fetch fails (e.g. opened as file://), use inline fallback
    console.warn('Could not load JSON, using inline data:', err);
    junctionData = INLINE_JUNCTIONS;
  }
  initLiveData();
  initMap();
  initCharts();
  initWeather();
  initSearch();
  initDeployForm();
  startRefreshCycle();
  startCountdownDisplay();
  hideLoadingOverlay();
}

/** Create initial randomised live traffic data for each junction */
function initLiveData() {
  junctionData.forEach(j => {
    liveData[j.id] = generateLiveRecord(j);
  });
  updateDashboard();
  updateAlerts();
  updateAIPredictions();
}

/** Produce a single live traffic record, biased by zone/time */
function generateLiveRecord(junction) {
  const hour  = new Date().getHours();
  // Peak hours: 8-10 AM, 5-8 PM — increase congestion
  const isPeak= (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
  const isNight= hour < 6 || hour > 22;

  // Base vehicle count varies by junction type
  const typeBase = {
    Flyover: 2800, Bridge: 2600, Terminal: 2400, Junction: 1800,
    Signal: 1600, Cross: 1500, Circle: 2000, Gate: 1400,
    Toll: 2200, 'Check Post': 1300, Metro: 1200, default: 1700
  };
  const base     = typeBase[junction.type] || typeBase.default;
  const modifier = isNight ? 0.3 : isPeak ? 1.5 : 1.0;
  const vehicles = Math.round((base * modifier) * (0.6 + Math.random() * 0.8));

  const congestion = vehicles > 2400 ? 'critical'
                   : vehicles > 1400 ? 'medium'
                   : 'clear';

  const officerBase   = congestion === 'critical' ? 4 : congestion === 'medium' ? 2 : 1;
  const officers      = officerBase + Math.floor(Math.random() * 3);
  const waitTime      = congestion === 'critical' ? 8 + Math.floor(Math.random() * 15)
                      : congestion === 'medium'   ? 3 + Math.floor(Math.random() * 8)
                      : 1 + Math.floor(Math.random() * 3);

  return {
    id:          junction.id,
    name:        junction.name,
    lat:         junction.lat,
    lng:         junction.lng,
    zone:        junction.zone,
    type:        junction.type,
    vehicles,
    congestion,
    officers,
    waitTime,
    lastUpdated: new Date().toLocaleTimeString('en-IN', { hour12: false }),
  };
}

/** Slightly mutate existing record to simulate real-time change */
function updateLiveRecord(existing, junction) {
  const delta       = Math.floor((Math.random() - 0.5) * 400);
  let vehicles      = Math.max(50, existing.vehicles + delta);
  const congestion  = vehicles > 2400 ? 'critical'
                    : vehicles > 1400 ? 'medium'
                    : 'clear';
  const waitTime    = congestion === 'critical' ? 8  + Math.floor(Math.random() * 15)
                    : congestion === 'medium'   ? 3  + Math.floor(Math.random() * 8)
                    : 1 + Math.floor(Math.random() * 3);

  return { ...existing, vehicles, congestion, waitTime, lastUpdated: new Date().toLocaleTimeString('en-IN', { hour12: false }) };
}

/* ────────────────────────────────────────────────────────
   LEAFLET MAP
──────────────────────────────────────────────────────── */

function initMap() {
  mapInstance = L.map('map', {
    center: CONFIG.MAP_CENTER,
    zoom:   CONFIG.MAP_ZOOM,
    zoomControl: true,
    attributionControl: false,
  });

  // OpenStreetMap tile layer (dark styled via CSS filter)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    subdomains: ['a','b','c'],
  }).addTo(mapInstance);

  // Place all markers
  junctionData.forEach(j => placeMarker(j));
}

/** Create or update a DivIcon marker for a junction */
function placeMarker(junction) {
  const record = liveData[junction.id];
  if (!record) return;

  const icon = L.divIcon({
    className: '',
    html: `<div class="junction-marker junction-marker--${record.congestion}" title="${junction.name}"></div>`,
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
  });

  if (mapMarkers[junction.id]) {
    mapMarkers[junction.id].setIcon(icon);
    mapMarkers[junction.id].setPopupContent(buildPopupHTML(record));
  } else {
    const marker = L.marker([junction.lat, junction.lng], { icon })
      .addTo(mapInstance)
      .bindPopup(buildPopupHTML(record), { maxWidth: 280, className: 'junction-popup-wrap' });
    mapMarkers[junction.id] = marker;
  }
}

/** Build HTML string for a junction popup */
function buildPopupHTML(r) {
  const lvlClass = `junction-popup__val--${r.congestion}`;
  const lvlLabel = r.congestion.charAt(0).toUpperCase() + r.congestion.slice(1);
  return `<div class="junction-popup">
    <div class="junction-popup__name">📍 ${r.name}</div>
    <div class="junction-popup__row">
      <span class="junction-popup__key">Zone</span>
      <span class="junction-popup__val">${r.zone}</span>
    </div>
    <div class="junction-popup__row">
      <span class="junction-popup__key">Vehicle Count</span>
      <span class="junction-popup__val">${r.vehicles.toLocaleString('en-IN')}</span>
    </div>
    <div class="junction-popup__row">
      <span class="junction-popup__key">Congestion</span>
      <span class="junction-popup__val ${lvlClass}">● ${lvlLabel}</span>
    </div>
    <div class="junction-popup__row">
      <span class="junction-popup__key">Officers Deployed</span>
      <span class="junction-popup__val">👮 ${r.officers}</span>
    </div>
    <div class="junction-popup__row">
      <span class="junction-popup__key">Est. Wait Time</span>
      <span class="junction-popup__val">⏱ ${r.waitTime} min</span>
    </div>
    <div class="junction-popup__row">
      <span class="junction-popup__key">Last Updated</span>
      <span class="junction-popup__val">${r.lastUpdated}</span>
    </div>
  </div>`;
}

/** Update all map markers to reflect current liveData */
function refreshMarkers() {
  junctionData.forEach(j => placeMarker(j));
}

/* ────────────────────────────────────────────────────────
   DASHBOARD KPI CARDS
──────────────────────────────────────────────────────── */

function updateDashboard() {
  const records = Object.values(liveData);

  const critical = records.filter(r => r.congestion === 'critical').length;
  const medium   = records.filter(r => r.congestion === 'medium').length;
  const clear    = records.filter(r => r.congestion === 'clear').length;
  const officers = records.reduce((s, r) => s + r.officers, 0);
  const vehicles = records.reduce((s, r) => s + r.vehicles, 0);
  const avgWait  = Math.round(records.reduce((s, r) => s + r.waitTime, 0) / records.length);
  const total    = records.length || 1;

  setKPI('kpiCritical', critical, 'kpiCriticalBar', critical / total * 100);
  setKPI('kpiMedium',   medium,   'kpiMediumBar',   medium  / total * 100);
  setKPI('kpiClear',    clear,    'kpiClearBar',     clear   / total * 100);
  setKPI('kpiOfficers', officers, 'kpiOfficersBar',  Math.min(officers / 500 * 100, 100));
  setKPI('kpiVehicles', vehicles.toLocaleString('en-IN'), 'kpiVehiclesBar', Math.min(vehicles / 200000 * 100, 100));
  setKPI('kpiWait',     avgWait + '<span>m</span>', 'kpiWaitBar', Math.min(avgWait / 20 * 100, 100));
}

function setKPI(valueId, value, barId, pct) {
  const vEl = document.getElementById(valueId);
  const bEl = document.getElementById(barId);
  if (vEl) vEl.innerHTML = value;
  if (bEl) bEl.style.width = `${pct}%`;
}

/* ────────────────────────────────────────────────────────
   AI PREDICTION PANEL
──────────────────────────────────────────────────────── */

function updateAIPredictions() {
  const records = Object.values(liveData);

  // Find highest-vehicle non-critical junction as "about to become hotspot"
  const sorted    = [...records].sort((a, b) => b.vehicles - a.vehicles);
  const hotspot   = sorted[0];
  const confidence= Math.round(72 + Math.random() * 20);
  const trends    = ['RISING ↑', 'STABLE →', 'EASING ↓'];
  const trend     = trends[Math.floor(Math.random() * trends.length)];
  const peakMins  = Math.floor(8 + Math.random() * 22);

  document.getElementById('aiHotspot').textContent  = hotspot?.name ?? '—';
  document.getElementById('aiDeploy').textContent   = `${hotspot?.officers + 2 ?? 4} officers recommended`;
  document.getElementById('aiTrend').textContent    = trend;
  document.getElementById('aiPeak').textContent     = `~${peakMins} min`;
  document.getElementById('aiConfPct').textContent  = `${confidence}%`;
  document.getElementById('aiConfBar').style.width  = `${confidence}%`;
}

/* ────────────────────────────────────────────────────────
   WEATHER (simulated Bengaluru data)
──────────────────────────────────────────────────────── */

/** Simulates Bengaluru weather conditions — no API key required */
function initWeather() {
  updateWeather();
  setInterval(updateWeather, CONFIG.WEATHER_UPDATE);
}

function updateWeather() {
  const hour     = new Date().getHours();
  const isMonsoon= [6,7,8,9].includes(new Date().getMonth()); // Jun–Sep
  const isEvening= hour >= 14 && hour <= 20;

  const temp     = isMonsoon
    ? 22 + Math.floor(Math.random() * 6)
    : (hour < 7 || hour > 20) ? 20 + Math.floor(Math.random() * 4)
    : 27 + Math.floor(Math.random() * 8);

  const humidity = isMonsoon ? 75 + Math.floor(Math.random() * 20)
                 : 55 + Math.floor(Math.random() * 20);

  const wind     = 8 + Math.floor(Math.random() * 18);
  const rain     = isMonsoon ? (isEvening ? 60 + Math.floor(Math.random() * 35) : 30 + Math.floor(Math.random() * 40))
                 : Math.floor(Math.random() * 20);

  const vis      = rain > 70 ? (3 + Math.floor(Math.random() * 5)).toFixed(1)
                 : rain > 40 ? (6 + Math.floor(Math.random() * 4)).toFixed(1)
                 : (12 + Math.floor(Math.random() * 8)).toFixed(1);

  const icon = rain > 65 ? '🌧' : rain > 35 ? '🌦' : temp > 33 ? '☀️' : hour > 19 || hour < 6 ? '🌙' : '🌤';
  const desc = rain > 65 ? 'Heavy Rain Expected'
             : rain > 35 ? 'Possible Showers'
             : temp > 33 ? 'Hot & Sunny'
             : 'Partly Cloudy';

  setText('weatherIcon',     icon);
  setText('weatherTemp',     `${temp}°C`);
  setText('weatherDesc',     desc);
  setText('weatherHumidity', `${humidity}%`);
  setText('weatherWind',     `${wind} km/h`);
  setText('weatherRain',     `${rain}%`);
  setText('weatherVis',      `${vis} km`);
}

/* ────────────────────────────────────────────────────────
   CHART.JS CHARTS
──────────────────────────────────────────────────────── */

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600 },
  plugins: { legend: { display: false }, tooltip: { titleColor: '#00d4ff', bodyColor: '#7aaac8', backgroundColor: 'rgba(2,10,28,0.95)', borderColor: 'rgba(0,212,255,0.3)', borderWidth: 1 } },
};

function initCharts() {
  // Pre-fill trend history with 10 synthetic points
  for (let i = CONFIG.CHART_HISTORY; i > 0; i--) {
    const t = new Date(Date.now() - i * CONFIG.REFRESH_INTERVAL);
    trendHistory.push(snapshotTrend(t));
  }
  trendHistory.push(snapshotTrend(new Date()));

  buildTrendChart();
  buildVolumeChart();
  buildZoneChart();
  buildOfficerChart();
}

/** Snapshot current critical/medium/clear counts */
function snapshotTrend(date) {
  const records = Object.values(liveData);
  return {
    time:     date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    critical: records.filter(r => r.congestion === 'critical').length,
    medium:   records.filter(r => r.congestion === 'medium').length,
    clear:    records.filter(r => r.congestion === 'clear').length,
  };
}

/* Congestion Trend Line Chart */
function buildTrendChart() {
  const ctx = document.getElementById('trendChart').getContext('2d');
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels:   trendHistory.map(d => d.time),
      datasets: [
        { label: 'Critical', data: trendHistory.map(d => d.critical), borderColor: '#ff2b4a', backgroundColor: 'rgba(255,43,74,0.08)',  fill: true, tension: 0.4, pointRadius: 2 },
        { label: 'Medium',   data: trendHistory.map(d => d.medium),   borderColor: '#ffaa00', backgroundColor: 'rgba(255,170,0,0.06)',  fill: true, tension: 0.4, pointRadius: 2 },
        { label: 'Clear',    data: trendHistory.map(d => d.clear),    borderColor: '#00ff88', backgroundColor: 'rgba(0,255,136,0.05)', fill: true, tension: 0.4, pointRadius: 2 },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ticks: { color: '#3a5a7a', font: { size: 9 } }, grid: { color: 'rgba(0,212,255,0.05)' } },
        y: { ticks: { color: '#3a5a7a', font: { size: 9 } }, grid: { color: 'rgba(0,212,255,0.05)' }, beginAtZero: true },
      },
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: true, labels: { color: '#7aaac8', font: { size: 9 }, boxWidth: 10 } } },
    },
  });
}

/* Traffic Volume Bar Chart (top 8 zones) */
function buildVolumeChart() {
  const ctx = document.getElementById('volumeChart').getContext('2d');
  const {labels, data} = getZoneVolumes();
  charts.volume = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Vehicles', data, backgroundColor: labels.map((_,i) => `hsla(${185 + i * 20},100%,55%,0.5)`), borderColor: labels.map((_,i) => `hsl(${185 + i * 20},100%,65%)`), borderWidth: 1 }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ticks: { color: '#3a5a7a', font: { size: 8 } }, grid: { display: false } },
        y: { ticks: { color: '#3a5a7a', font: { size: 8 } }, grid: { color: 'rgba(0,212,255,0.05)' }, beginAtZero: true },
      },
    },
  });
}

/* Zone Distribution Doughnut */
function buildZoneChart() {
  const ctx = document.getElementById('zoneChart').getContext('2d');
  const {labels, data} = getZoneCounts();
  charts.zone = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: ['#00d4ff44','#ff2b4a44','#ffaa0044','#00ff8844','#b060ff44','#00ffee44','#ff6b3544'], borderColor: ['#00d4ff','#ff2b4a','#ffaa00','#00ff88','#b060ff','#00ffee','#ff6b35'], borderWidth: 1 }],
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '62%',
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: true, position: 'right', labels: { color: '#7aaac8', font: { size: 8 }, boxWidth: 8, padding: 6 } } },
    },
  });
}

/* Officer Deployment Horizontal Bar */
function buildOfficerChart() {
  const ctx = document.getElementById('officerChart').getContext('2d');
  const zones = getUniqueZones();
  const data  = zones.map(z => Object.values(liveData).filter(r => r.zone === z).reduce((s,r) => s + r.officers, 0));
  charts.officer = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: zones,
      datasets: [{ label: 'Officers', data, backgroundColor: 'rgba(0,212,255,0.3)', borderColor: '#00d4ff', borderWidth: 1 }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: '#3a5a7a', font: { size: 8 } }, grid: { color: 'rgba(0,212,255,0.05)' }, beginAtZero: true },
        y: { ticks: { color: '#7aaac8', font: { size: 8 } }, grid: { display: false } },
      },
    },
  });
}

/* Chart update helpers */
function updateCharts() {
  // Trend chart: push new snapshot, trim old
  const snap = snapshotTrend(new Date());
  trendHistory.push(snap);
  if (trendHistory.length > CONFIG.CHART_HISTORY + 1) trendHistory.shift();

  if (charts.trend) {
    charts.trend.data.labels = trendHistory.map(d => d.time);
    charts.trend.data.datasets[0].data = trendHistory.map(d => d.critical);
    charts.trend.data.datasets[1].data = trendHistory.map(d => d.medium);
    charts.trend.data.datasets[2].data = trendHistory.map(d => d.clear);
    charts.trend.update();
  }

  if (charts.volume) {
    const {labels, data} = getZoneVolumes();
    charts.volume.data.labels = labels;
    charts.volume.data.datasets[0].data = data;
    charts.volume.update();
  }

  if (charts.zone) {
    const {data} = getZoneCounts();
    charts.zone.data.datasets[0].data = data;
    charts.zone.update();
  }

  if (charts.officer) {
    const zones = getUniqueZones();
    charts.officer.data.datasets[0].data = zones.map(z =>
      Object.values(liveData).filter(r => r.zone === z).reduce((s,r) => s + r.officers, 0));
    charts.officer.update();
  }
}

/* Data aggregation helpers */
function getUniqueZones() {
  return [...new Set(Object.values(liveData).map(r => r.zone))].sort();
}
function getZoneVolumes() {
  const zones   = getUniqueZones();
  const volumes = zones.map(z => Object.values(liveData).filter(r => r.zone === z).reduce((s,r) => s + r.vehicles, 0));
  return { labels: zones, data: volumes };
}
function getZoneCounts() {
  const zones = getUniqueZones();
  const data  = zones.map(z => Object.values(liveData).filter(r => r.zone === z).length);
  return { labels: zones, data };
}

/* ────────────────────────────────────────────────────────
   LIVE ALERTS
──────────────────────────────────────────────────────── */

const ALERT_TEMPLATES = [
  { type: 'critical', icon: '🔴', titleFn: r => `Critical congestion: ${r.name}`,          metaFn: r => `${r.vehicles.toLocaleString('en-IN')} vehicles · ${r.waitTime} min wait` },
  { type: 'accident', icon: '🚨', titleFn: r => `Accident reported near ${r.name}`,         metaFn: r => `Officers en route · Zone: ${r.zone}` },
  { type: 'weather',  icon: '🌧', titleFn: r => `Heavy rain affecting ${r.zone} zone`,      metaFn: r => `Reduced visibility · Drive carefully near ${r.name}` },
  { type: 'closure',  icon: '🚧', titleFn: r => `Road restriction near ${r.name}`,          metaFn: r => `Diversion in effect · Check alternate routes` },
  { type: 'clear',    icon: '✅', titleFn: r => `Traffic easing at ${r.name}`,              metaFn: r => `Now ${r.vehicles.toLocaleString('en-IN')} vehicles · All clear` },
];

function updateAlerts() {
  const records   = Object.values(liveData);
  const critical  = records.filter(r => r.congestion === 'critical');
  const clear     = records.filter(r => r.congestion === 'clear');

  const pool = [
    ...critical.slice(0, 3).map(r => ({ ...ALERT_TEMPLATES[0], record: r })),
    ...critical.slice(0, 1).map(r => ({ ...ALERT_TEMPLATES[1], record: r })),
    { ...ALERT_TEMPLATES[2], record: records[Math.floor(Math.random() * records.length)] },
    ...critical.slice(1, 2).map(r => ({ ...ALERT_TEMPLATES[3], record: r })),
    ...clear.slice(0, 2).map(r => ({ ...ALERT_TEMPLATES[4], record: r })),
  ].slice(0, CONFIG.ALERT_MAX);

  const list = document.getElementById('alertsList');
  if (!list) return;
  list.innerHTML = pool.map(a => `
    <div class="alert-item alert-item--${a.type}">
      <span class="alert-item__icon">${a.icon}</span>
      <div class="alert-item__body">
        <div class="alert-item__title">${a.titleFn(a.record)}</div>
        <div class="alert-item__meta">${a.metaFn(a.record)}</div>
      </div>
    </div>`).join('');

  updateTickerAlerts(pool);
}

/** Rebuild ticker with latest alerts */
function updateTickerAlerts(pool) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const classMap = { critical: 'ticker-item--critical', accident: 'ticker-item--critical', weather: 'ticker-item--info', closure: 'ticker-item--warn', clear: 'ticker-item--ok' };
  const icons    = { critical: '●', accident: '🚨', weather: 'ℹ', closure: '▲', clear: '✔' };
  // Double the items for seamless scroll
  const items = [...pool, ...pool].map(a =>
    `<span class="ticker-item ${classMap[a.type]}">${icons[a.type]} ${a.titleFn(a.record)}</span>`
  ).join('');
  track.innerHTML = items;
}

/* ────────────────────────────────────────────────────────
   SEARCH
──────────────────────────────────────────────────────── */

function initSearch() {
  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.classList.remove('open'); return; }

    const matches = junctionData.filter(j => j.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { dropdown.classList.remove('open'); return; }

    dropdown.innerHTML = matches.map(j => {
      const r   = liveData[j.id];
      const dot = r?.congestion === 'critical' ? '🔴' : r?.congestion === 'medium' ? '🟡' : '🟢';
      return `<div class="search-item" data-id="${j.id}">${dot} ${j.name}<span>${j.zone}</span></div>`;
    }).join('');
    dropdown.classList.add('open');
  });

  dropdown.addEventListener('click', e => {
    const item = e.target.closest('.search-item');
    if (!item) return;
    const id = parseInt(item.dataset.id);
    zoomToJunction(id);
    dropdown.classList.remove('open');
    input.value = '';
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('open');
  });
}

function zoomToJunction(id) {
  const j = junctionData.find(j => j.id === id);
  if (!j || !mapInstance) return;
  mapInstance.setView([j.lat, j.lng], 16, { animate: true, duration: 0.8 });
  if (mapMarkers[id]) {
    mapMarkers[id].openPopup();
  }
}

/* ────────────────────────────────────────────────────────
   OFFICER DEPLOYMENT FORM
──────────────────────────────────────────────────────── */

function initDeployForm() {
  const select = document.getElementById('deployJunction');
  if (!select) return;

  // Populate junction dropdown
  junctionData.forEach(j => {
    const opt = document.createElement('option');
    opt.value = j.id;
    opt.textContent = j.name;
    select.appendChild(opt);
  });

  // Stepper buttons
  document.getElementById('stepperMinus')?.addEventListener('click', () => {
    const inp = document.getElementById('deployCount');
    inp.value = Math.max(1, parseInt(inp.value) - 1);
  });
  document.getElementById('stepperPlus')?.addEventListener('click', () => {
    const inp = document.getElementById('deployCount');
    inp.value = Math.min(20, parseInt(inp.value) + 1);
  });

  // Deploy button
  document.getElementById('deployBtn')?.addEventListener('click', () => {
    const id    = parseInt(document.getElementById('deployJunction').value);
    const count = parseInt(document.getElementById('deployCount').value);
    const level = document.getElementById('deployLevel').value;

    if (!liveData[id]) return;

    // Apply deployment
    liveData[id].officers   += count;
    liveData[id].congestion  = level;
    // If deploying, wait time improves
    liveData[id].waitTime    = level === 'critical' ? Math.max(5, liveData[id].waitTime - 3)
                             : level === 'medium'   ? Math.max(2, liveData[id].waitTime - 2)
                             : Math.max(1, liveData[id].waitTime - 4);

    const jName = junctionData.find(j => j.id === id)?.name ?? 'Junction';
    showToast(`✅ ${count} officer${count > 1 ? 's' : ''} deployed to ${jName}`);

    // Refresh visuals
    placeMarker(junctionData.find(j => j.id === id));
    updateDashboard();
    updateCharts();
  });
}

/* ────────────────────────────────────────────────────────
   CLOCK
──────────────────────────────────────────────────────── */

function startClock() {
  function tick() {
    const now  = new Date();
    const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
    const date = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    setText('clockTime', time);
    setText('clockDate', date);
  }
  tick();
  setInterval(tick, 1000);
}

/* ────────────────────────────────────────────────────────
   REFRESH CYCLE
──────────────────────────────────────────────────────── */

function startRefreshCycle() {
  refreshTimer = setInterval(runRefresh, CONFIG.REFRESH_INTERVAL);
}

function startCountdownDisplay() {
  refreshCountdown = CONFIG.REFRESH_INTERVAL / 1000;
  countdownTimer = setInterval(() => {
    refreshCountdown--;
    if (refreshCountdown < 0) refreshCountdown = CONFIG.REFRESH_INTERVAL / 1000;
    const pill = document.getElementById('updatePill');
    if (pill) pill.textContent = `REFRESH: ${refreshCountdown}s`;
  }, 1000);
}

/** Main refresh: mutate live data, update all UI components */
function runRefresh() {
  // Update all junction records
  junctionData.forEach(j => {
    liveData[j.id] = updateLiveRecord(liveData[j.id], j);
  });

  refreshMarkers();
  updateDashboard();
  updateCharts();
  updateAlerts();
  updateAIPredictions();
  refreshCountdown = CONFIG.REFRESH_INTERVAL / 1000;
}

/* ────────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────── */

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), CONFIG.TOAST_DURATION);
}

/* ────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────── */

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.6s ease';
    setTimeout(() => overlay.classList.add('hidden'), 600);
  }
}

/* ────────────────────────────────────────────────────────
   INLINE FALLBACK DATA
   Used when running as file:// without a local server
──────────────────────────────────────────────────────── */
const INLINE_JUNCTIONS = [
  { id: 1,  name: "Hebbal Flyover Junction",         lat: 13.0358, lng: 77.5970, zone: "North",      type: "Flyover"   },
  { id: 2,  name: "Yelahanka Cross",                 lat: 13.1007, lng: 77.5963, zone: "North",      type: "Cross"     },
  { id: 3,  name: "Nagawara Circle",                 lat: 13.0456, lng: 77.6206, zone: "North",      type: "Circle"    },
  { id: 4,  name: "Thanisandra Main Road",           lat: 13.0569, lng: 77.6268, zone: "North",      type: "Junction"  },
  { id: 5,  name: "Jakkur Aerodrome Road",           lat: 13.0726, lng: 77.5987, zone: "North",      type: "Junction"  },
  { id: 6,  name: "Hennur Road Junction",            lat: 13.0514, lng: 77.6381, zone: "North",      type: "Junction"  },
  { id: 7,  name: "RT Nagar Main Junction",          lat: 13.0204, lng: 77.5962, zone: "North",      type: "Junction"  },
  { id: 8,  name: "Sahakar Nagar Circle",            lat: 13.0403, lng: 77.5894, zone: "North",      type: "Circle"    },
  { id: 9,  name: "Manyata Tech Park Gate",          lat: 13.0474, lng: 77.6200, zone: "North",      type: "Gate"      },
  { id: 10, name: "Bellary Road & ORR Junction",     lat: 13.0480, lng: 77.5930, zone: "North",      type: "Junction"  },
  { id: 11, name: "Whitefield Main Road",            lat: 12.9698, lng: 77.7499, zone: "East",       type: "Junction"  },
  { id: 12, name: "KR Puram Bridge",                 lat: 13.0071, lng: 77.6943, zone: "East",       type: "Bridge"    },
  { id: 13, name: "Marathahalli Bridge Junction",    lat: 12.9591, lng: 77.7000, zone: "East",       type: "Bridge"    },
  { id: 14, name: "Bellandur Lake Road",             lat: 12.9268, lng: 77.6784, zone: "East",       type: "Junction"  },
  { id: 15, name: "Sarjapur Road & ORR Junction",    lat: 12.9121, lng: 77.6873, zone: "East",       type: "Junction"  },
  { id: 16, name: "Brookefield Signal",              lat: 12.9682, lng: 77.7162, zone: "East",       type: "Signal"    },
  { id: 17, name: "Mahadevapura Junction",           lat: 12.9944, lng: 77.7008, zone: "East",       type: "Junction"  },
  { id: 18, name: "Varthur Road Cross",              lat: 12.9404, lng: 77.7373, zone: "East",       type: "Cross"     },
  { id: 19, name: "ITPL Main Gate",                  lat: 12.9879, lng: 77.7479, zone: "East",       type: "Gate"      },
  { id: 20, name: "Hoskote Junction",                lat: 13.0703, lng: 77.7986, zone: "East",       type: "Junction"  },
  { id: 21, name: "HSR Layout BDA Complex",          lat: 12.9116, lng: 77.6473, zone: "South East", type: "Junction"  },
  { id: 22, name: "Koramangala 5th Block",           lat: 12.9352, lng: 77.6245, zone: "South East", type: "Junction"  },
  { id: 23, name: "BTM Layout 2nd Stage",            lat: 12.9166, lng: 77.6101, zone: "South",      type: "Junction"  },
  { id: 24, name: "Electronic City Phase 1",         lat: 12.8452, lng: 77.6602, zone: "South",      type: "Junction"  },
  { id: 25, name: "JP Nagar 2nd Phase",              lat: 12.9063, lng: 77.5850, zone: "South",      type: "Junction"  },
  { id: 26, name: "Banashankari Temple Road",        lat: 12.9259, lng: 77.5463, zone: "South West",  type: "Junction"  },
  { id: 27, name: "Jayanagar 4th Block",             lat: 12.9250, lng: 77.5938, zone: "South",      type: "Junction"  },
  { id: 28, name: "Basavanagudi Circle",             lat: 12.9418, lng: 77.5733, zone: "South",      type: "Circle"    },
  { id: 29, name: "Rajajinagar 3rd Block",           lat: 12.9929, lng: 77.5501, zone: "West",       type: "Junction"  },
  { id: 30, name: "Malleshwaram 18th Cross",         lat: 13.0031, lng: 77.5689, zone: "North West",  type: "Junction"  },
  { id: 31, name: "Yeshwanthpur Junction",           lat: 13.0236, lng: 77.5435, zone: "North West",  type: "Junction"  },
  { id: 32, name: "Peenya Industrial Area",          lat: 13.0289, lng: 77.5132, zone: "West",        type: "Junction"  },
  { id: 33, name: "Kengeri Satellite Town",          lat: 12.9074, lng: 77.4837, zone: "West",        type: "Junction"  },
  { id: 34, name: "Vijayanagar Main Road",           lat: 12.9719, lng: 77.5262, zone: "West",        type: "Junction"  },
  { id: 35, name: "Nagarbhavi Circle",               lat: 12.9591, lng: 77.5076, zone: "West",        type: "Circle"    },
  { id: 36, name: "Majestic Bus Terminal",           lat: 12.9775, lng: 77.5714, zone: "Central",    type: "Terminal"  },
  { id: 37, name: "MG Road Signal",                  lat: 12.9756, lng: 77.6097, zone: "Central",    type: "Signal"    },
  { id: 38, name: "Brigade Road Junction",           lat: 12.9729, lng: 77.6078, zone: "Central",    type: "Junction"  },
  { id: 39, name: "Commercial Street Circle",        lat: 12.9810, lng: 77.6073, zone: "Central",    type: "Circle"    },
  { id: 40, name: "Shivajinagar Bus Stand",          lat: 12.9842, lng: 77.6003, zone: "Central",    type: "Junction"  },
  { id: 41, name: "Cubbon Park Signal",              lat: 12.9763, lng: 77.5929, zone: "Central",    type: "Signal"    },
  { id: 42, name: "Lalbagh West Gate",               lat: 12.9497, lng: 77.5846, zone: "Central",    type: "Gate"      },
  { id: 43, name: "Vidhana Soudha Junction",         lat: 12.9794, lng: 77.5908, zone: "Central",    type: "Junction"  },
  { id: 44, name: "Richmond Town Circle",            lat: 12.9629, lng: 77.6033, zone: "Central",    type: "Circle"    },
  { id: 45, name: "Frazer Town Cross",               lat: 12.9881, lng: 77.6164, zone: "Central",    type: "Cross"     },
  { id: 46, name: "Indiranagar 100ft Road",          lat: 12.9784, lng: 77.6408, zone: "Central",    type: "Junction"  },
  { id: 47, name: "Domlur Flyover",                  lat: 12.9594, lng: 77.6380, zone: "Central",    type: "Flyover"   },
  { id: 48, name: "Ulsoor Lake Junction",            lat: 12.9847, lng: 77.6218, zone: "Central",    type: "Junction"  },
  { id: 49, name: "Cox Town Signal",                 lat: 13.0007, lng: 77.6199, zone: "Central",    type: "Signal"    },
  { id: 50, name: "Chickpet Market Junction",        lat: 12.9692, lng: 77.5770, zone: "Central",    type: "Junction"  },
  { id: 51, name: "KR Market Circle",                lat: 12.9629, lng: 77.5731, zone: "Central",    type: "Circle"    },
  { id: 52, name: "Airport Road HAL Junction",       lat: 12.9601, lng: 77.6559, zone: "East",       type: "Junction"  },
  { id: 53, name: "Devanahalli Toll Plaza",          lat: 13.2420, lng: 77.7138, zone: "North",      type: "Toll"      },
  { id: 54, name: "Silk Board Junction",             lat: 12.9174, lng: 77.6228, zone: "South",      type: "Junction"  },
  { id: 55, name: "Madiwala Check Post",             lat: 12.9239, lng: 77.6175, zone: "South",      type: "Check Post"},
  { id: 56, name: "Bommanahalli Signal",             lat: 12.8990, lng: 77.6396, zone: "South",      type: "Signal"    },
  { id: 57, name: "Chandapura Circle",               lat: 12.8293, lng: 77.6618, zone: "South",      type: "Circle"    },
  { id: 58, name: "Attibele Border Check",           lat: 12.7786, lng: 77.7645, zone: "South",      type: "Check Post"},
  { id: 59, name: "Anekal Town Junction",            lat: 12.7114, lng: 77.6963, zone: "South",      type: "Junction"  },
  { id: 60, name: "Hosur Road Flyover",              lat: 12.8783, lng: 77.6415, zone: "South",      type: "Flyover"   },
  { id: 61, name: "Begur Road Junction",             lat: 12.8847, lng: 77.6088, zone: "South",      type: "Junction"  },
  { id: 62, name: "Gottigere Signal",                lat: 12.8629, lng: 77.5957, zone: "South",      type: "Signal"    },
  { id: 63, name: "Bannerghatta Main Rd Junction",   lat: 12.8982, lng: 77.5953, zone: "South",      type: "Junction"  },
  { id: 64, name: "Uttarahalli Cross",               lat: 12.9001, lng: 77.5362, zone: "South West",  type: "Cross"     },
  { id: 65, name: "Padmanabhanagar Circle",          lat: 12.9180, lng: 77.5360, zone: "South West",  type: "Circle"    },
  { id: 66, name: "Mysore Road Toll",                lat: 12.9467, lng: 77.4812, zone: "West",        type: "Toll"      },
  { id: 67, name: "Bidadi Industrial Junction",      lat: 12.8008, lng: 77.3914, zone: "West",        type: "Junction"  },
  { id: 68, name: "Nelamangala Town Circle",         lat: 13.1014, lng: 77.3877, zone: "North West",  type: "Circle"    },
  { id: 69, name: "Tumkur Road NH-4 Junction",       lat: 13.0608, lng: 77.5017, zone: "North West",  type: "Junction"  },
  { id: 70, name: "Dasarahalli Main Cross",          lat: 13.0337, lng: 77.5109, zone: "North West",  type: "Cross"     },
  { id: 71, name: "Chikkabanavara Signal",           lat: 13.0718, lng: 77.4918, zone: "North West",  type: "Signal"    },
  { id: 72, name: "Magadi Road Junction",            lat: 12.9819, lng: 77.5353, zone: "West",        type: "Junction"  },
  { id: 73, name: "Nayandahalli Circle",             lat: 12.9614, lng: 77.5284, zone: "West",        type: "Circle"    },
  { id: 74, name: "Rajarajeshwari Nagar Cross",      lat: 12.9314, lng: 77.5104, zone: "West",        type: "Cross"     },
  { id: 75, name: "Talaghattapura Signal",           lat: 12.8897, lng: 77.5074, zone: "South West",  type: "Signal"    },
  { id: 76, name: "Hessarghatta Main Road",          lat: 13.0921, lng: 77.5248, zone: "North West",  type: "Junction"  },
  { id: 77, name: "Vidyaranyapura Cross",            lat: 13.0638, lng: 77.5459, zone: "North",       type: "Cross"     },
  { id: 78, name: "Mathikere Junction",              lat: 13.0238, lng: 77.5602, zone: "North West",  type: "Junction"  },
  { id: 79, name: "Sanjaynagar 4th Block",           lat: 13.0127, lng: 77.5727, zone: "North",       type: "Junction"  },
  { id: 80, name: "BEL Circle",                      lat: 13.0354, lng: 77.5757, zone: "North",       type: "Circle"    },
  { id: 81, name: "Jalahalli Cross",                 lat: 13.0433, lng: 77.5374, zone: "North West",  type: "Cross"     },
  { id: 82, name: "MS Ramaiah Hospital Junction",    lat: 13.0123, lng: 77.5589, zone: "North",       type: "Junction"  },
  { id: 83, name: "Palace Grounds Gate",             lat: 13.0021, lng: 77.5836, zone: "North",       type: "Gate"      },
  { id: 84, name: "Mekhri Circle",                   lat: 13.0028, lng: 77.5921, zone: "North",       type: "Circle"    },
  { id: 85, name: "Sadashivanagar Circle",           lat: 13.0074, lng: 77.5841, zone: "North",       type: "Circle"    },
  { id: 86, name: "Windsor Manor Signal",            lat: 12.9936, lng: 77.5928, zone: "Central",     type: "Signal"    },
  { id: 87, name: "Seshadripuram Junction",          lat: 12.9944, lng: 77.5757, zone: "Central",     type: "Junction"  },
  { id: 88, name: "Srirampura Cross",                lat: 12.9993, lng: 77.5644, zone: "West",        type: "Cross"     },
  { id: 89, name: "Goraguntepalya Junction",         lat: 13.0185, lng: 77.5375, zone: "North West",  type: "Junction"  },
  { id: 90, name: "Namma Metro Baiyappanahalli",     lat: 12.9897, lng: 77.6545, zone: "East",        type: "Metro"     },
  { id: 91, name: "HAL Airport Old Road",            lat: 12.9491, lng: 77.6679, zone: "East",        type: "Junction"  },
  { id: 92, name: "Murugeshpalya Signal",            lat: 12.9617, lng: 77.6483, zone: "East",        type: "Signal"    },
  { id: 93, name: "Ejipura Junction",                lat: 12.9484, lng: 77.6277, zone: "Central",     type: "Junction"  },
  { id: 94, name: "Dairy Circle",                    lat: 12.9395, lng: 77.6140, zone: "South",       type: "Circle"    },
  { id: 95, name: "Langford Road Cross",             lat: 12.9568, lng: 77.5956, zone: "Central",     type: "Cross"     },
  { id: 96, name: "Shanthinagar Bus Stand",          lat: 12.9592, lng: 77.5866, zone: "Central",     type: "Junction"  },
  { id: 97, name: "KH Road Junction",                lat: 12.9558, lng: 77.5980, zone: "Central",     type: "Junction"  },
  { id: 98, name: "Namma Metro Jayanagar",           lat: 12.9253, lng: 77.5883, zone: "South",       type: "Metro"     },
  { id: 99, name: "Outer Ring Road Hebbal",          lat: 13.0444, lng: 77.6022, zone: "North",       type: "Junction"  },
  { id: 100,name: "Electronic City Flyover",         lat: 12.8391, lng: 77.6774, zone: "South",       type: "Flyover"   },
];
