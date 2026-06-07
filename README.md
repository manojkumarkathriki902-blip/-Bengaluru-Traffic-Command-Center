# 🚦 Bengaluru Traffic Command Center

A fully client-side, real-time traffic monitoring dashboard for Bengaluru, Karnataka — built with HTML5, CSS3, Vanilla JavaScript, Leaflet.js, and Chart.js. Ready for GitHub Pages deployment with zero backend required.

![Dark Cyberpunk Dashboard](https://img.shields.io/badge/Theme-Dark%20Cyberpunk-00d4ff?style=flat-square) ![100 Junctions](https://img.shields.io/badge/Junctions-100-ff2b4a?style=flat-square) ![Leaflet.js](https://img.shields.io/badge/Map-Leaflet.js-00ff88?style=flat-square) ![No Backend](https://img.shields.io/badge/Backend-None-ffaa00?style=flat-square)

---

## ✨ Features

| Feature | Details |
|---|---|
| 🗺 Interactive Map | Leaflet.js + OpenStreetMap, centred on Bengaluru (12.9716°N, 77.5946°E) |
| 📍 100 Junctions | Real lat/lng coordinates across all city zones |
| 🔴🟡🟢 Live Heat Map | Critical / Medium / Clear colour-coded markers |
| 📊 4 Charts | Trend (line), Volume (bar), Zone Distribution (doughnut), Officer Deployment (horizontal bar) |
| 🤖 AI Predictions | Confidence %, next hotspot, deployment recommendation, trend |
| 🌤 Weather Panel | Simulated Bengaluru weather (monsoon-aware, time-of-day aware) |
| ⏱ Live Clock | IST real-time clock, auto-updates every second |
| ⚡ Alert Ticker | Scrolling ticker + live alert log (critical, accident, weather, closure, clear) |
| 👮 Officer Deployment | Select junction, set count & congestion level, deploy with toast confirmation |
| 🔍 Junction Search | Fuzzy search with dropdown + auto-zoom to junction |
| 🔄 Auto-Refresh | All data refreshes every 15 seconds with smooth animation |
| 📱 Responsive | Desktop → Tablet → Mobile breakpoints |

---

## 🚀 Quick Start

### Option A — GitHub Pages (Recommended)

1. Fork / clone this repo
2. Push to your GitHub account
3. Go to **Settings → Pages → Source → Deploy from `main` branch `/root`**
4. Your dashboard is live at `https://<username>.github.io/Bengaluru-Traffic-Command-Center/`

### Option B — Local with a dev server

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code: install "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8080` in your browser.

> ⚠️ **Do NOT open `index.html` directly** as `file://` — the JSON fetch will fail (CORS). Use a local server or the inline fallback activates automatically.

---

## 📁 Project Structure

```
Bengaluru-Traffic-Command-Center/
├── index.html                  # App shell, semantic HTML5
├── style.css                   # Dark cyberpunk theme, glassmorphism
├── script.js                   # All logic: map, charts, simulation, UI
├── data/
│   └── bengaluru_junctions.json  # 100 junction definitions
└── README.md
```

---

## 🗂 Junction Zones

| Zone | Junctions |
|---|---|
| Central | MG Road, Brigade Road, Majestic, Indiranagar, Cubbon Park, Lalbagh, Vidhana Soudha… |
| North | Hebbal, Yelahanka, Nagawara, Thanisandra, Manyata Tech Park, BEL Circle… |
| East | Whitefield, KR Puram, Marathahalli, Bellandur, ITPL, Mahadevapura… |
| South | Electronic City, Silk Board, JP Nagar, BTM Layout, Koramangala, Bannerghatta… |
| West | Peenya, Kengeri, Vijayanagar, Nagarbhavi, Rajajinagar, Mysore Road… |
| North West | Yeshwanthpur, Malleshwaram, Nelamangala, Tumkur Road… |
| South West | Banashankari, Padmanabhanagar, Uttarahalli, Talaghattapura… |
| South East | HSR Layout, Sarjapur Road, Varthur… |

---

## ⚙️ Configuration

Edit `CONFIG` in `script.js`:

```js
const CONFIG = {
  REFRESH_INTERVAL: 15000,  // ms — change to 5000 for faster updates
  MAP_ZOOM:         12,     // initial zoom level
  CHART_HISTORY:    10,     // data points in trend chart
  ALERT_MAX:        8,      // max visible alerts
};
```

---

## 🛠 Tech Stack

- **HTML5** — semantic structure, ARIA roles
- **CSS3** — CSS variables, grid, flexbox, animations, glassmorphism
- **Vanilla JS (ES2020)** — no frameworks, no build tools
- **[Leaflet.js 1.9.4](https://leafletjs.com/)** — interactive map
- **[OpenStreetMap](https://www.openstreetmap.org/)** — map tiles (dark-filtered via CSS)
- **[Chart.js 4.4.0](https://www.chartjs.org/)** — analytics charts
- **[Google Fonts](https://fonts.google.com/)** — Orbitron + Rajdhani + Share Tech Mono

---

## 📄 License

MIT — free for personal and commercial use.

---

*Bengaluru Traffic Command Center — Built for the Silicon Valley of India 🇮🇳*

# -Bengaluru-Traffic-Command-Center
