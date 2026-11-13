# Skybrief — Pilot and drone briefing desk (PWA)

A small, installable website for a South African route or area briefing: live METAR and TAF, AWC international SIGMETs for the FAJA and FACA FIRs, a Leaflet weather-and-airspace map (rain radar, satellite, and Open-Meteo forecast layers), an optional Windy tab, and a text PDF you can save offline. Live NOTAM text appears when a legitimate API is configured; otherwise the official File2Fly link stays on the page.

Default view is a route (for example departure **FACT**, destination **FAOR**, alternate **FALE**) plus any extra ICAO codes in the free list. You can also load a comma-separated list only, such as `FAOR,FACT,FALE`.

**This is not an official briefing.** Official South African meteorological products are from [SAWS](https://aviation.weathersa.co.za/). Official NOTAMs, PIBs and flight-plan filing are from [ATNS File2Fly](https://file2fly.atns.co.za/aes/login.jsp) (free registration). The airspace layer is a gross representation from the [ATNS RSA DATA KMZ](https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D) and is **not for navigation**. The drone overlay is a **planning aid, not permission to fly**. Do not use this site as the sole source for a flight decision.

## What the site does

- Installs as a **Progressive Web App** (manifest, icons, service worker). The worker caches the app shell and, with a network-first policy, the last successful briefing API responses and PDF so a recent pack can be reopened offline. Add to Home Screen works on Android Chrome (install prompt) and on iOS Safari (Share → Add to Home Screen). A2HS needs **HTTPS**, except on `localhost`.
- Builds a **route or area briefing** on one screen: departure, destination, alternates, and a free ICAO list. Airport cards are labelled departure / destination / alternate.
- Proxies the [Aviation Weather Center API](https://aviationweather.gov/data/api/) (`/metar`, `/taf`, and international SIGMETs at `/isigmet`) through a small Node backend so the browser is not blocked by AWC’s lack of CORS. METAR/TAF sets are cached for **5 minutes**. SIGMETs for **FACA** and **FAJA** (and **FAJO** when issued) are cached for **5 minutes**. AWC’s official limit is **100 requests/minute**.
- Draws a **Skybrief weather and airspace map** (the default): [Leaflet](https://leafletjs.com/) with a light [Esri World Light Gray Canvas](https://www.esri.com/) basemap (CARTO Positron public tiles currently require an API key and watermark the map). A layer switcher offers:
  - **Wind** — 10 m Open-Meteo grid around the loaded airports (arrows point **downwind**, coloured by speed; particle animation). The local grid refreshes about every **15 minutes**. A time slider can also show forecast wind out to **+48 h** from the national grid.
  - **Rain radar** — live composite precipitation tiles from the free [RainViewer Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html) (about 2 hours of past frames, 10-minute steps, Universal Blue colour scheme, max zoom 7). Playback animates those frames. Nowcast and infrared satellite were withdrawn from the free API on **1 Jan 2026**; the app will use them again if the feed lists frames.
  - **Satellite** — daily [NASA EOSDIS GIBS](https://worldview.earthdata.nasa.gov/) imagery (MODIS Terra/Aqua true colour, plus night-time Band 31 infrared). A date slider covers the last 7 days.
  - **Forecast fields** on a 1° grid over South Africa from Open-Meteo, cached for **15 minutes**: total / low / mid / high **cloud cover**, **precipitation**, **temperature**, **wind gusts**, **visibility**, and **convective cloud base** (not a general ceiling). A time slider runs from now to **+48 h**.
  - Each layer has a legend. Tap the map for a point readout (wind, gusts, cloud, precip, temperature, visibility, convective cloud base) at that point and time, from a precise Open-Meteo point forecast (`/api/point`).
  Airport markers still show METAR wind and flight category (VFR / MVFR / IFR / LIFR).
- Overlays **ATNS RSA airspace** converted server-side from the official KMZ to GeoJSON (cached in `data/`). Layers are toggleable by class: CTR, TMA, ATZ, CTA, restricted, prohibited, danger, aerodromes (helistops optional). Click a polygon or point for a popup with name, class and limits. The bundled cycle is **29OCT2026** (1 142 features). This is a gross representation only, not for navigation or automated flight guidance, and it is not a live DABS / NOTAM activation layer.
- Offers a **drone planning overlay**: 10 km rings around published aerodromes, plus a click-to-check flag for “within 10 km of an aerodrome” and “inside surface controlled airspace (CTR/ATZ)”. Copy cites current SA-CAR **101.05.10(3)** and **101.05.3** (wording checked 12 Nov 2026 on acts.co.za; 101.05.10 as substituted by the 26th Amendment, GG48228, 17 March 2023). UASOC holders may operate if authorised by the Director. This is a planning aid, not permission and not an official briefing.
- Keeps the official **Windy** embed as an optional tab (`embed.windy.com/embed2.html`, wind overlay, particles on). The Windy logo stays on the widget and should remain clickable.
- Auto-refreshes METAR/TAF and SIGMETs every 5 minutes, the wind grid every 15 minutes, and NOTAMs every 20 minutes, and shows **last updated** in **SAST (Africa/Johannesburg)** and **UTC**.
- Embeds an official Windy webcam player only when a camera ID has been verified (currently Table Mountain, when FACT or nearby Cape Town codes are loaded). Other airports get a Windy webcams link. This site does not scrape Windy’s webcam API.
- Shows **live NOTAM text** when you configure one legitimate API on the server (see below). The text is cached server-side for **20 minutes**. This site does **not** scrape File2Fly, Windy, or any site whose terms forbid it. Official RSA NOTAMs remain File2Fly.
- Offers **Download METAR/TAF PDF** by default (`/api/pdf?dep=FACT&dest=FAOR&alts=FALE`) — text only, with airports, route, timestamps in SAST and UTC, and raw + decoded METAR/TAF. Optional checkboxes add SIGMETs, NOTAMs (or a File2Fly setup note if no credentials), and airspace/drone notes for the last point clicked on the map. The full pack uses a `briefing-…` filename; the default stays `metar-taf-…`. The live map and webcams are not in the PDF.

## Run it locally

You need Node.js 18 or newer.

```bash
cd pilot-weather-site
npm install
npm start
```

Then open [http://127.0.0.1:3847](http://127.0.0.1:3847). Example route:

`http://127.0.0.1:3847/?dep=FACT&dest=FAOR&alts=FALE`

A click-to-check drone point can be passed as `lat` and `lon` (decimal degrees). You can still use `?ids=FAOR,FACT,FALE` for a list-only briefing.

Change the port with `PORT=8080 npm start`.

To enable live NOTAMs, copy `.env.example` to `.env`, add credentials for one provider, and restart.

Useful API routes:

- `GET /api/weather?dep=FACT&dest=FAOR&alts=FALE` — JSON METAR + TAF (or `?ids=FAOR,FACT`; add `&refresh=1` to bypass the cache)
- `GET /api/sigmets?dep=FACT&dest=FAOR` — AWC international SIGMETs for the route FIRs (default FAJA and FACA)
- `GET /api/wind?ids=FAOR,FACT` — Open-Meteo wind grid around the loaded airports
- `GET /api/forecast` — Open-Meteo hourly forecast grid over South Africa (now to +48 h; 15-minute cache)
- `GET /api/point?lat=-26.14&lon=28.25` — exact-point hourly forecast (same fields; 15-minute cache, coordinates rounded to 0.05°)
- `GET /api/radar` — RainViewer weather-maps metadata (past frames, tile template, attribution; 2-minute cache)
- `GET /api/notams?ids=FAOR,FACT` — live NOTAMs if a provider is configured; otherwise a setup guide (`&refresh=1` bypasses the cache)
- `GET /api/airspace` — ATNS subset GeoJSON plus cycle metadata
- `GET /api/airspace?lat=-33.9715&lon=18.6021` — point query (airspace, 10 km aerodromes, Part 101 flags). `GET /api/airspace/query` is an alias on the Express server.
- `GET /api/briefing?dep=FACT&dest=FAOR&alts=FALE` — combined route payload (Express server)
- `GET /api/pdf?dep=FACT&dest=FAOR&alts=FALE` — METAR/TAF-only PDF. Add `&sigmets=1`, `&notams=1`, and `&airspace=1&lat=…&lon=…` for a full pack.
- `GET /api/meta` — airport coordinates, verified webcams, presets, NOTAM configuration status, airspace cycle
- `GET /api/health` — liveness check, airspace cycle and feature count

## Install as a PWA / Add to Home Screen

Skybrief is a standalone web app, not a store app.

- **Android (Chrome):** after the first visit over HTTPS, Chrome may show an install banner, or you can use the browser menu **Install app** / **Add to Home Screen**.
- **iOS (Safari):** tap **Share**, then **Add to Home Screen**. (Chrome and in-app browsers on iOS cannot install a PWA the same way.) The page includes `apple-touch-icon` and `apple-mobile-web-app-capable` meta tags so the icon launches full screen.
- **Desktop Chrome / Edge:** Install page / app from the address bar when the criteria are met.

Requirements: a **service worker**, a **manifest**, 192 and 512 icons, and **HTTPS** (or `http://localhost` / `http://127.0.0.1`). HTTP on a LAN IP will load in the browser but typically will not offer install.

The service worker (`public/sw.js`, cache name `skybrief-v1.3.0`) precaches the app shell (HTML, CSS, JS, Leaflet, icons). API GET requests, including `/api/pdf`, use **network-first** and store the last successful response, so a recent METAR/TAF or briefing pack can still open if the network drops. The worker does not invent live weather when nothing was cached. Bump the cache name in `sw.js` after a UI release so clients fetch the new shell.

## Hosting as a PWA (Render or Railway recommended)

The app is a static front end plus a tiny API that must run **on a server**. AWC does not allow browser CORS, so you cannot host the HTML alone on a static file host without the proxy. For an installable PWA, serve everything over **public HTTPS**.

Render and Railway run the Express server as a web service and are the straightforward way to host the full app (in-memory airspace, `/api/briefing`, `/api/health`, service worker with the correct `Cache-Control: no-cache` on `/sw.js`). The server already listens on `process.env.PORT` (default 3847) and `0.0.0.0`.

This repo includes a **Render Blueprint** at `render.yaml`: a Node web service, `npm install` / `npm start`, and a health check on `/api/health`. Render injects `PORT` automatically.

1. Push this folder to a Git repository (include `data/airspace.geojson` and `data/airspace-meta.json`; do not commit `.env` or `node_modules`). The airspace GeoJSON is required at runtime and is already in `data/`.
2. On Render, either **New → Blueprint** from the repo (uses `render.yaml`) or create a **Web Service** by hand.
3. Build command: `npm install`
4. Start command: `npm start`
5. Environment: Node 18 or newer (`NODE_VERSION=18` is set in `render.yaml`). Set `PORT` only if the platform does not inject it (Render and Railway usually do).
6. Add any NOTAM credentials (`AUTOROUTER_USER` / `AUTOROUTER_PASSWORD`, or FAA / ICAO keys) in the host’s environment settings.
7. Use the platform’s public HTTPS URL. Outbound HTTPS to `aviationweather.gov`, `api.open-meteo.com`, `api.rainviewer.com` / `tilecache.rainviewer.com`, `gibs.earthdata.nasa.gov`, and (if configured) the NOTAM provider must be allowed (it is, on both platforms).
8. Open the HTTPS URL once in Chrome or Safari and use Add to Home Screen as above. Confirm the manifest at `/manifest.webmanifest` and the worker at `/sw.js`.

No database is required. Memory and CPU can stay on the free or smallest paid instance for personal use. The bundled airspace GeoJSON is about 535 KB.

If you later ship a new ATNS cycle, run `npm run convert-airspace` (or `python3 scripts/convert-atns.py`) in this folder, commit the updated `data/` files, and redeploy.

### Vercel

This repo includes serverless functions in `api/weather.js`, `api/wind.js`, `api/notams.js`, `api/sigmets.js`, `api/airspace.js`, `api/pdf.js`, and `api/meta.js`, plus `vercel.json`. The static files in `public/` (including the manifest and `sw.js`) are served automatically. `/api/briefing` and `/api/health` are Express-only; the page itself uses the individual routes, which are covered.

```bash
npm i -g vercel
vercel
```

Or import the Git repo in the Vercel dashboard. Framework preset can be “Other”. Add NOTAM env vars in the project settings if you want live NOTAM text. Confirm the deployment is HTTPS before testing Add to Home Screen.

### Netlify

This repo includes `netlify.toml` and functions under `netlify/functions/`. Publish directory is `public`. Redirects map `/api/weather`, `/api/wind`, `/api/notams`, `/api/sigmets`, `/api/airspace`, `/api/pdf`, and `/api/meta` to the functions.

```bash
npm i -g netlify-cli
netlify deploy --build
```

Or import the Git repo in the Netlify dashboard. Enable functions (the config already points at `netlify/functions`). Add NOTAM env vars in site settings if needed.

### Any VPS or Node host

Same as local: `npm install && npm start` behind Caddy, nginx, or the host’s HTTPS proxy. Bind address is `0.0.0.0`. Set `PORT` as needed. Terminate TLS at the proxy so Add to Home Screen can work.

## ATNS airspace data

Source: official [RSA Airspaces in 3D / RSA DATA KMZ](https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D) (zip: `RSA DATA.zip`). ATNS permits free copy and adaptation of this product with attribution, and states that it is a **gross representation only**, offered with **no warranty**, and **must not be used for navigation or automated flight guidance**.

The repo already contains a filtered GeoJSON built from the **29OCT2026** cycle (`RSA DATA -29OCT2026.kmz`): CTR, TMA, ATZ, CTA, restricted, prohibited and danger areas, plus aerodrome and helistop points. Some published names in the KMZ are sparse (for example a helistop labelled only with a number). The layer is **AIRAC-static**: it does not show temporary or NOTAM-activated status. Always verify against the AIP, SUP and File2Fly.

To rebuild after a new cycle:

```bash
# optional path to a downloaded RSA DATA.zip; otherwise the script downloads it
python3 scripts/convert-atns.py
# or: python3 scripts/convert-atns.py /path/to/RSA_DATA.zip
# or: npm run convert-airspace
```

This writes `data/airspace.geojson` and `data/airspace-meta.json`. Restart the server (or redeploy) to load the new files.

## Drone planning overlay and SA-CAR Part 101

Click the map (or pass `lat` / `lon` in the URL) with **10 km rings + click check** enabled. The panel lists published aerodromes or helistops within 10 km, airspace containing the point (name, class, limits), and flags for the 10 km rule and for surface controlled airspace.

Cited wording, checked 12 Nov 2026 against the Civil Aviation Regulations as published on acts.co.za:

- **101.05.10(3)** (as substituted by the 26th Amendment, GG48228, 17 March 2023): unless otherwise authorised by the Director, a UA shall not be operated (a) above 400 ft above the surface; (b) within a radius of 10 km from an aerodrome reference point; (c) within restricted or prohibited airspace; or (d) adjacent to or above a nuclear power plant, prison, police station, crime scene, court of law, national key point or strategic installation.
- **101.05.3(1)–(2)**: a UAS shall not be operated in controlled airspace except by a UASOC holder as approved by the Director in the operations manual. The Director may approve a UA operation in controlled airspace only in VMC in an ATZ and CTR below 400 ft, subject to Document SA-CATS 101.

The 33rd Amendment (GG55226, 21 August 2026) updated private-operations provisions in 101.01.2; it was not shown to change 101.05.10 or 101.05.3. This overlay does not grant approval, does not check sensitive sites in (d), and does not replace your UASOC, ops manual, or a File2Fly / SACAA briefing.

## Live NOTAMs — account and key

No no-key legitimate API was found that returns South African (FA\*\*) NOTAM text. Without credentials, `/api/notams` still responds `200` with `configured: false` and the page shows File2Fly / Windy links plus setup steps. The integration is ready: set environment variables and restart.

The server tries providers in this order when more than one is configured: **autorouter**, then **ICAO**, then **FAA**. It also queries the FIR (`FAJA` or `FACA`) alongside the aerodrome.

### 1. autorouter (recommended for FA\*\*)

NOTAMs come from Eurocontrol EAD (International NOTAM Operations). South Africa (NOF FAJN) publishes international series **A, B, F and T** into EAD, so FA\*\* aerodrome NOTAMs marked for international distribution should appear. National-only series may be missing.

1. Create a **free** account at [https://www.autorouter.aero/](https://www.autorouter.aero/).
2. Open a **support ticket** and ask them to **enable API access** on your account. OAuth will fail until they do this.
3. Set `AUTOROUTER_USER` to your account email and `AUTOROUTER_PASSWORD` to your password.

### 2. FAA NOTAM API (free portal account)

The official endpoint is `https://external-api.faa.gov/notamapi/v1/notams` (unauthenticated requests return **401**). Coverage of international ICAO locations such as FAOR/FACT is **not officially guaranteed** — some write-ups say the US system holds international NOTAMs, others say it is US-only. Confirm with a real FAOR query after you have a key.

1. Register at [https://api.faa.gov](https://api.faa.gov) (external users create a portal user id and password).
2. After login, open APIs, find the NOTAM API, and click **Request Access**. Choose the **Production** instance and name your application.
3. When the request is approved, open **My Applications** and copy `client_id` and `client_secret`.
4. Set `FAA_CLIENT_ID` and `FAA_CLIENT_SECRET`.

### 3. ICAO API Data Service

Official ICAO Stored / Realtime NOTAM APIs. Registration includes **100 free calls**; further use is paid (booster packs or an unlimited plan). See [https://www.icao.int/api-data-service-2](https://www.icao.int/api-data-service-2). Set `ICAO_API_KEY`.

On Render, Railway, Vercel or Netlify, add the same variables in the host’s environment settings. Do not commit `.env`.

## Open-Meteo terms and limits

The free Open-Meteo API is for **non-commercial** use and requires visible attribution: **“Weather data by Open-Meteo.com”** (CC BY 4.0). The page and map include that credit.

Published free-tier limits (confirm on [open-meteo.com](https://open-meteo.com/en/features)): **10 000 calls/day**, **5 000/hour**, **600/minute**. A request with multiple coordinates counts as one call **per location**. Skybrief caps the local wind grid at about **80 points** (a 5×5 grid around each airport, ~0.32° spacing, de-duplicated). The national forecast grid is a 1° mesh over South Africa (about **252 points**), fetched in batches of 100 and cached for 15 minutes so all users share one payload. Point readouts use a separate cached `/api/point` call. Together this stays well under the free-tier cap for personal use.

Commercial hosting needs Open-Meteo’s paid endpoint (`customer-api.open-meteo.com`) and an API key.

## RainViewer terms

Live rain radar uses the free [RainViewer Weather Maps API](https://www.rainviewer.com/api.html), which is for **personal, educational, and small-scale community use**. Attribution is required: **“Weather data by RainViewer”** with a link to [rainviewer.com](https://www.rainviewer.com/). The page, map, and legends include that credit.

The free feed provides about **2 hours** of past radar at 10-minute steps, **Universal Blue** only (colour id 2), and a maximum tile zoom of **7**. As of **1 Jan 2026**, nowcast (future) radar and infrared satellite were withdrawn from the free API; Skybrief still reads those arrays and will show them if they return. There is no SLA. Do not use this integration for a high-volume commercial product without arranging terms with RainViewer.

## NASA GIBS terms

The satellite layer uses public [NASA EOSDIS GIBS](https://nasa-gibs.github.io/gibs-api-docs/) WMTS tiles (Web Mercator). Please cite **NASA EOSDIS GIBS** and [NASA Worldview](https://worldview.earthdata.nasa.gov/) when using the imagery — the map attribution and footer do this. Imagery is typically daily and can lag; today’s pass may still be incomplete.

## Windy terms of use

The official embeddable widget (optional tab) must keep the **Windy logo visible and clickable**. Windy’s terms say the widget is **intended for media use** and is **not allowed to be used by weather apps and other commercial websites**. This project is meant as a personal briefing desk.

If you want to run this as a commercial weather product, do not rely on the free widget. Use the licensed [Windy Map Forecast API](https://api.windy.com/map-forecast/pricing). The Professional plan is listed at **990 € per year**, plus an optional **1 000 €** for ECMWF (for internal use). The Testing tier is not for production. Confirm current pricing on Windy’s site before you buy.

Windy also offers a [Webcams API](https://api.windy.com/webcams/docs) if you want to look up nearby cameras dynamically (free embed/link tier; a Professional plan exists, price not listed on the public pricing page at the time of writing).

## Limits and honesty

- This is a convenience pack, not an official SAWS or File2Fly briefing, and not a clearance or approval to fly (manned or UAS).
- Flight category (VFR / MVFR / IFR / LIFR) comes from the Aviation Weather Center when present. It is a useful shorthand, not a clearance.
- Only a few South African aerodromes issue METAR/TAF. Codes without a station will show “no METAR/TAF loaded”.
- AWC international SIGMETs are included when they mention FAJA, FACA or (when issued) FAJO. They are not a complete SIGMET/AIRMET briefing and they change frequently.
- The Skybrief wind field is a **10 m** Open-Meteo forecast grid, not a METAR observation and not a licensed aviation forecast. Use it as a visualisation, not as official wind for dispatch.
- Rain radar is a non-official composite and only appears where RainViewer has coverage; it is not a SAWS radar product. Forecast precipitation, cloud, temperature, gusts, visibility and convective cloud base are Open-Meteo model fields, not TAFs or official aviation forecasts. Convective cloud base is not a general cloud ceiling.
- Satellite imagery from NASA GIBS is daily (or night-time IR) and can lag.
- The ATNS airspace layer is a static AIRAC snapshot (currently 29OCT2026), a gross representation, and not for navigation. It may omit or simplify shapes, and names in the source KMZ are sometimes incomplete. Temporary restrictions and NOTAM activations are not applied.
- The 10 km / controlled-airspace check is a planning aid. It does not list every farm strip, sensitive site, or permission status, and it does not replace SACAA, File2Fly, the AIP, or your operations manual.
- Webcam coverage on this page is deliberately incomplete: only verified Windy IDs are embedded.
- Live NOTAMs, when configured, are provided as received from the chosen API and may be incomplete (especially national-only series not distributed internationally). File2Fly is the official RSA self-briefing source. Windy’s airport page is convenient, not official.
- Weather data is provided as received from AWC / Open-Meteo and may be delayed or incomplete.
