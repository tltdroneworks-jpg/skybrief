const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DATA_DIR = path.join(__dirname, "..", "data");
const GEOJSON_PATH = path.join(DATA_DIR, "airspace.geojson");
const META_PATH = path.join(DATA_DIR, "airspace-meta.json");
const CONVERT_SCRIPT = path.join(__dirname, "..", "scripts", "convert-atns.py");

const SOURCE_PAGE = "https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D";
const DOWNLOAD_URL =
  "https://www.atns.com/Aeronautical%20Information%20Management/RSA%20Airspaces%20in%203D/RSA%20DATA.zip";

const FALLBACK_PART101 = {
  citationDate:
    "Wording checked 12 Nov 2026 against the Civil Aviation Regulations as published on acts.co.za (101.05.10 as substituted by the 26th Amendment, GG48228, 17 March 2023; 101.05.3 as currently published).",
  generalRestrictions:
    "SA-CAR 101.05.10(3): Unless as otherwise authorised by the Director, a UA shall not be operated — (a) above 400 ft above the surface; (b) within a radius of 10 km from an aerodrome reference point; (c) within restricted or prohibited airspace; or (d) adjacent to or above a nuclear power plant, prison, police station, crime scene, court of law, national key point or strategic installation.",
  controlledAirspace:
    "SA-CAR 101.05.3(1): A UAS shall not be operated in controlled airspace, except by a holder of a UASOC and as approved by the Director in the UASOC's operations manual. 101.05.3(2): The Director may approve a UA operation in controlled airspace only in VMC in an ATZ and CTR below 400 ft, and subject to Document SA-CATS 101.",
  planningAid:
    "Planning aid only — not permission to fly and not an official briefing. UASOC holders may operate in otherwise restricted circumstances if authorised by the Director. Always verify against current official sources (SACAA, ATNS File2Fly, the AIP) and your operations manual.",
};

const CONTROLLED = new Set(["ctr", "tma", "atz", "cta"]);
const SURFACEISH = /^(GND|SFC|0\s*FT)/i;

let cache = null;

function loadAirspace() {
  if (cache) return cache;
  if (!fs.existsSync(GEOJSON_PATH)) {
    cache = {
      geojson: { type: "FeatureCollection", features: [] },
      meta: { error: "Airspace GeoJSON is not available. Run scripts/convert-atns.py.", part101: FALLBACK_PART101, sourceUrl: SOURCE_PAGE, downloadUrl: DOWNLOAD_URL },
    };
    return cache;
  }
  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
  const meta = fs.existsSync(META_PATH)
    ? JSON.parse(fs.readFileSync(META_PATH, "utf8"))
    : {};
  if (!meta.part101) meta.part101 = FALLBACK_PART101;
  if (!meta.sourceUrl) meta.sourceUrl = SOURCE_PAGE;
  if (!meta.downloadUrl) meta.downloadUrl = DOWNLOAD_URL;
  cache = { geojson, meta };
  return cache;
}

function refreshFromAtns() {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [CONVERT_SCRIPT], { cwd: path.join(__dirname, "..") });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || out.trim() || `convert-atns.py exited ${code}`));
        return;
      }
      cache = null;
      resolve(loadAirspace());
    });
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonContains(coords, lon, lat) {
  if (!coords || !coords.length) return false;
  if (!ringContains(coords[0], lon, lat)) return false;
  for (let i = 1; i < coords.length; i++) {
    if (ringContains(coords[i], lon, lat)) return false;
  }
  return true;
}

function featureContains(feature, lon, lat) {
  const g = feature.geometry;
  if (!g) return false;
  if (g.type === "Polygon") return polygonContains(g.coordinates, lon, lat);
  if (g.type === "MultiPolygon") return (g.coordinates || []).some((poly) => polygonContains(poly, lon, lat));
  return false;
}

function lowerLooksSurface(limits) {
  if (!limits) return false;
  const left = String(limits).split(/[-–—]| to /i)[0].trim();
  return SURFACEISH.test(left);
}

function queryPoint(lat, lon, { radiusKm = 10 } = {}) {
  const { geojson, meta } = loadAirspace();
  const features = geojson.features || [];
  const containing = [];
  const nearby = [];
  for (const f of features) {
    const klass = f.properties?.class;
    if (f.geometry?.type === "Point") {
      const [flon, flat] = f.geometry.coordinates;
      const km = haversineKm(lat, lon, flat, flon);
      if (km <= Math.max(radiusKm, 10) + 0.05) {
        nearby.push({
          name: f.properties.name,
          class: klass,
          icao: f.properties.icao || null,
          km: Math.round(km * 10) / 10,
          lat: flat,
          lon: flon,
          description: f.properties.description || "",
        });
      }
      continue;
    }
    if (featureContains(f, lon, lat)) {
      containing.push({
        name: f.properties.name,
        class: klass,
        limits: f.properties.limits || "",
        freq: f.properties.freq || "",
        description: f.properties.description || "",
        surfaceControlled: CONTROLLED.has(klass) && (lowerLooksSurface(f.properties.limits) || klass === "ctr" || klass === "atz"),
      });
    }
  }
  nearby.sort((a, b) => a.km - b.km);
  const controlled = containing.filter((c) => CONTROLLED.has(c.class));
  const restricted = containing.filter((c) => c.class === "restricted" || c.class === "prohibited");
  const danger = containing.filter((c) => c.class === "danger");
  const within10 = nearby.filter((a) => a.km <= 10);
  const flags = {
    within10kmAerodrome: within10.length > 0,
    inControlledAirspace: controlled.length > 0,
    inSurfaceControlled: controlled.some((c) => c.surfaceControlled),
    inRestrictedOrProhibited: restricted.length > 0,
    inDanger: danger.length > 0,
  };
  return {
    lat,
    lon,
    flags,
    nearbyAerodromes: nearby,
    within10km: within10,
    airspace: containing,
    part101: meta.part101 || FALLBACK_PART101,
    source: {
      name: meta.source || "ATNS RSA DATA KMZ",
      cycle: meta.cycle || "",
      sourceUrl: meta.sourceUrl || SOURCE_PAGE,
      attribution: meta.attribution || "",
    },
    planningAid: (meta.part101 || FALLBACK_PART101).planningAid,
  };
}

function airspaceNotes(lat, lon) {
  const q = queryPoint(lat, lon);
  const lines = [];
  lines.push(`Point: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  lines.push("Planning aid only — not permission to fly. Not for navigation.");
  if (q.source.cycle) lines.push(`Airspace source: ATNS RSA DATA KMZ, cycle ${q.source.cycle}.`);
  if (q.flags.within10kmAerodrome) {
    lines.push("Within 10 km of a published aerodrome / helistop (SA-CAR 101.05.10(3)(b)):");
    for (const a of q.within10km) {
      lines.push(`  - ${a.name}${a.icao ? " (" + a.icao + ")" : ""} — ${a.km.toFixed(1)} km`);
    }
  } else {
    lines.push("No published ATNS aerodrome / helistop within 10 km of this point (the dataset may not list every strip or helipad).");
  }
  if (q.airspace.length) {
    lines.push("Airspace containing this point:");
    for (const a of q.airspace) {
      lines.push(`  - ${a.name} [${a.class}]${a.limits ? " " + a.limits : ""}`);
    }
  } else {
    lines.push("No mapped CTR/TMA/ATZ/CTA or FAR/FAP/FAD polygon contains this point in the ATNS subset.");
  }
  if (q.flags.inSurfaceControlled) {
    lines.push("Flag: appears to be inside controlled airspace that begins at or near the surface (CTR/ATZ or similar). SA-CAR 101.05.3 applies.");
  } else if (q.flags.inControlledAirspace) {
    lines.push("Flag: inside or under a mapped TMA/CTA/CTR/ATZ. Check the lower limit — some controlled airspace begins above the surface and may be above a typical 400 ft AGL drone height.");
  }
  if (q.flags.inRestrictedOrProhibited) {
    lines.push("Flag: inside restricted or prohibited airspace (SA-CAR 101.05.10(3)(c)).");
  }
  if (q.flags.inDanger) {
    lines.push("Note: inside a danger area (FAD). Part 101 does not itself prohibit danger areas; treat as a hazard and check NOTAMs.");
  }
  lines.push(q.part101.generalRestrictions);
  lines.push(q.part101.controlledAirspace);
  lines.push(q.part101.planningAid);
  lines.push(q.part101.citationDate);
  return { query: q, text: lines.join("\n") };
}

module.exports = {
  DATA_DIR,
  GEOJSON_PATH,
  META_PATH,
  SOURCE_PAGE,
  DOWNLOAD_URL,
  FALLBACK_PART101,
  loadAirspace,
  refreshFromAtns,
  queryPoint,
  airspaceNotes,
  haversineKm,
};
