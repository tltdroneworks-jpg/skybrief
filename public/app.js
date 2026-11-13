const REFRESH_MS = 5 * 60 * 1000;
const WIND_REFRESH_MS = 15 * 60 * 1000;
const NOTAM_REFRESH_MS = 20 * 60 * 1000;
const FORECAST_REFRESH_MS = 15 * 60 * 1000;
const RADAR_REFRESH_MS = 2 * 60 * 1000;

const WX_LAYERS = {
  wind: { label: "Wind", kind: "wind", defaultWind: true },
  radar: { label: "Rain radar", kind: "radar", defaultWind: false },
  satellite: { label: "Satellite", kind: "satellite", defaultWind: false },
  clouds: { label: "Clouds", kind: "forecast", field: "cloud_cover", defaultWind: false },
  precip: { label: "Rain forecast", kind: "forecast", field: "precipitation", defaultWind: false },
  temp: { label: "Temperature", kind: "forecast", field: "temperature_2m", defaultWind: false },
  gusts: { label: "Gusts", kind: "forecast", field: "wind_gusts_10m", defaultWind: true },
  visibility: { label: "Visibility", kind: "forecast", field: "visibility", defaultWind: false },
  cloudbase: { label: "Cloud base", kind: "forecast", field: "convective_cloud_base", defaultWind: false },
};

const CLOUD_BANDS = [
  { id: "total", field: "cloud_cover", label: "Total" },
  { id: "low", field: "cloud_cover_low", label: "Low" },
  { id: "mid", field: "cloud_cover_mid", label: "Mid" },
  { id: "high", field: "cloud_cover_high", label: "High" },
];
const FALLBACK_AIRPORTS = {
  FAOR: { icao: "FAOR", name: "O.R. Tambo Intl (Johannesburg)", lat: -26.1392, lon: 28.246 },
  FACT: { icao: "FACT", name: "Cape Town Intl", lat: -33.9715, lon: 18.6021 },
  FALE: { icao: "FALE", name: "King Shaka Intl (Durban)", lat: -29.6144, lon: 31.1197 },
};

const ROUTE_PRESETS = [
  { label: "FACT → FAOR", dep: "FACT", dest: "FAOR", alts: "", ids: "" },
  { label: "FACT → FALE", dep: "FACT", dest: "FALE", alts: "", ids: "" },
  { label: "FAOR → FALE", dep: "FAOR", dest: "FALE", alts: "", ids: "" },
  { label: "FACT · FAOR · FALE", dep: "FACT", dest: "FAOR", alts: "FALE", ids: "" },
];

const state = {
  airports: { ...FALLBACK_AIRPORTS },
  webcams: [],
  presets: [
    { label: "FAOR", value: "FAOR" },
    { label: "FACT", value: "FACT" },
    { label: "FALE", value: "FALE" },
    { label: "FAOR · FACT · FALE", value: "FAOR,FACT,FALE" },
  ],
  dep: "",
  dest: "",
  alts: [],
  ids: ["FAOR"],
  focus: "FAOR",
  weather: null,
  wind: null,
  notams: null,
  sigmets: null,
  airspaceMeta: null,
  droneQuery: null,
  clickPoint: null,
  mapMode: "skybrief",
  includeNotamsInPdf: false,
  includeSigmetsInPdf: false,
  includeAirspaceInPdf: false,
  timer: null,
  windTimer: null,
  notamTimer: null,
  forecastTimer: null,
  radarTimer: null,
  radarPlayTimer: null,
  wxLayer: "wind",
  forecast: null,
  radar: null,
  pointWx: null,
  forecastIndex: 0,
  radarFrame: 0,
  cloudBand: "total",
  satelliteId: "terra",
  satelliteDate: null,
  windOverlay: true,
  radarPlaying: false,
  mapFitted: false,
  mobileTab: "map",
};

const els = {
  form: document.getElementById("icao-form"),
  input: document.getElementById("icao-input"),
  dep: document.getElementById("dep-input"),
  dest: document.getElementById("dest-input"),
  alts: document.getElementById("alts-input"),
  presets: document.getElementById("presets"),
  focusRow: document.getElementById("focus-row"),
  clock: document.getElementById("clock"),
  updated: document.getElementById("updated"),
  refresh: document.getElementById("refresh-btn"),
  pdf: document.getElementById("pdf-btn"),
  pdfNotams: document.getElementById("pdf-notams"),
  pdfSigmets: document.getElementById("pdf-sigmets"),
  pdfAirspace: document.getElementById("pdf-airspace"),
  map: document.getElementById("windy-map"),
  mapCaption: document.getElementById("map-caption"),
  mapLegal: document.getElementById("map-legal"),
  leafletWrap: document.getElementById("leaflet-wrap"),
  windyWrap: document.getElementById("windy-wrap"),
  windyFull: document.getElementById("windy-full"),
  wxStatus: document.getElementById("wx-status"),
  wxCards: document.getElementById("wx-cards"),
  webcams: document.getElementById("webcams"),
  webcamLink: document.getElementById("webcam-link"),
  notamLinks: document.getElementById("notam-links"),
  notamList: document.getElementById("notam-list"),
  notamStatus: document.getElementById("notam-status"),
  notamCaption: document.getElementById("notam-caption"),
  sigmetStatus: document.getElementById("sigmet-status"),
  sigmetList: document.getElementById("sigmet-list"),
  sigmetCaption: document.getElementById("sigmet-caption"),
  droneToggle: document.getElementById("drone-toggle"),
  dronePanel: document.getElementById("drone-panel"),
  wxExtras: document.getElementById("wx-extras"),
  wxLegend: document.getElementById("wx-legend"),
  timeSlider: document.getElementById("time-slider"),
  timeRange: document.getElementById("time-range"),
  timeLabel: document.getElementById("time-label"),
  timePlay: document.getElementById("time-play"),
  pointReadout: document.getElementById("point-readout"),
  installBanner: document.getElementById("install-banner"),
  installCopy: document.getElementById("install-copy"),
  installBtn: document.getElementById("install-btn"),
  installDismiss: document.getElementById("install-dismiss"),
};

function parseIds(value) {
  const seen = new Set();
  const ids = [];
  for (const part of String(value || "").split(/[\s,;]+/)) {
    const id = part.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(0, 12);
}

function composeIds() {
  const dep = parseIds(els.dep?.value || state.dep)[0] || "";
  const dest = parseIds(els.dest?.value || state.dest)[0] || "";
  const alts = parseIds(els.alts?.value || state.alts.join(","));
  const extras = parseIds(els.input?.value || "");
  const ids = parseIds([dep, dest, ...alts, ...extras].join(","));
  return { dep, dest, alts, extras, ids: ids.length ? ids : ["FAOR"] };
}

function airportInfo(icao, metar) {
  const known = state.airports[icao];
  if (known) return known;
  return {
    icao,
    name: metar?.name || icao,
    lat: metar?.lat ?? 0,
    lon: metar?.lon ?? 0,
  };
}

function formatStamp(date, timeZone) {
  const body = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: timeZone === "Africa/Johannesburg" ? "2-digit" : undefined,
    hour12: false,
  }).format(date);
  const zone = timeZone === "Africa/Johannesburg" ? "SAST" : timeZone === "UTC" ? "UTC" : timeZone;
  return `${body} ${zone}`;
}

function dualStamp(date) {
  return `${formatStamp(date, "Africa/Johannesburg")} / ${formatStamp(date, "UTC")}`;
}

function tickClock() {
  els.clock.textContent = dualStamp(new Date());
}

function windyMapSrc(info) {
  const lat = Number(info.lat).toFixed(3);
  const lon = Number(info.lon).toFixed(3);
  const params = new URLSearchParams({
    lat,
    lon,
    detailLat: lat,
    detailLon: lon,
    zoom: "9",
    level: "surface",
    overlay: "wind",
    product: "ecmwf",
    calendar: "now",
    type: "map",
    location: "coordinates",
    detail: "true",
    metricWind: "kt",
    metricTemp: "°C",
    radarRange: "-1",
  });
  return `https://embed.windy.com/embed2.html?${params.toString()}`;
}

function windyAirportUrl(icao) {
  return `https://www.windy.com/${icao}`;
}

function windyWebcamsUrl(info) {
  if (!info.lat && !info.lon) return "https://www.windy.com/webcams";
  return `https://www.windy.com/-Webcams/webcams?${Number(info.lat).toFixed(3)},${Number(info.lon).toFixed(3)},11`;
}

function webcamSrc(id) {
  return `https://webcams.windy.com/webcams/public/embed/player?playerType=day&webcamId=${id}`;
}

function awcPrintUrl(ids) {
  return `https://aviationweather.gov/data/metar/?ids=${ids.join(",")}&taf=1`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metarWind(metar) {
  const raw = metar?.raw || "";
  const m = raw.match(/\s(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/);
  if (!m) return metar?.fltCat || "";
  const dir = m[1];
  const spd = String(Number(m[2]));
  const gust = m[3] ? ` G${Number(m[3].slice(1))}` : "";
  return `${dir}/${spd}${gust} ${metar?.fltCat || ""}`.trim();
}

function queryString(extra = {}) {
  const route = composeIds();
  const params = new URLSearchParams();
  if (route.dep) params.set("dep", route.dep);
  if (route.dest) params.set("dest", route.dest);
  if (route.alts.length) params.set("alts", route.alts.join(","));
  params.set("ids", route.ids.join(","));
  if (state.clickPoint) {
    params.set("lat", state.clickPoint.lat.toFixed(4));
    params.set("lon", state.clickPoint.lon.toFixed(4));
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === false || v === "") continue;
    params.set(k, String(v));
  }
  return params.toString();
}

function setFocus(icao) {
  state.focus = icao;
  renderFocus();
  renderMap();
  renderWebcams();
  const info = airportInfo(icao, state.weather?.metars?.find((m) => m.icao === icao));
  if (state.mapMode === "skybrief" && (info.lat || info.lon) && window.WindMap) {
    window.WindMap.focus(info.lat, info.lon);
  }
}

function renderPresets() {
  const icaoChips = state.presets
    .map((p) => `<button type="button" class="chip" data-ids="${escapeHtml(p.value)}">${escapeHtml(p.label)}</button>`)
    .join("");
  const routeChips = ROUTE_PRESETS.map(
    (p) =>
      `<button type="button" class="chip route" data-dep="${p.dep}" data-dest="${p.dest}" data-alts="${p.alts}" data-ids="${p.ids}">${escapeHtml(p.label)}</button>`
  ).join("");
  els.presets.innerHTML = icaoChips + routeChips;
}

function renderFocus() {
  if (state.ids.length < 2) {
    els.focusRow.hidden = true;
    els.focusRow.innerHTML = "";
    return;
  }
  els.focusRow.hidden = false;
  els.focusRow.innerHTML = state.ids
    .map((id) => {
      const role = id === state.dep ? " dep" : id === state.dest ? " dest" : state.alts.includes(id) ? " alt" : "";
      return `<button type="button" class="chip${id === state.focus ? " active" : ""}" data-focus="${id}">${id}${role}${id === state.focus ? " · map" : ""}</button>`;
    })
    .join("");
}

function setMapMode(mode) {
  state.mapMode = mode === "windy" ? "windy" : "skybrief";
  document.querySelectorAll(".map-tab").forEach((btn) => {
    const active = btn.dataset.map === state.mapMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  els.leafletWrap.hidden = state.mapMode !== "skybrief";
  els.windyWrap.hidden = state.mapMode !== "windy";
  renderMap();
}

function renderMap() {
  const metar = state.weather?.metars?.find((m) => m.icao === state.focus);
  const info = airportInfo(state.focus, metar);
  const ready = Boolean(info.lat || info.lon);
  els.windyFull.href = windyAirportUrl(state.focus);
  els.windyFull.textContent = `Open ${state.focus} on Windy`;

  if (state.mapMode === "skybrief") {
    updateMapCopy(ready);
    if (window.WindMap) {
      window.WindMap.show();
      window.WindMap.setAirports(
        state.ids.map((icao) => {
          const m = state.weather?.metars?.find((row) => row.icao === icao);
          const apt = airportInfo(icao, m);
          return {
            icao,
            name: apt.name,
            lat: apt.lat,
            lon: apt.lon,
            fltCat: m?.fltCat || "NONE",
            wind: metarWind(m),
            summary: m?.summary || "",
            raw: m?.raw || "",
          };
        })
      );
      applyWeatherLayer();
    }
  } else {
    els.mapCaption.textContent = ready
      ? `Official Windy embed for ${info.name} — wind overlay, particles on, centred at ${Number(info.lat).toFixed(3)}, ${Number(info.lon).toFixed(3)}.`
      : `${state.focus} has no coordinates yet. Open it on Windy instead.`;
    els.mapLegal.innerHTML =
      'Map and forecast visualisation by <a href="https://www.windy.com/" target="_blank" rel="noopener noreferrer">Windy.com</a>. The Windy logo on the widget must stay visible and clickable.';
    if (window.WindMap) window.WindMap.hide();
    if (ready) {
      const src = windyMapSrc(info);
      if (els.map.dataset.src !== src) {
        els.map.src = src;
        els.map.dataset.src = src;
      }
    } else {
      els.map.src = "about:blank";
      els.map.dataset.src = "";
    }
  }
}

function renderWeather() {
  const data = state.weather;
  if (!data) {
    els.wxStatus.textContent = "Weather not loaded yet.";
    els.wxCards.innerHTML = "";
    els.updated.textContent = "Weather not loaded yet";
    return;
  }
  const fetched = new Date(data.fetchedAt);
  const cacheNote = data.cached ? " (from 5-minute cache)" : "";
  const routeBits = [state.dep && `Dep ${state.dep}`, state.dest && `Dest ${state.dest}`, state.alts.length && `Alts ${state.alts.join(", ")}`]
    .filter(Boolean)
    .join(" · ");
  els.wxStatus.textContent = `${routeBits ? routeBits + ". " : ""}Last updated ${dualStamp(fetched)}${cacheNote}. Source: ${data.source}. Auto-refresh every 5 minutes.`;
  els.updated.textContent = `Weather last updated ${dualStamp(fetched)}`;

  els.wxCards.innerHTML = state.ids
    .map((icao) => {
      const metar = data.metars.find((m) => m.icao === icao);
      const taf = data.tafs.find((t) => t.icao === icao);
      const info = airportInfo(icao, metar);
      const cat = metar?.fltCat || "NONE";
      const catLabel = metar?.fltCat || "NO CAT";
      const role = icao === state.dep ? "Departure" : icao === state.dest ? "Destination" : state.alts.includes(icao) ? "Alternate" : "";
      return `
        <article class="wx-card" data-icao="${icao}">
          <header>
            <h3>${icao}${role ? `<span class="role">${role}</span>` : ""}<span class="name">${escapeHtml(info.name)}</span></h3>
            <span class="cat ${escapeHtml(cat)}">${escapeHtml(catLabel)}</span>
          </header>
          <div class="wx-block">
            <p>METAR${metar?.source ? ` · ${escapeHtml(metar.source)}` : ""}</p>
            <pre class="raw">${escapeHtml(metar?.raw || `No METAR loaded for ${icao}.`)}</pre>
            ${metar?.summary ? `<p class="decoded">${escapeHtml(metar.summary)}</p>` : ""}
          </div>
          <div class="wx-block">
            <p>TAF${taf?.source ? ` · ${escapeHtml(taf.source)}` : ""}</p>
            <pre class="raw">${escapeHtml(taf?.raw || `No TAF loaded for ${icao}.`)}</pre>
          </div>
        </article>`;
    })
    .join("");
}

function renderWebcams() {
  const metar = state.weather?.metars?.find((m) => m.icao === state.focus);
  const info = airportInfo(state.focus, metar);
  els.webcamLink.href = windyWebcamsUrl(info);
  els.webcamLink.textContent = `Windy webcams near ${state.focus}`;

  const cams = (state.webcams || []).filter((cam) => (cam.near || []).some((code) => state.ids.includes(code)));
  if (!cams.length) {
    els.webcams.innerHTML = `<div class="cam-card"><div class="meta"><h3>No verified webcam on this page</h3><p>No pre-selected Windy webcam is stored for the loaded airports. Use the link above to browse official Windy cameras near ${escapeHtml(state.focus)}. Windy’s public webcam API needs a key, so this site does not auto-list every nearby camera.</p></div></div>`;
    return;
  }
  els.webcams.innerHTML = cams
    .map(
      (cam) => `
      <article class="cam-card">
        <div class="cam-frame">
          <iframe title="${escapeHtml(cam.title)}" src="${escapeHtml(webcamSrc(cam.id))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        </div>
        <div class="meta">
          <h3>${escapeHtml(cam.title)}</h3>
          <p>${escapeHtml(cam.note)}</p>
        </div>
      </article>`
    )
    .join("");
}

function officialLinks() {
  const links = state.ids.map((icao) => ({
    title: `${icao} on Windy`,
    detail: "Airport page with METAR, TAF, NOTAMs and webcams.",
    href: windyAirportUrl(icao),
  }));
  links.push(
    {
      title: "ATNS File2Fly",
      detail: "Official RSA NOTAM, PIB and MET briefing, with a printable PDF, and flight-plan filing. Free registration.",
      href: "https://file2fly.atns.co.za/aes/login.jsp",
    },
    {
      title: "SAWS aviation weather",
      detail: "Official South African METAR, TAF, SIGMET and AIRMET.",
      href: "https://aviation.weathersa.co.za/",
    },
    {
      title: "AWC METAR and TAF text",
      detail: "Aviation Weather Center print-friendly page for the loaded airports.",
      href: awcPrintUrl(state.ids),
    },
    {
      title: "ATNS RSA DATA KMZ",
      detail: "Official airspace visualisation download (not for navigation).",
      href: "https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D",
    }
  );
  return links;
}

function renderNotams() {
  const data = state.notams;
  els.notamLinks.innerHTML = officialLinks()
    .map(
      (link) => `
      <a class="link-card" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">
        <h3>${escapeHtml(link.title)}</h3>
        <p>${escapeHtml(link.detail)}</p>
      </a>`
    )
    .join("");

  if (!data) {
    els.notamStatus.textContent = "NOTAMs not loaded yet.";
    els.notamList.innerHTML = "";
    return;
  }

  if (!data.configured) {
    const setup = data.setup || {};
    const options = (setup.options || [])
      .map((opt) => {
        const steps = (opt.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
        return `<details class="setup-card"><summary>${escapeHtml(opt.label)}</summary><p>${escapeHtml(opt.why || "")}</p><ol>${steps}</ol></details>`;
      })
      .join("");
    els.notamStatus.innerHTML = `<div class="notice">${escapeHtml(
      setup.message || "No NOTAM API credentials are configured, so live NOTAM text cannot be loaded."
    )} This site does not scrape File2Fly or Windy. Official RSA NOTAMs remain ATNS File2Fly. Copy <code>.env.example</code> to <code>.env</code>, add a key, and restart the server.</div>`;
    els.notamCaption.textContent =
      "Live NOTAM text needs a free API account on the server (autorouter is recommended for FA**). Auto-refresh is ready once a key is set.";
    els.notamList.innerHTML = options;
    return;
  }

  const fetched = data.fetchedAt ? dualStamp(new Date(data.fetchedAt)) : "just now";
  const cacheNote = data.cached ? " (from 20-minute cache)" : "";
  els.notamStatus.textContent = `Last updated ${fetched}${cacheNote}. Source: ${data.providerLabel || data.provider}. Auto-refresh every 20 minutes.`;
  els.notamCaption.textContent = data.disclaimer || "NOTAMs as received from the configured API. Not an official ATNS briefing.";

  const byAirport = data.byAirport || {};
  els.notamList.innerHTML = state.ids
    .map((icao) => {
      const list = byAirport[icao] || [];
      const items = list.length
        ? list
            .map((n) => {
              const valid = n.start || n.end ? `<p class="notam-valid">${escapeHtml([n.start && `From ${n.start}`, n.end && `to ${n.end}`].filter(Boolean).join(" "))}</p>` : "";
              return `<article class="notam-item"><h4>${escapeHtml(n.id || "NOTAM")}</h4>${valid}<pre class="raw">${escapeHtml(n.text || n.raw || "(no text)")}</pre></article>`;
            })
            .join("")
        : `<p class="empty">No NOTAMs returned for ${escapeHtml(icao)}. The source may not hold this location, or only national-only series exist.</p>`;
      return `<section class="notam-group"><h3>${escapeHtml(icao)}</h3>${items}</section>`;
    })
    .join("");
}

function renderSigmets() {
  const data = state.sigmets;
  if (!els.sigmetStatus) return;
  if (!data) {
    els.sigmetStatus.textContent = "SIGMETs not loaded yet.";
    els.sigmetList.innerHTML = "";
    return;
  }
  const fetched = data.fetchedAt ? dualStamp(new Date(data.fetchedAt)) : "just now";
  const cacheNote = data.cached ? " (cached)" : "";
  const firs = (data.firs || []).join(", ");
  els.sigmetStatus.textContent = `Last updated ${fetched}${cacheNote}. Source: ${data.source}. Watching ${firs}${data.sigmets?.some((s) => s.firId === "FAJO") ? " (plus FAJO when issued)" : ""}.`;
  const list = data.sigmets || [];
  if (!list.length) {
    els.sigmetList.innerHTML = `<p class="empty">No international SIGMETs currently returned for ${escapeHtml(firs)}.</p>`;
    return;
  }
  els.sigmetList.innerHTML = list
    .map((s) => {
      const title = [s.firId, s.hazard, s.qualifier, s.seriesId].filter(Boolean).join(" · ");
      const valid = [s.validFrom && `From ${s.validFrom}`, s.validTo && `to ${s.validTo}`].filter(Boolean).join(" ");
      return `<article class="sigmet-item"><h3>${escapeHtml(title || "SIGMET")}</h3>${valid ? `<p class="notam-valid">${escapeHtml(valid)}</p>` : ""}<pre class="raw">${escapeHtml(s.raw || "(no text)")}</pre></article>`;
    })
    .join("");
}

function renderDronePanel() {
  if (!els.dronePanel) return;
  const q = state.droneQuery;
  if (!q) {
    els.dronePanel.hidden = !els.droneToggle?.checked;
    els.dronePanel.innerHTML = els.droneToggle?.checked
      ? `<p>Drone planning mode is on. Click the map to check a point against published ATNS aerodromes (10 km) and controlled / restricted / prohibited airspace. Planning aid only — not permission to fly.</p>`
      : "";
    return;
  }
  els.dronePanel.hidden = false;
  const flags = q.flags || {};
  const pills = [
    flags.within10kmAerodrome ? `<span class="flag bad">Within 10 km of an aerodrome</span>` : `<span class="flag ok">No published aerodrome within 10 km</span>`,
    flags.inSurfaceControlled
      ? `<span class="flag bad">Surface controlled airspace (CTR/ATZ)</span>`
      : flags.inControlledAirspace
        ? `<span class="flag warn">Inside a mapped TMA/CTA/CTR/ATZ — check lower limit</span>`
        : `<span class="flag ok">No mapped controlled airspace at this point</span>`,
    flags.inRestrictedOrProhibited ? `<span class="flag bad">Restricted or prohibited airspace</span>` : "",
    flags.inDanger ? `<span class="flag warn">Danger area (FAD)</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  const nearby = (q.within10km || q.nearbyAerodromes || [])
    .filter((a) => a.km <= 10)
    .map((a) => `<li>${escapeHtml(a.name)}${a.icao ? " (" + escapeHtml(a.icao) + ")" : ""} — ${a.km.toFixed(1)} km</li>`)
    .join("");
  const airspace = (q.airspace || [])
    .map((a) => `<li><strong>${escapeHtml(a.name)}</strong> [${escapeHtml(a.class)}]${a.limits ? " · " + escapeHtml(a.limits) : ""}</li>`)
    .join("");
  const p101 = q.part101 || {};
  els.dronePanel.innerHTML = `
    <h3>Drone planning check</h3>
    <p class="drone-point">${q.lat.toFixed(4)}, ${q.lon.toFixed(4)} · planning aid, not permission</p>
    <div class="flag-row">${pills}</div>
    ${nearby ? `<p><strong>Within 10 km</strong></p><ul>${nearby}</ul>` : ""}
    ${airspace ? `<p><strong>Airspace at this point</strong></p><ul>${airspace}</ul>` : "<p>No mapped CTR/TMA/ATZ/CTA or FAR/FAP/FAD polygon contains this point.</p>"}
    <details>
      <summary>SA-CAR Part 101 wording (verified 12 Nov 2026)</summary>
      <p>${escapeHtml(p101.generalRestrictions || "")}</p>
      <p>${escapeHtml(p101.controlledAirspace || "")}</p>
      <p>${escapeHtml(p101.planningAid || "")}</p>
      <p class="cite">${escapeHtml(p101.citationDate || "")}</p>
    </details>
    <p class="cite">Airspace source: ATNS RSA DATA KMZ${q.source?.cycle ? ", cycle " + escapeHtml(q.source.cycle) : ""}. Not for navigation. The dataset may not list every farm strip or helipad.</p>
  `;
}

function updatePdfLink() {
  const extra = {};
  if (state.includeNotamsInPdf) extra.notams = "1";
  if (state.includeSigmetsInPdf) extra.sigmets = "1";
  if (state.includeAirspaceInPdf) extra.airspace = "1";
  els.pdf.href = `/api/pdf?${queryString(extra)}`;
  const pack = state.includeNotamsInPdf || state.includeSigmetsInPdf || state.includeAirspaceInPdf;
  els.pdf.textContent = pack ? "Download briefing pack PDF" : "Download METAR/TAF PDF";
}

function syncUrl() {
  const url = new URL(window.location.href);
  url.search = queryString();
  history.replaceState({}, "", url);
}

async function loadWeather({ refresh = false } = {}) {
  els.wxStatus.textContent = refresh ? "Refreshing current weather…" : "Loading current weather…";
  try {
    const res = await fetch(`/api/weather?${queryString(refresh ? { refresh: "1" } : {})}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.weather = data;
    renderWeather();
    renderMap();
    renderWebcams();
  } catch (err) {
    els.wxStatus.innerHTML = `<div class="error">Could not load METAR/TAF: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadWind() {
  try {
    const res = await fetch(`/api/wind?${queryString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.wind = data;
    renderMap();
  } catch (err) {
    if (els.mapCaption) els.mapCaption.textContent = `Could not load the Open-Meteo wind grid: ${err.message}`;
  }
}

async function loadForecast() {
  try {
    const res = await fetch("/api/forecast");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.forecast = data;
    if (state.forecastIndex >= (data.times || []).length) state.forecastIndex = 0;
    if (window.WindMap) window.WindMap.setForecast(data);
    applyWeatherLayer();
    if (state.clickPoint) renderPointReadout();
  } catch (err) {
    console.warn("Forecast grid failed", err);
  }
}

async function loadRadar() {
  try {
    const res = await fetch("/api/radar");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const frames = radarFramesFrom(data);
    const keepPath = radarFrames()[state.radarFrame]?.path;
    state.radar = data;
    const idx = keepPath ? frames.findIndex((f) => f.path === keepPath) : -1;
    state.radarFrame = idx >= 0 ? idx : Math.max(0, frames.length - 1);
    if (window.WindMap && frames.length) {
      window.WindMap.preloadRadar(data, frames.map((f) => f.path));
    }
    if (state.wxLayer === "radar") applyWeatherLayer();
    else renderTimeSlider();
  } catch (err) {
    console.warn("Rain radar failed", err);
  }
}

async function loadPointWx(point) {
  if (!point) return;
  try {
    const res = await fetch(`/api/point?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lon)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.pointWx = data;
    renderPointReadout();
  } catch (err) {
    state.pointWx = { error: err.message, lat: point.lat, lon: point.lon };
    renderPointReadout();
  }
}

async function loadNotams({ refresh = false } = {}) {
  if (els.notamStatus) els.notamStatus.textContent = refresh ? "Refreshing NOTAMs…" : "Loading NOTAMs…";
  try {
    const res = await fetch(`/api/notams?${queryString(refresh ? { refresh: "1" } : {})}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.notams = data;
    renderNotams();
  } catch (err) {
    if (els.notamStatus) els.notamStatus.innerHTML = `<div class="error">Could not load NOTAMs: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadSigmets({ refresh = false } = {}) {
  if (els.sigmetStatus) els.sigmetStatus.textContent = refresh ? "Refreshing SIGMETs…" : "Loading SIGMETs…";
  try {
    const res = await fetch(`/api/sigmets?${queryString(refresh ? { refresh: "1" } : {})}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.sigmets = data;
    renderSigmets();
  } catch (err) {
    if (els.sigmetStatus) els.sigmetStatus.innerHTML = `<div class="error">Could not load SIGMETs: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadAirspaceLayer() {
  try {
    const res = await fetch("/api/airspace");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.airspaceMeta = data.meta || null;
    if (window.WindMap && data.geojson) window.WindMap.loadAirspace(data);
    renderMap();
  } catch (err) {
    console.warn("Airspace layer failed", err);
  }
}

async function onMapPoint(point) {
  state.clickPoint = point;
  updatePdfLink();
  syncUrl();
  if (window.WindMap) window.WindMap.setClickPoint(point);
  renderPointReadout({ loading: true });
  const jobs = [loadPointWx(point)];
  if (els.droneToggle?.checked) jobs.push(loadDronePoint(point));
  else {
    state.droneQuery = null;
    if (els.dronePanel) els.dronePanel.hidden = true;
    if (window.WindMap) window.WindMap.drawDroneRings(point, []);
  }
  await Promise.all(jobs);
}

async function loadDronePoint(point) {
  try {
    const res = await fetch(`/api/airspace?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lon)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    state.droneQuery = data;
    if (window.WindMap) window.WindMap.drawDroneRings(point, data.nearbyAerodromes || data.within10km || []);
    renderDronePanel();
  } catch (err) {
    if (els.dronePanel) {
      els.dronePanel.hidden = false;
      els.dronePanel.innerHTML = `<div class="error">Could not check that point: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function applyIdsFromForm({ refresh = false } = {}) {
  const route = composeIds();
  state.dep = route.dep;
  state.dest = route.dest;
  state.alts = route.alts;
  state.ids = route.ids;
  state.focus = state.ids.includes(state.focus) ? state.focus : state.ids[0];
  if (els.dep) els.dep.value = state.dep;
  if (els.dest) els.dest.value = state.dest;
  if (els.alts) els.alts.value = state.alts.join(", ");
  const extrasOnly = route.extras.filter((id) => id !== state.dep && id !== state.dest && !state.alts.includes(id));
  if (!state.dep && !state.dest && !state.alts.length) {
    els.input.value = state.ids.join(", ");
  } else {
    els.input.value = extrasOnly.join(", ");
  }
  syncUrl();
  renderFocus();
  renderMap();
  renderWebcams();
  renderNotams();
  renderSigmets();
  updatePdfLink();
  state.mapFitted = false;
  loadWeather({ refresh });
  loadWind();
  loadForecast();
  loadRadar();
  loadNotams({ refresh });
  loadSigmets({ refresh });
}

function applyRoutePreset(preset) {
  if (els.dep) els.dep.value = preset.dep || "";
  if (els.dest) els.dest.value = preset.dest || "";
  if (els.alts) els.alts.value = preset.alts || "";
  if (els.input) els.input.value = preset.ids || "";
  applyIdsFromForm();
}

function scheduleRefresh() {
  if (state.timer) clearInterval(state.timer);
  if (state.windTimer) clearInterval(state.windTimer);
  if (state.notamTimer) clearInterval(state.notamTimer);
  if (state.forecastTimer) clearInterval(state.forecastTimer);
  if (state.radarTimer) clearInterval(state.radarTimer);
  state.timer = setInterval(() => {
    loadWeather({ refresh: false });
    loadSigmets({ refresh: false });
  }, REFRESH_MS);
  state.windTimer = setInterval(() => loadWind(), WIND_REFRESH_MS);
  state.forecastTimer = setInterval(() => loadForecast(), FORECAST_REFRESH_MS);
  state.radarTimer = setInterval(() => loadRadar(), RADAR_REFRESH_MS);
  state.notamTimer = setInterval(() => loadNotams({ refresh: false }), NOTAM_REFRESH_MS);
}

function setupInstall() {
  const banner = els.installBanner;
  if (!banner) return;
  const dismissed = localStorage.getItem("skybrief-install-dismissed") === "1";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (standalone) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    if (dismissed) return;
    banner.hidden = false;
    els.installBtn.hidden = false;
    els.installCopy.textContent = "Install Skybrief on your home screen for a one-tap briefing desk.";
  });
  if (isIOS && !dismissed) {
    banner.hidden = false;
    els.installBtn.hidden = true;
    els.installCopy.textContent = "On iPhone or iPad: tap the Share button, then Add to Home Screen, to install Skybrief.";
  }
  els.installBtn?.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    banner.hidden = true;
  });
  els.installDismiss?.addEventListener("click", () => {
    localStorage.setItem("skybrief-install-dismissed", "1");
    banner.hidden = true;
  });
}


function radarFramesFrom(data) {
  if (!data) return [];
  if (data.frames?.length) return data.frames;
  return [...(data.past || []), ...(data.nowcast || [])];
}

function radarFrames() {
  return radarFramesFrom(state.radar);
}

function activeForecastField() {
  const conf = WX_LAYERS[state.wxLayer] || WX_LAYERS.wind;
  if (state.wxLayer === "clouds") {
    const band = CLOUD_BANDS.find((b) => b.id === state.cloudBand) || CLOUD_BANDS[0];
    return band.field;
  }
  return conf.field || null;
}

function isoToDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  if (/^\d+$/.test(s)) return new Date(Number(s) * 1000);
  return new Date(s.endsWith("Z") ? s : `${s}Z`);
}

function formatHourLabel(iso, { withOffset = false } = {}) {
  const d = isoToDate(iso);
  if (!d || Number.isNaN(d.getTime())) return "—";
  const body = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  if (!withOffset) return `${body} SAST`;
  const slot = d.getTime();
  const now = Date.now();
  if (now >= slot && now < slot + 60 * 60 * 1000) return `${body} SAST · now`;
  const hours = Math.round((slot - now) / 3600000);
  const sign = hours > 0 ? "+" : "";
  return `${body} SAST · ${sign}${hours} h`;
}

function currentLayerTime() {
  if (state.wxLayer === "radar") {
    const frame = radarFrames()[state.radarFrame];
    return frame?.time ? new Date(frame.time * 1000).toISOString() : null;
  }
  if (state.wxLayer === "satellite") return state.satelliteDate;
  const times = state.forecast?.times || [];
  return times[state.forecastIndex] || null;
}

function forecastWindPoints(timeIndex) {
  const data = state.forecast;
  if (!data?.fields?.wind_speed_10m) return null;
  const points = [];
  const nLons = data.lons.length;
  const base = timeIndex * data.pointCount;
  for (let i = 0; i < data.lats.length; i++) {
    for (let j = 0; j < nLons; j++) {
      const idx = base + i * nLons + j;
      const speed = data.fields.wind_speed_10m[idx];
      const dir = data.fields.wind_direction_10m[idx];
      if (speed == null || dir == null) continue;
      points.push({
        lat: data.lats[i],
        lon: data.lons[j],
        speedKt: speed,
        dirDeg: dir,
        gustKt: data.fields.wind_gusts_10m ? data.fields.wind_gusts_10m[idx] : null,
      });
    }
  }
  return { points, centres: state.wind?.centres || [] };
}

function updateWindField() {
  if (!window.WindMap) return;
  const future = state.forecastIndex > 0 && state.forecast;
  if (future) {
    const pack = forecastWindPoints(state.forecastIndex);
    if (pack) window.WindMap.setWind(pack, { fit: false });
  } else if (state.wind) {
    window.WindMap.setWind(state.wind, { fit: !state.mapFitted });
    state.mapFitted = true;
  }
  window.WindMap.setWindVisible(state.windOverlay);
}

function applyWeatherLayer() {
  if (!window.WindMap || state.mapMode !== "skybrief") return;
  const id = state.wxLayer;
  const conf = WX_LAYERS[id] || WX_LAYERS.wind;
  window.WindMap.setWindVisible(state.windOverlay);
  if (id === "radar") {
    const frames = radarFrames();
    const frame = frames[state.radarFrame] || frames[frames.length - 1];
    window.WindMap.setWeatherLayer("radar", { radar: state.radar, framePath: frame?.path });
    if (state.radar && frames.length) window.WindMap.preloadRadar(state.radar, frames.map((f) => f.path));
  } else if (id === "satellite") {
    if (!state.satelliteDate && window.WindMap.utcDateStamp) state.satelliteDate = window.WindMap.utcDateStamp(0);
    window.WindMap.setWeatherLayer("satellite", { satellite: state.satelliteId, date: state.satelliteDate });
  } else if (conf.kind === "forecast") {
    const field = activeForecastField();
    window.WindMap.setWeatherLayer(id, { field, timeIndex: state.forecastIndex });
  } else {
    window.WindMap.setWeatherLayer("wind");
  }
  updateWindField();
  renderLegend();
  renderTimeSlider();
  renderWxExtras();
  updateMapCopy();
  if (state.clickPoint) renderPointReadout();
}

function updateMapCopy(readyOverride) {
  if (!els.mapCaption || !els.mapLegal) return;
  const info = airportInfo(state.focus, state.weather?.metars?.find((m) => m.icao === state.focus));
  const ready = readyOverride != null ? readyOverride : Boolean(info.lat || info.lon);
  const cycle = state.airspaceMeta?.cycle ? ` ATNS airspace cycle ${state.airspaceMeta.cycle}.` : "";
  const conf = WX_LAYERS[state.wxLayer] || WX_LAYERS.wind;
  let layerNote = "";
  if (state.wxLayer === "radar") {
    const frame = radarFrames()[state.radarFrame];
    const when = frame?.time ? formatHourLabel(frame.time) : "";
    const extra = state.radar?.nowcastAvailable ? " Includes nowcast frames." : " Past 2 hours (free RainViewer feed has no nowcast).";
    layerNote = ` Live rain radar from RainViewer${when ? ` at ${when}` : ""}.${extra}`;
  } else if (state.wxLayer === "satellite") {
    const cat = window.WindMap?.satelliteCatalog?.() || {};
    const sat = cat[state.satelliteId] || {};
    layerNote = ` ${sat.label || "Satellite"} for ${state.satelliteDate || "the latest day"} via NASA EOSDIS GIBS.`;
  } else if (conf.kind === "forecast") {
    const when = formatHourLabel(currentLayerTime(), { withOffset: true });
    layerNote = ` Open-Meteo ${conf.label.toLowerCase()} over South Africa at ${when}.`;
  } else {
    const windNote = state.wind?.fetchedAt
      ? ` Wind at ${dualStamp(new Date(state.wind.fetchedAt))}${state.wind.cached ? " (cached)" : ""}.`
      : "";
    const when = state.forecastIndex > 0 ? ` Forecast wind at ${formatHourLabel(currentLayerTime(), { withOffset: true })}.` : windNote;
    layerNote = when;
  }
  els.mapCaption.textContent = ready
    ? `Skybrief map for the loaded airports — ${conf.label.toLowerCase()}, ATNS airspace (not for navigation).${layerNote}${cycle}`
    : `${state.focus} has no coordinates yet.`;
  const bits = [
    'Tiles © <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>.',
  ];
  if (state.wxLayer === "radar") {
    bits.push('Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a> (personal / educational use).');
  } else if (state.wxLayer === "satellite") {
    bits.push('Imagery courtesy <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA EOSDIS GIBS</a>.');
  } else {
    bits.push('Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> (CC BY 4.0).');
  }
  if (state.windOverlay && state.wxLayer !== "wind") {
    bits.push('Wind overlay also by Open-Meteo.com.');
  }
  bits.push('Airspace: <a href="https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D" target="_blank" rel="noopener noreferrer">ATNS RSA DATA KMZ</a> — not for navigation.');
  els.mapLegal.innerHTML = bits.join(" ");
}

function swatchStyle(rgb) {
  if (typeof rgb === "string") return `color:${rgb}`;
  const [r, g, b] = rgb;
  return `color:rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function renderLegend() {
  const el = els.wxLegend;
  if (!el) return;
  const palettes = window.WindMap?.palettes?.() || {};
  let key = "wind";
  if (state.wxLayer === "radar") key = "radar";
  else if (state.wxLayer === "satellite") key = "satellite";
  else if (state.wxLayer === "temp") key = "temperature_2m";
  else if (state.wxLayer === "precip") key = "precipitation";
  else if (state.wxLayer === "clouds") key = "cloud_cover";
  else if (state.wxLayer === "gusts") key = "wind_gusts_10m";
  else if (state.wxLayer === "visibility") key = "visibility";
  else if (state.wxLayer === "cloudbase") key = "convective_cloud_base";
  if (state.wxLayer === "satellite") {
    const cat = window.WindMap?.satelliteCatalog?.() || {};
    const sat = cat[state.satelliteId] || {};
    el.innerHTML = `<span class="legend-title">${escapeHtml(sat.label || "Satellite")}</span>`;
    return;
  }
  const pal = palettes[key];
  if (!pal) {
    el.innerHTML = "";
    return;
  }
  const title = `<span class="legend-title">${escapeHtml(pal.title || "")}</span>`;
  const chips = (pal.labels || []).map((label, i) => {
    const colour = pal.swatches?.[i] || pal.stops?.[Math.min(i, (pal.stops || []).length - 1)]?.[1] || [31, 111, 235];
    return `<span class="legend-swatch" style="${swatchStyle(colour)}">${escapeHtml(label)}</span>`;
  }).join("");
  el.innerHTML = title + chips;
}

function sliderModel() {
  if (state.wxLayer === "radar") {
    const frames = radarFrames();
    return {
      visible: frames.length > 1,
      min: 0,
      max: Math.max(0, frames.length - 1),
      value: Math.min(state.radarFrame, Math.max(0, frames.length - 1)),
      play: frames.length > 1,
      label: frames[state.radarFrame] ? formatHourLabel(frames[state.radarFrame].time) : "Radar",
    };
  }
  if (state.wxLayer === "satellite") {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    if (!state.satelliteDate) state.satelliteDate = dates[dates.length - 1];
    let value = dates.indexOf(state.satelliteDate);
    if (value < 0) value = dates.length - 1;
    return {
      visible: true,
      min: 0,
      max: dates.length - 1,
      value,
      play: false,
      label: state.satelliteDate,
      dates,
    };
  }
  const times = state.forecast?.times || [];
  if (!times.length) return { visible: state.wxLayer !== "radar", min: 0, max: 48, value: state.forecastIndex, play: false, label: "Forecast…" };
  return {
    visible: true,
    min: 0,
    max: times.length - 1,
    value: Math.min(state.forecastIndex, times.length - 1),
    play: false,
    label: formatHourLabel(times[state.forecastIndex], { withOffset: true }),
  };
}

function renderTimeSlider() {
  if (!els.timeSlider || !els.timeRange || !els.timeLabel) return;
  const model = sliderModel();
  els.timeSlider.hidden = !model.visible;
  if (!model.visible) {
    stopRadarPlay();
    return;
  }
  els.timeRange.min = String(model.min);
  els.timeRange.max = String(model.max);
  els.timeRange.value = String(model.value);
  els.timeLabel.textContent = model.label;
  if (els.timePlay) {
    els.timePlay.hidden = !model.play;
    els.timePlay.textContent = state.radarPlaying ? "Pause" : "Play";
  }
}

function onTimeInput() {
  const value = Number(els.timeRange.value) || 0;
  if (state.wxLayer === "radar") {
    state.radarFrame = value;
  } else if (state.wxLayer === "satellite") {
    const model = sliderModel();
    state.satelliteDate = model.dates[value] || state.satelliteDate;
  } else {
    state.forecastIndex = value;
  }
  applyWeatherLayer();
}

function stopRadarPlay() {
  state.radarPlaying = false;
  if (state.radarPlayTimer) {
    clearInterval(state.radarPlayTimer);
    state.radarPlayTimer = null;
  }
  if (els.timePlay) els.timePlay.textContent = "Play";
}

function toggleRadarPlay() {
  if (state.wxLayer !== "radar") return;
  if (state.radarPlaying) {
    stopRadarPlay();
    return;
  }
  state.radarPlaying = true;
  if (els.timePlay) els.timePlay.textContent = "Pause";
  state.radarPlayTimer = setInterval(() => {
    const frames = radarFrames();
    if (!frames.length) return;
    state.radarFrame = (state.radarFrame + 1) % frames.length;
    if (els.timeRange) els.timeRange.value = String(state.radarFrame);
    applyWeatherLayer();
  }, 450);
}

function renderWxExtras() {
  if (!els.wxExtras) return;
  const bits = [];
  const checked = state.windOverlay ? " checked" : "";
  bits.push(`<label class="layer-opt"><input type="checkbox" id="wind-overlay-toggle"${checked} /> Wind animation</label>`);
  if (state.wxLayer === "clouds") {
    bits.push('<span class="layer-label">Level</span>');
    for (const band of CLOUD_BANDS) {
      bits.push(`<button type="button" class="wx-mini${state.cloudBand === band.id ? " active" : ""}" data-cloud-band="${band.id}">${band.label}</button>`);
    }
  }
  if (state.wxLayer === "satellite") {
    const cat = window.WindMap?.satelliteCatalog?.() || {};
    bits.push('<span class="layer-label">Source</span>');
    for (const [id, sat] of Object.entries(cat)) {
      bits.push(`<button type="button" class="wx-mini${state.satelliteId === id ? " active" : ""}" data-sat="${id}">${escapeHtml(sat.label)}</button>`);
    }
  }
  if (state.wxLayer === "cloudbase") {
    bits.push('<span class="hint">Convective cloud base from Open-Meteo (not a general ceiling). Gaps show where the model has no convective base.</span>');
  }
  if (state.wxLayer === "radar" && state.radar && !state.radar.nowcastAvailable) {
    bits.push('<span class="hint">Nowcast and infrared satellite are not on the free RainViewer feed (withdrawn 1 Jan 2026).</span>');
  }
  els.wxExtras.innerHTML = bits.join("");
  const toggle = document.getElementById("wind-overlay-toggle");
  if (toggle) {
    toggle.addEventListener("change", () => {
      state.windOverlay = toggle.checked;
      if (window.WindMap) window.WindMap.setWindVisible(state.windOverlay);
      updateMapCopy();
    });
  }
}

function setWxLayer(id) {
  if (!WX_LAYERS[id]) return;
  const prev = state.wxLayer;
  state.wxLayer = id;
  const conf = WX_LAYERS[id];
  state.windOverlay = conf.defaultWind;
  if (id !== "radar") stopRadarPlay();
  if (id === "radar" && state.radar) {
    const frames = radarFrames();
    state.radarFrame = Math.max(0, frames.length - 1);
  }
  if (id === "satellite" && !state.satelliteDate && window.WindMap?.utcDateStamp) {
    state.satelliteDate = window.WindMap.utcDateStamp(0);
  }
  document.querySelectorAll(".wx-layer").forEach((btn) => {
    const on = btn.dataset.wx === id;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  if (prev !== id && (id === "radar" || prev === "radar")) {
    /* keep forecast index as-is */
  }
  applyWeatherLayer();
}

function fmtKt(v) {
  return v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(1)} kt`;
}
function fmtDir(v) {
  return v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}°`;
}
function fmtTemp(v) {
  return v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(1)} °C`;
}
function fmtMm(v) {
  return v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(1)} mm`;
}
function fmtPct(v) {
  return v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}%`;
}
function fmtVis(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const m = Number(v);
  if (m >= 10000) return `${(m / 1000).toFixed(0)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}
function fmtBase(v) {
  if (v == null || Number.isNaN(Number(v)) || Number(v) < 0) return "—";
  const m = Number(v);
  const ft = Math.round(m * 3.28084 / 50) * 50;
  return `${ft.toLocaleString("en-GB")} ft (${Math.round(m)} m)`;
}

function valuesAtTime(hourlyOrSample, times, timeIso) {
  if (!hourlyOrSample) return null;
  const idx = Math.max(0, (times || []).findIndex((t) => t === timeIso));
  const pick = (name) => {
    const arr = hourlyOrSample[name];
    if (Array.isArray(arr)) return arr[idx];
    return hourlyOrSample[name];
  };
  return {
    wind: pick("wind_speed_10m"),
    dir: pick("wind_direction_10m"),
    gust: pick("wind_gusts_10m"),
    cloud: pick("cloud_cover"),
    low: pick("cloud_cover_low"),
    mid: pick("cloud_cover_mid"),
    high: pick("cloud_cover_high"),
    precip: pick("precipitation"),
    temp: pick("temperature_2m"),
    vis: pick("visibility"),
    base: pick("convective_cloud_base"),
  };
}

function renderPointReadout(opts = {}) {
  const el = els.pointReadout;
  if (!el) return;
  const point = state.clickPoint;
  if (!point) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const timeIso = state.wxLayer === "radar" || state.wxLayer === "satellite"
    ? state.forecast?.times?.[0]
    : currentLayerTime();
  let vals = null;
  let source = "Weather data by Open-Meteo.com";
  if (state.pointWx?.hourly && !state.pointWx.error) {
    const iso = timeIso || state.pointWx.times?.[0];
    vals = valuesAtTime(state.pointWx.hourly, state.pointWx.times, iso);
    source = state.pointWx.attribution || source;
  } else if (window.WindMap?.sampleForecast && timeIso) {
    const idx = (state.forecast?.times || []).indexOf(timeIso);
    const sample = window.WindMap.sampleForecast(point.lat, point.lon, idx < 0 ? 0 : idx);
    if (sample) vals = valuesAtTime(sample, [sample.time], sample.time);
    source = "Interpolated from the Open-Meteo grid · Weather data by Open-Meteo.com";
  }
  const when = formatHourLabel(timeIso || currentLayerTime(), { withOffset: state.wxLayer !== "radar" });
  const loading = opts.loading && !vals ? "<p class=\"muted\">Loading point forecast…</p>" : "";
  const err = state.pointWx?.error && !vals ? `<p class="error">Could not load point forecast: ${escapeHtml(state.pointWx.error)}</p>` : "";
  const body = vals
    ? `<p>Wind ${escapeHtml(fmtKt(vals.wind))} from ${escapeHtml(fmtDir(vals.dir))} · gust ${escapeHtml(fmtKt(vals.gust))}</p>
       <p>Cloud ${escapeHtml(fmtPct(vals.cloud))} (L ${escapeHtml(fmtPct(vals.low))} / M ${escapeHtml(fmtPct(vals.mid))} / H ${escapeHtml(fmtPct(vals.high))})</p>
       <p>Precip ${escapeHtml(fmtMm(vals.precip))} · Temp ${escapeHtml(fmtTemp(vals.temp))}</p>
       <p>Vis ${escapeHtml(fmtVis(vals.vis))} · Conv. base ${escapeHtml(fmtBase(vals.base))}</p>`
    : loading || err || "<p class=\"muted\">Tap values appear when the forecast grid has loaded.</p>";
  el.innerHTML = `
    <button type="button" class="point-close" aria-label="Close point readout">&times;</button>
    <h3>${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}</h3>
    <p class="muted">${escapeHtml(when)}</p>
    ${body}
    <p class="pop-src">${escapeHtml(source)}</p>`;
}

function setMobileTab(tab) {
  state.mobileTab = tab;
  document.body.classList.toggle("is-map-tab", tab === "map");
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  if (tab === "map" && window.WindMap) window.WindMap.invalidate();
}


async function init() {
  tickClock();
  setInterval(tickClock, 1000);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW register failed", err));
  }
  setupInstall();
  try {
    const res = await fetch("/api/meta");
    if (res.ok) {
      const meta = await res.json();
      state.airports = { ...FALLBACK_AIRPORTS, ...(meta.airports || {}) };
      state.webcams = meta.webcams || [];
      if (meta.presets?.length) state.presets = meta.presets;
      if (meta.notams && !state.notams) state.notams = { ...meta.notams, notams: [], ids: state.ids };
      state.airspaceMeta = meta.airspace || null;
    }
  } catch {
    /* built-in presets still work */
  }
  renderPresets();
  setMapMode("skybrief");
  if (window.WindMap) {
    window.WindMap.ensure();
    window.WindMap.onPoint(onMapPoint);
    state.satelliteDate = window.WindMap.utcDateStamp(0);
  }
  document.querySelectorAll(".wx-layer").forEach((btn) => {
    btn.addEventListener("click", () => setWxLayer(btn.dataset.wx));
  });
  if (els.wxExtras) {
    els.wxExtras.addEventListener("click", (event) => {
      const band = event.target.closest("[data-cloud-band]");
      if (band) {
        state.cloudBand = band.dataset.cloudBand;
        applyWeatherLayer();
        return;
      }
      const sat = event.target.closest("[data-sat]");
      if (sat) {
        state.satelliteId = sat.dataset.sat;
        applyWeatherLayer();
      }
    });
  }
  if (els.timeRange) els.timeRange.addEventListener("input", onTimeInput);
  if (els.timePlay) els.timePlay.addEventListener("click", toggleRadarPlay);
  if (els.pointReadout) {
    els.pointReadout.addEventListener("click", (event) => {
      if (event.target.closest(".point-close")) {
        els.pointReadout.hidden = true;
      }
    });
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMobileTab(btn.dataset.tab));
  });
  setMobileTab(state.mobileTab || "map");
  setWxLayer(state.wxLayer);
  document.querySelectorAll("[data-layer]").forEach((input) => {
    input.addEventListener("change", () => {
      if (window.WindMap) window.WindMap.setLayerVisible(input.dataset.layer, input.checked);
    });
  });
  const params = new URLSearchParams(window.location.search);
  if (els.dep) els.dep.value = (params.get("dep") || "").toUpperCase();
  if (els.dest) els.dest.value = (params.get("dest") || "").toUpperCase();
  if (els.alts) els.alts.value = (params.get("alts") || "").toUpperCase();
  els.input.value = params.get("ids") || els.input.value || "FAOR";
  const wxParam = (params.get("wx") || params.get("layer") || "").toLowerCase();
  if (WX_LAYERS[wxParam]) setWxLayer(wxParam);
  const plat = Number(params.get("lat"));
  const plon = Number(params.get("lon"));
  if (Number.isFinite(plat) && Number.isFinite(plon)) {
    state.clickPoint = { lat: plat, lon: plon };
  }
  applyIdsFromForm();
  loadAirspaceLayer();
  if (state.clickPoint && els.droneToggle) {
    els.droneToggle.checked = true;
    if (window.WindMap) window.WindMap.setDroneEnabled(true);
    onMapPoint(state.clickPoint);
  }
  scheduleRefresh();
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyIdsFromForm();
});
els.refresh.addEventListener("click", () => {
  loadWeather({ refresh: true });
  loadWind();
  loadForecast();
  loadRadar();
  loadNotams({ refresh: true });
  loadSigmets({ refresh: true });
});
els.presets.addEventListener("click", (event) => {
  const routeBtn = event.target.closest("[data-dep],[data-dest]");
  if (routeBtn && (routeBtn.dataset.dep || routeBtn.dataset.dest)) {
    applyRoutePreset({
      dep: routeBtn.dataset.dep,
      dest: routeBtn.dataset.dest,
      alts: routeBtn.dataset.alts,
      ids: routeBtn.dataset.ids,
    });
    return;
  }
  const btn = event.target.closest("[data-ids]");
  if (btn) {
    if (els.dep) els.dep.value = "";
    if (els.dest) els.dest.value = "";
    if (els.alts) els.alts.value = "";
    els.input.value = btn.dataset.ids;
    applyIdsFromForm();
  }
});
els.focusRow.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-focus]");
  if (btn) setFocus(btn.dataset.focus);
});
document.querySelectorAll(".map-tab").forEach((btn) => {
  btn.addEventListener("click", () => setMapMode(btn.dataset.map));
});
if (els.pdfNotams) {
  els.pdfNotams.addEventListener("change", () => {
    state.includeNotamsInPdf = els.pdfNotams.checked;
    updatePdfLink();
  });
}
if (els.pdfSigmets) {
  els.pdfSigmets.addEventListener("change", () => {
    state.includeSigmetsInPdf = els.pdfSigmets.checked;
    updatePdfLink();
  });
}
if (els.pdfAirspace) {
  els.pdfAirspace.addEventListener("change", () => {
    state.includeAirspaceInPdf = els.pdfAirspace.checked;
    updatePdfLink();
  });
}
if (els.droneToggle) {
  els.droneToggle.addEventListener("change", () => {
    if (window.WindMap) window.WindMap.setDroneEnabled(els.droneToggle.checked);
    if (!els.droneToggle.checked) {
      state.droneQuery = null;
      els.dronePanel.hidden = true;
    } else if (state.clickPoint) {
      loadDronePoint(state.clickPoint);
    } else {
      renderDronePanel();
    }
  });
}

init();
