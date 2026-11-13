/* global L */
window.WindMap = (() => {
  const BASEMAP = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  const ATTRIB =
    'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';

  const SAT = {
    terra: {
      id: "terra",
      label: "Terra true colour",
      layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
      tileMatrixSet: "GoogleMapsCompatible_Level9",
      ext: "jpg",
      maxNativeZoom: 9,
      opacity: 0.92,
      legend: "Daily MODIS Terra true-colour imagery. Clouds appear white. Near-real-time; today’s pass may still be incomplete.",
    },
    aqua: {
      id: "aqua",
      label: "Aqua true colour",
      layer: "MODIS_Aqua_CorrectedReflectance_TrueColor",
      tileMatrixSet: "GoogleMapsCompatible_Level9",
      ext: "jpg",
      maxNativeZoom: 9,
      opacity: 0.92,
      legend: "Daily MODIS Aqua true-colour imagery (afternoon pass). Clouds appear white.",
    },
    "terra-ir": {
      id: "terra-ir",
      label: "Terra IR (night)",
      layer: "MODIS_Terra_Brightness_Temp_Band31_Night",
      tileMatrixSet: "GoogleMapsCompatible_Level7",
      ext: "png",
      maxNativeZoom: 7,
      opacity: 0.8,
      legend: "MODIS Terra Band 31 night-time infrared brightness temperature — useful for cloud structure after dark.",
    },
    "aqua-ir": {
      id: "aqua-ir",
      label: "Aqua IR (night)",
      layer: "MODIS_Aqua_Brightness_Temp_Band31_Night",
      tileMatrixSet: "GoogleMapsCompatible_Level7",
      ext: "png",
      maxNativeZoom: 7,
      opacity: 0.8,
      legend: "MODIS Aqua Band 31 night-time infrared brightness temperature.",
    },
  };

  const PALETTES = {
    wind: {
      title: "Wind (10 m)",
      unit: "kt",
      stops: [
        [0, [122, 212, 200]],
        [3, [93, 206, 138]],
        [8, [232, 197, 114]],
        [15, [224, 138, 76]],
        [25, [224, 93, 111]],
      ],
      labels: ["0–3 kt", "3–8", "8–15", "15–25", "25+"],
    },
    temperature_2m: {
      title: "Temperature (2 m)",
      unit: "°C",
      stops: [
        [-5, [59, 110, 165]],
        [5, [94, 163, 200]],
        [15, [143, 211, 192]],
        [22, [240, 230, 163]],
        [28, [240, 163, 90]],
        [35, [217, 84, 74]],
        [42, [155, 45, 74]],
      ],
      labels: ["−5°C", "5", "15", "22", "28", "35", "42+"],
    },
    precipitation: {
      title: "Precipitation (hour)",
      unit: "mm",
      transparentBelow: 0.05,
      stops: [
        [0, [200, 231, 255, 0]],
        [0.2, [160, 214, 255, 140]],
        [1, [90, 169, 230, 200]],
        [3, [47, 111, 237, 220]],
        [8, [123, 63, 228, 230]],
        [20, [194, 36, 138, 240]],
      ],
      labels: ["dry", "0.2", "1", "3", "8", "20+ mm"],
    },
    cloud_cover: {
      title: "Cloud cover",
      unit: "%",
      transparentBelow: 5,
      stops: [
        [0, [255, 255, 255, 0]],
        [20, [220, 230, 240, 70]],
        [50, [190, 200, 214, 130]],
        [80, [150, 162, 180, 190]],
        [100, [110, 120, 138, 230]],
      ],
      labels: ["clear", "20%", "50%", "80%", "overcast"],
    },
    wind_gusts_10m: {
      title: "Wind gusts (10 m)",
      unit: "kt",
      stops: [
        [0, [122, 212, 200]],
        [8, [93, 206, 138]],
        [15, [232, 197, 114]],
        [25, [224, 138, 76]],
        [35, [224, 93, 111]],
        [50, [155, 45, 74]],
      ],
      labels: ["0 kt", "8", "15", "25", "35", "50+"],
    },
    visibility: {
      title: "Visibility",
      unit: "km",
      stops: [
        [200, [180, 40, 60, 220]],
        [1000, [224, 93, 111, 200]],
        [3000, [224, 138, 76, 180]],
        [5000, [232, 197, 114, 160]],
        [8000, [93, 206, 138, 120]],
        [10000, [122, 212, 200, 40]],
        [20000, [122, 212, 200, 0]],
      ],
      labels: ["0.2 km", "1", "3", "5", "8", "10+"],
    },
    convective_cloud_base: {
      title: "Convective cloud base",
      unit: "ft",
      transparentBelow: 1,
      stops: [
        [0, [180, 40, 60, 200]],
        [300, [224, 93, 111, 190]],
        [600, [224, 138, 76, 180]],
        [1200, [232, 197, 114, 170]],
        [2000, [93, 206, 138, 150]],
        [3000, [94, 163, 200, 80]],
      ],
      labels: ["SFC", "1 000 ft", "2 000", "4 000", "6 500", "10 000+"],
      asFeet: true,
    },
    radar: {
      title: "Rain radar",
      unit: "dBZ",
      labels: ["light", "moderate", "heavy", "intense"],
      swatches: ["#5aa9e6", "#e8c572", "#e08a4c", "#c2248a"],
    },
  };

  let map;
  let arrows;
  let airports;
  let particles;
  let ready = false;
  let airspaceGroups = {};
  let droneLayer = null;
  let clickMarker = null;
  let droneEnabled = false;
  let lastPoint = null;
  let pointHandler = null;
  let airspaceData = { features: [] };
  let wantedLayers = { ctr:true,tma:true,atz:true,cta:true,restricted:true,prohibited:true,danger:true,aerodrome:true,helistop:false };
  let forecastLayer = null;
  let radarLayers = {};
  let coverageLayer = null;
  let satelliteLayer = null;
  let windVisible = true;
  let forecastData = null;
  let forecastField = null;
  let forecastTimeIndex = 0;
  let activeAttributions = new Set();
  let currentWx = "wind";

  function colorForSpeed(kt) {
    const n = Number(kt) || 0;
    if (n < 3) return "#2aa89a";
    if (n < 8) return "#1f9d5a";
    if (n < 15) return "#c7922c";
    if (n < 25) return "#d16a28";
    return "#c43b52";
  }

  function lerpColor(a, b, t) {
    const out = [];
    const n = Math.max(a.length, b.length, 3);
    for (let i = 0; i < n; i++) {
      const av = a[i] != null ? a[i] : (i === 3 ? 255 : 0);
      const bv = b[i] != null ? b[i] : (i === 3 ? 255 : 0);
      out[i] = av + (bv - av) * t;
    }
    if (out.length === 3) out[3] = 255;
    return out;
  }

  function colorForValue(palette, value) {
    if (!palette || value == null || Number.isNaN(Number(value))) return [0, 0, 0, 0];
    const v = Number(value);
    const stops = palette.stops || [];
    if (palette.transparentBelow != null && v < palette.transparentBelow) return [0, 0, 0, 0];
    if (!stops.length) return [0, 0, 0, 0];
    if (v <= stops[0][0]) {
      const c = stops[0][1];
      return [c[0], c[1], c[2], c[3] != null ? c[3] : 220];
    }
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const span = stops[i][0] - stops[i - 1][0] || 1;
        const t = (v - stops[i - 1][0]) / span;
        const mixed = lerpColor(stops[i - 1][1], stops[i][1], t);
        if (mixed[3] == null) mixed[3] = 220;
        return mixed;
      }
    }
    const c = stops[stops.length - 1][1];
    return [c[0], c[1], c[2], c[3] != null ? c[3] : 220];
  }

  function arrowIcon(dirFrom, speedKt) {
    const rot = ((Number(dirFrom) || 0) + 180) % 360;
    const color = colorForSpeed(speedKt);
    const html = `<div class="wind-arrow" style="color:${color};transform:rotate(${rot}deg)" title="">
      <svg viewBox="0 0 24 40" width="16" height="28" aria-hidden="true">
        <path d="M12 2 L12 30 M12 30 L6 20 M12 30 L18 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`;
    return L.divIcon({
      className: "wind-arrow-icon",
      html,
      iconSize: [24, 36],
      iconAnchor: [12, 18],
    });
  }

  const ParticleLayer = L.Layer.extend({
    initialize(options) {
      L.setOptions(this, options);
      this._points = [];
      this._particles = [];
      this._running = false;
    },
    onAdd(leafletMap) {
      this._map = leafletMap;
      this._canvas = L.DomUtil.create("canvas", "wind-particles");
      this._canvas.style.pointerEvents = "none";
      leafletMap.getPanes().overlayPane.appendChild(this._canvas);
      this._reset();
      leafletMap.on("move zoom resize viewreset", this._reset, this);
      this._running = true;
      this._last = performance.now();
      this._onVis = () => {
        if (document.hidden) this.pause();
        else if (windVisible) this.resume();
      };
      document.addEventListener("visibilitychange", this._onVis);
      this._tick();
    },
    onRemove(leafletMap) {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      leafletMap.off("move zoom resize viewreset", this._reset, this);
      document.removeEventListener("visibilitychange", this._onVis);
      if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    },
    setField(points) {
      this._points = (points || []).filter((p) => p.speedKt != null && p.dirDeg != null);
      this._seed(true);
    },
    pause() {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
    },
    resume() {
      if (!this._map || !windVisible) return;
      this._running = true;
      this._last = performance.now();
      this._tick();
    },
    _reset() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const panePos = this._map._getMapPanePos();
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      L.DomUtil.setPosition(this._canvas, panePos.multiplyBy(-1));
      this._seed(false);
    },
    _count() {
      return window.innerWidth < 700 ? 110 : 200;
    },
    _seed(force) {
      if (!this._map) return;
      const need = this._count();
      if (force || this._particles.length !== need) {
        this._particles = [];
        const bounds = this._map.getBounds().pad(0.08);
        for (let i = 0; i < need; i++) {
          this._particles.push({
            lat: bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()),
            lon: bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()),
            age: Math.random() * 160,
          });
        }
      }
    },
    _windAt(lat, lon) {
      const pts = this._points;
      if (!pts.length) return null;
      const ranked = pts
        .map((p) => {
          const dlat = p.lat - lat;
          const dlon = (p.lon - lon) * Math.cos((lat * Math.PI) / 180);
          return { p, d2: dlat * dlat + dlon * dlon + 1e-8 };
        })
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, 4);
      let numU = 0;
      let numV = 0;
      let den = 0;
      for (const { p, d2 } of ranked) {
        const w = 1 / d2;
        const to = ((p.dirDeg + 180) * Math.PI) / 180;
        numU += w * p.speedKt * Math.sin(to);
        numV += w * p.speedKt * Math.cos(to);
        den += w;
      }
      if (!den) return null;
      return { u: numU / den, v: numV / den };
    },
    _tick() {
      if (!this._running) return;
      const now = performance.now();
      const dt = Math.min(40, now - this._last) / 16.67;
      this._last = now;
      const ctx = this._canvas && this._canvas.getContext("2d");
      if (ctx && this._map) {
        const w = this._canvas.width;
        const h = this._canvas.height;
        ctx.fillStyle = "rgba(244, 247, 251, 0.22)";
        ctx.fillRect(0, 0, w, h);
        const bounds = this._map.getBounds().pad(0.08);
        const zoom = this._map.getZoom();
        const scale = 0.012 * Math.pow(2, zoom - 7);
        for (const part of this._particles) {
          const wind = this._windAt(part.lat, part.lon);
          if (wind) {
            part.lon += wind.u * scale * dt * 0.09;
            part.lat += wind.v * scale * dt * 0.09;
          }
          part.age += dt;
          if (part.age > 180 || !bounds.contains([part.lat, part.lon])) {
            part.lat = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
            part.lon = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());
            part.age = 0;
          }
          const pt = this._map.latLngToContainerPoint([part.lat, part.lon]);
          const speed = wind ? Math.hypot(wind.u, wind.v) : 0;
          ctx.fillStyle = colorForSpeed(speed);
          ctx.globalAlpha = Math.max(0.25, 1 - part.age / 200);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
          if (wind && speed > 0.4) {
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(pt.x - wind.u * 0.35, pt.y + wind.v * 0.35);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      this._raf = requestAnimationFrame(() => this._tick());
    },
  });

  const ForecastLayer = L.Layer.extend({
    initialize(options) {
      L.setOptions(this, options);
      this._data = null;
      this._field = null;
      this._timeIndex = 0;
    },
    onAdd(leafletMap) {
      this._map = leafletMap;
      const pane = leafletMap.getPane("weatherPane") || leafletMap.getPanes().overlayPane;
      this._canvas = L.DomUtil.create("canvas", "forecast-grid");
      this._canvas.style.pointerEvents = "none";
      pane.appendChild(this._canvas);
      this._reset();
      leafletMap.on("move zoom resize viewreset", this._reset, this);
    },
    onRemove(leafletMap) {
      leafletMap.off("move zoom resize viewreset", this._reset, this);
      if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    },
    setState(data, field, timeIndex) {
      this._data = data || null;
      this._field = field || null;
      this._timeIndex = timeIndex || 0;
      this._draw();
    },
    _reset() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const panePos = this._map._getMapPanePos();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this._canvas.width = Math.round(size.x * dpr);
      this._canvas.height = Math.round(size.y * dpr);
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(this._canvas, panePos.multiplyBy(-1));
      this._dpr = dpr;
      this._draw();
    },
    _draw() {
      if (!this._canvas || !this._map) return;
      const ctx = this._canvas.getContext("2d");
      const w = this._canvas.width;
      const h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);
      const data = this._data;
      const field = this._field && data?.fields?.[this._field];
      if (!data || !field) return;
      const paletteKey = this._field === "cloud_cover_low" || this._field === "cloud_cover_mid" || this._field === "cloud_cover_high"
        ? "cloud_cover"
        : this._field;
      const palette = PALETTES[paletteKey];
      const step = window.innerWidth < 700 ? 8 : 6;
      const dpr = this._dpr || 1;
      const img = ctx.createImageData(w, h);
      const pixels = img.data;
      const south = data.bounds.south;
      const north = data.bounds.north;
      const west = data.bounds.west;
      const east = data.bounds.east;
      for (let y = 0; y < h; y += Math.round(step * dpr)) {
        for (let x = 0; x < w; x += Math.round(step * dpr)) {
          const pt = this._map.containerPointToLatLng([x / dpr, y / dpr]);
          if (pt.lat < south || pt.lat > north || pt.lng < west || pt.lng > east) continue;
          const value = sampleField(data, this._field, this._timeIndex, pt.lat, pt.lng);
          if (value == null) continue;
          const [r, g, b, a] = colorForValue(palette, displayValue(this._field, value));
          const aa = Math.max(0, Math.min(255, Math.round(a)));
          if (!aa) continue;
          const cell = Math.round(step * dpr);
          for (let dy = 0; dy < cell && y + dy < h; dy++) {
            let idx = ((y + dy) * w + x) * 4;
            for (let dx = 0; dx < cell && x + dx < w; dx++) {
              pixels[idx] = r;
              pixels[idx + 1] = g;
              pixels[idx + 2] = b;
              pixels[idx + 3] = aa;
              idx += 4;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  function displayValue(field, value) {
    if (value == null) return null;
    if (field === "convective_cloud_base") return value * 3.28084;
    return value;
  }

  function sampleField(data, fieldName, timeIndex, lat, lon) {
    if (!data?.fields?.[fieldName] || !data.lats?.length || !data.lons?.length) return null;
    const lats = data.lats;
    const lons = data.lons;
    if (lat < lats[0] || lat > lats[lats.length - 1] || lon < lons[0] || lon > lons[lons.length - 1]) return null;
    let i = 0;
    while (i < lats.length - 2 && lats[i + 1] < lat) i++;
    let j = 0;
    while (j < lons.length - 2 && lons[j + 1] < lon) j++;
    const i2 = Math.min(i + 1, lats.length - 1);
    const j2 = Math.min(j + 1, lons.length - 1);
    const ty = lats[i2] === lats[i] ? 0 : (lat - lats[i]) / (lats[i2] - lats[i]);
    const tx = lons[j2] === lons[j] ? 0 : (lon - lons[j]) / (lons[j2] - lons[j]);
    const nLons = lons.length;
    const base = (timeIndex || 0) * (lats.length * nLons);
    const arr = data.fields[fieldName];
    const v00 = arr[base + i * nLons + j];
    const v10 = arr[base + i * nLons + j2];
    const v01 = arr[base + i2 * nLons + j];
    const v11 = arr[base + i2 * nLons + j2];
    const vals = [v00, v10, v01, v11].filter((v) => v != null);
    if (!vals.length) return null;
    const a = v00 == null ? vals[0] : v00;
    const b = v10 == null ? a : v10;
    const c = v01 == null ? a : v01;
    const d = v11 == null ? b : v11;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  function ensure() {
    if (ready) return true;
    if (typeof L === "undefined") return false;
    const el = document.getElementById("leaflet-map");
    if (!el) return false;
    try {
      map = L.map(el, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([-26.14, 28.25], 8);
      L.tileLayer(BASEMAP, {
        attribution: ATTRIB,
        maxZoom: 16,
      }).addTo(map);
      if (!map.getPane("weatherPane")) {
        map.createPane("weatherPane");
        map.getPane("weatherPane").style.zIndex = 250;
        map.getPane("weatherPane").style.pointerEvents = "none";
      }
      if (!map.getPane("airspacePane")) {
        map.createPane("airspacePane");
        map.getPane("airspacePane").style.zIndex = 350;
        map.getPane("airspacePane").style.pointerEvents = "auto";
      }
      forecastLayer = new ForecastLayer();
      arrows = L.layerGroup().addTo(map);
      airports = L.layerGroup().addTo(map);
      particles = new ParticleLayer();
      particles.addTo(map);
      map.attributionControl.setPrefix("");
      droneLayer = L.layerGroup().addTo(map);
      map.on("click", onMapClick);
      map.on("zoomend moveend", refreshPointLayers);
      ready = true;
      setTimeout(() => map.invalidateSize(), 50);
      setTimeout(() => map.invalidateSize(), 400);
    } catch (err) {
      el.innerHTML = `<p class="map-error">Could not start the wind map: ${String(err.message || err)}</p>`;
      console.error(err);
      return false;
    }
    return true;
  }

  function fit(centres) {
    if (!map || !centres?.length) return;
    if (centres.length === 1) {
      map.setView([centres[0].lat, centres[0].lon], 8, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(centres.map((c) => [c.lat, c.lon]));
    map.fitBounds(bounds.pad(0.35), { animate: false, maxZoom: 8 });
  }

  function setWind(data, options = {}) {
    if (!ensure()) return;
    const shouldFit = options.fit !== false;
    arrows.clearLayers();
    const points = data?.points || [];
    for (const p of points) {
      const marker = L.marker([p.lat, p.lon], {
        icon: arrowIcon(p.dirDeg, p.speedKt),
        keyboard: false,
        zIndexOffset: 200,
      });
      const gust = p.gustKt != null ? `, gust ${Number(p.gustKt).toFixed(1)} kt` : "";
      marker.bindPopup(
        `<strong>${Number(p.speedKt).toFixed(1)} kt</strong> from ${Math.round(p.dirDeg)}°${gust}<br><span class="pop-src">Weather data by Open-Meteo.com</span>`
      );
      arrows.addLayer(marker);
    }
    if (particles) particles.setField(points);
    applyWindVisibility();
    const centres = data?.centres?.length
      ? data.centres
      : points.map((p) => ({ lat: p.lat, lon: p.lon }));
    if (shouldFit && centres.length) fit(centres);
    setTimeout(() => map && map.invalidateSize(), 60);
  }

  function setWindVisible(on) {
    windVisible = Boolean(on);
    applyWindVisibility();
  }

  function applyWindVisibility() {
    if (!map) return;
    if (arrows) {
      if (windVisible) {
        if (!map.hasLayer(arrows)) arrows.addTo(map);
      } else if (map.hasLayer(arrows)) {
        map.removeLayer(arrows);
      }
    }
    if (particles) {
      if (windVisible) particles.resume();
      else particles.pause();
      if (particles._canvas) particles._canvas.style.display = windVisible ? "" : "none";
    }
  }

  function setAirports(list) {
    if (!ensure()) return;
    airports.clearLayers();
    for (const apt of list || []) {
      if (!Number.isFinite(apt.lat) || !Number.isFinite(apt.lon) || !(apt.lat || apt.lon)) continue;
      const cat = apt.fltCat || "NONE";
      const wind = apt.wind || "";
      const html = `<div class="apt-marker cat-${cat}"><strong>${apt.icao}</strong><span>${wind || cat}</span></div>`;
      const marker = L.marker([apt.lat, apt.lon], {
        icon: L.divIcon({
          className: "apt-icon",
          html,
          iconSize: [86, 36],
          iconAnchor: [43, 18],
        }),
        zIndexOffset: 600,
      });
      const body = [
        `<strong>${apt.icao}</strong> ${apt.name || ""}`,
        apt.summary || "",
        apt.raw ? `<pre class="raw">${apt.raw}</pre>` : "No METAR loaded.",
      ]
        .filter(Boolean)
        .join("<br>");
      marker.bindPopup(body);
      airports.addLayer(marker);
    }
  }

  function show() {
    ensure();
    if (map) setTimeout(() => map.invalidateSize(), 40);
    if (particles && windVisible) particles.resume();
  }

  function hide() {
    if (particles) particles.pause();
  }

  function focus(lat, lon) {
    if (!ensure() || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true });
  }

  const LAYER_STYLES = {
    ctr: { color: "#c43b52", fillColor: "#c43b52", fillOpacity: 0.16, weight: 2 },
    atz: { color: "#d16a28", fillColor: "#d16a28", fillOpacity: 0.14, weight: 2 },
    tma: { color: "#c7922c", fillColor: "#c7922c", fillOpacity: 0.08, weight: 1.4, dashArray: "4 3" },
    cta: { color: "#a67c2a", fillColor: "#a67c2a", fillOpacity: 0.05, weight: 1.2, dashArray: "6 4" },
    restricted: { color: "#b44a6a", fillColor: "#b44a6a", fillOpacity: 0.18, weight: 2 },
    prohibited: { color: "#c43b52", fillColor: "#7a1020", fillOpacity: 0.22, weight: 2 },
    danger: { color: "#b8860b", fillColor: "#b8860b", fillOpacity: 0.12, weight: 1.5, dashArray: "3 3" },
  };

  function airspacePopup(props) {
    const bits = [
      `<strong>${props.name || ""}</strong>`,
      props.class ? `Class: ${String(props.class).toUpperCase()}` : "",
      props.limits ? `Limits: ${props.limits}` : "",
      props.freq ? `Freq: ${props.freq}` : "",
      props.description ? `<span class="pop-src">${props.description}</span>` : "",
      `<span class="pop-src">ATNS RSA DATA KMZ — not for navigation</span>`,
    ].filter(Boolean);
    return bits.join("<br>");
  }

  function aerodromeIcon(kind) {
    const cls = kind === "helistop" ? "heli" : "ad";
    return L.divIcon({
      className: "ad-icon",
      html: `<span class="ad-dot ${cls}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function loadAirspace(payload) {
    if (!ensure()) return;
    const geojson = payload?.geojson || payload;
    airspaceData = geojson || { features: [] };
    Object.values(airspaceGroups).forEach((g) => g.clearLayers && g.clearLayers());
    const groups = {};
    const types = ["ctr", "tma", "atz", "cta", "restricted", "prohibited", "danger", "aerodrome", "helistop"];
    types.forEach((k) => { groups[k] = L.layerGroup(); });
    for (const feature of airspaceData.features || []) {
      const klass = feature.properties?.class;
      if (!groups[klass]) continue;
      if (feature.geometry?.type === "Point") {
        const [lon, lat] = feature.geometry.coordinates;
        const m = L.marker([lat, lon], { icon: aerodromeIcon(klass), zIndexOffset: 80 });
        m.bindPopup(airspacePopup(feature.properties || {}));
        groups[klass].addLayer(m);
      } else {
        const layer = L.geoJSON(feature, {
          pane: "airspacePane",
          style: () => ({ ...LAYER_STYLES[klass] }),
          onEachFeature: (f, l) => {
            l.bindPopup(airspacePopup(f.properties || {}));
            // The popup stops the click, so also feed the tap to the point readout.
            l.on("click", onMapClick);
          },
        });
        groups[klass].addLayer(layer);
      }
    }
    airspaceGroups = groups;
    document.querySelectorAll("[data-layer]").forEach((input) => {
      wantedLayers[input.dataset.layer] = input.checked;
    });
    refreshPointLayers();
  }

  function refreshPointLayers() {
    if (!map) return;
    const z = map.getZoom();
    const pointTypes = ["aerodrome", "helistop"];
    for (const klass of Object.keys(airspaceGroups)) {
      const group = airspaceGroups[klass];
      const wanted = wantedLayers[klass] !== false;
      const isPoint = pointTypes.includes(klass);
      const show = wanted && (!isPoint || z >= 8);
      if (show) {
        if (!map.hasLayer(group)) group.addTo(map);
      } else if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }

  function setLayerVisible(klass, visible) {
    wantedLayers[klass] = Boolean(visible);
    if (!ensure()) return;
    refreshPointLayers();
  }

  function setDroneEnabled(on) {
    droneEnabled = Boolean(on);
    if (!ensure()) return;
    if (!droneEnabled) {
      if (droneLayer) droneLayer.clearLayers();
    } else if (lastPoint) {
      drawDroneRings(lastPoint);
    }
  }

  function onPoint(handler) {
    pointHandler = handler;
  }

  function placeClickMarker(lat, lon) {
    if (!map) return;
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.circleMarker([lat, lon], {
      radius: 7,
      color: "#1f6feb",
      weight: 2,
      fillColor: "#1f6feb",
      fillOpacity: 0.75,
    }).addTo(map);
  }

  function onMapClick(ev) {
    const { lat, lng } = ev.latlng;
    lastPoint = { lat, lon: lng };
    placeClickMarker(lat, lng);
    if (typeof pointHandler === "function") pointHandler(lastPoint);
  }

  function drawDroneRings(point, nearby) {
    if (!ensure() || !droneLayer) return;
    droneLayer.clearLayers();
    if (!droneEnabled) return;
    const list = nearby || [];
    for (const a of list) {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
      const colour = a.km <= 10 ? "#c43b52" : "#1a8a7a";
      L.circle([a.lat, a.lon], {
        radius: 10000,
        color: colour,
        weight: a.km <= 10 ? 2 : 1.4,
        fillColor: colour,
        fillOpacity: a.km <= 10 ? 0.1 : 0.04,
        dashArray: a.km <= 10 ? null : "4 4",
      }).addTo(droneLayer);
    }
    if (point) {
      L.circle([point.lat, point.lon], {
        radius: 80,
        color: "#1f6feb",
        fillOpacity: 0.4,
        weight: 1,
      }).addTo(droneLayer);
    }
  }

  function getLastPoint() {
    return lastPoint;
  }

  function setClickPoint(point) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
    lastPoint = point;
    if (ensure()) placeClickMarker(point.lat, point.lon);
  }

  function selectPoint(point) {
    setClickPoint(point);
    if (typeof pointHandler === "function" && lastPoint) pointHandler(lastPoint);
  }

  function replaceAttribution(key, html) {
    if (!map) return;
    const prev = `attr:${key}`;
    if (activeAttributions.has(prev)) {
      map.attributionControl.removeAttribution(activeAttributions.get ? undefined : "");
    }
  }

  const attrStore = {};
  function setExtraAttribution(key, html) {
    if (!ensure()) return;
    if (attrStore[key]) {
      map.attributionControl.removeAttribution(attrStore[key]);
      delete attrStore[key];
    }
    if (html) {
      attrStore[key] = html;
      map.attributionControl.addAttribution(html);
    }
  }

  function clearWeatherOverlays() {
    if (!map) return;
    if (forecastLayer && map.hasLayer(forecastLayer)) map.removeLayer(forecastLayer);
    Object.values(radarLayers).forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (coverageLayer && map.hasLayer(coverageLayer)) map.removeLayer(coverageLayer);
    if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
    setExtraAttribution("radar", "");
    setExtraAttribution("satellite", "");
    setExtraAttribution("forecast", "");
  }

  function setForecast(data) {
    forecastData = data || null;
    if (!ensure()) return;
    if (forecastLayer && forecastField) {
      forecastLayer.setState(forecastData, forecastField, forecastTimeIndex);
    }
  }

  function setForecastView(field, timeIndex) {
    if (!ensure()) return;
    forecastField = field || null;
    forecastTimeIndex = timeIndex || 0;
    if (!forecastField || !forecastData) {
      if (forecastLayer && map.hasLayer(forecastLayer)) map.removeLayer(forecastLayer);
      return;
    }
    if (!map.hasLayer(forecastLayer)) forecastLayer.addTo(map);
    forecastLayer.setState(forecastData, forecastField, forecastTimeIndex);
    setExtraAttribution(
      "forecast",
      'Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0)'
    );
  }

  function setRadar(meta, framePath, options = {}) {
    if (!ensure()) return;
    const showCoverage = Boolean(options.coverage);
    if (meta) {
      const host = meta.host;
      const tile = meta.tile || {};
      if (showCoverage && meta.coveragePath) {
        if (coverageLayer && map.hasLayer(coverageLayer)) map.removeLayer(coverageLayer);
        coverageLayer = L.tileLayer(`${host}${meta.coveragePath}/{size}/{z}/{x}/{y}/0/0_0.png`.replace("{size}", String(tile.size || 256)), {
          pane: "weatherPane",
          opacity: 0.15,
          maxNativeZoom: tile.maxZoom || 7,
          maxZoom: 18,
          attribution: "",
        });
        coverageLayer.addTo(map);
      } else if (coverageLayer && map.hasLayer(coverageLayer)) {
        map.removeLayer(coverageLayer);
      }
    }
    Object.entries(radarLayers).forEach(([path, layer]) => {
      const on = path === framePath;
      layer.setOpacity(on ? 0.75 : 0);
      if (on && !map.hasLayer(layer)) layer.addTo(map);
    });
    if (meta && framePath && !radarLayers[framePath]) {
      const tile = meta.tile || {};
      const frame = [...(meta.past || []), ...(meta.nowcast || []), ...(meta.frames || [])].find((f) => f.path === framePath);
      const path = frame?.path || framePath;
      const url = `${meta.host}${path}/${tile.size || 256}/{z}/{x}/{y}/${tile.color || 2}/${tile.options || "1_1"}.png`;
      const layer = L.tileLayer(url, {
        pane: "weatherPane",
        opacity: 0.75,
        maxNativeZoom: tile.maxZoom || 7,
        maxZoom: 18,
        attribution: "",
      });
      radarLayers[framePath] = layer;
      layer.addTo(map);
    }
    if (meta) {
      setExtraAttribution(
        "radar",
        'Weather data by <a href="https://www.rainviewer.com/">RainViewer</a>'
      );
    }
  }

  function preloadRadar(meta, paths) {
    if (!ensure() || !meta) return;
    const tile = meta.tile || {};
    for (const path of paths || []) {
      if (radarLayers[path]) continue;
      const url = `${meta.host}${path}/${tile.size || 256}/{z}/{x}/{y}/${tile.color || 2}/${tile.options || "1_1"}.png`;
      const layer = L.tileLayer(url, {
        pane: "weatherPane",
        opacity: 0,
        maxNativeZoom: tile.maxZoom || 7,
        maxZoom: 18,
      });
      radarLayers[path] = layer;
      layer.addTo(map);
    }
  }

  function setSatellite(kind, dateIso) {
    if (!ensure()) return;
    const conf = SAT[kind] || SAT.terra;
    const time = dateIso || utcDateStamp(0);
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${conf.layer}/default/${time}/${conf.tileMatrixSet}/{z}/{y}/{x}.${conf.ext}`;
    if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
    satelliteLayer = L.tileLayer(url, {
      pane: "weatherPane",
      opacity: conf.opacity,
      maxNativeZoom: conf.maxNativeZoom,
      maxZoom: 18,
      bounds: [[-85.05, -180], [85.05, 180]],
      attribution: "",
    });
    satelliteLayer.addTo(map);
    setExtraAttribution(
      "satellite",
      'Imagery courtesy <a href="https://worldview.earthdata.nasa.gov/">NASA EOSDIS GIBS</a>'
    );
    return conf;
  }

  function utcDateStamp(offsetDays) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + (offsetDays || 0));
    return d.toISOString().slice(0, 10);
  }

  function setWeatherLayer(kind, options = {}) {
    if (!ensure()) return;
    currentWx = kind;
    clearWeatherOverlays();
    if (kind === "radar") {
      if (options.radar && options.framePath) setRadar(options.radar, options.framePath, options);
    } else if (kind === "satellite") {
      setSatellite(options.satellite || "terra", options.date);
    } else if (options.field) {
      setForecastView(options.field, options.timeIndex || 0);
    }
  }

  function sampleForecast(lat, lon, timeIndex, fields) {
    if (!forecastData) return null;
    const idx = timeIndex == null ? forecastTimeIndex : timeIndex;
    const out = { time: forecastData.times?.[idx] || null };
    for (const name of fields || Object.keys(forecastData.fields || {})) {
      out[name] = sampleField(forecastData, name, idx, lat, lon);
    }
    out.attribution = forecastData.attribution;
    return out;
  }

  function palettes() {
    return PALETTES;
  }

  function satelliteCatalog() {
    return SAT;
  }

  function invalidate() {
    if (map) setTimeout(() => map.invalidateSize(), 40);
  }

  return {
    ensure,
    setWind,
    setWindVisible,
    setAirports,
    show,
    hide,
    focus,
    loadAirspace,
    setLayerVisible,
    setDroneEnabled,
    onPoint,
    drawDroneRings,
    getLastPoint,
    setClickPoint,
    selectPoint,
    setForecast,
    setForecastView,
    setRadar,
    preloadRadar,
    setSatellite,
    setWeatherLayer,
    sampleForecast,
    palettes,
    satelliteCatalog,
    utcDateStamp,
    invalidate,
    colorForSpeed,
  };
})();
