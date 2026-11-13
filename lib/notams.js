const { firFor, AIRPORTS } = require("./airports");
const { parseIds } = require("./weather");

const CACHE_MS = 20 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

function configuredProviders() {
  const list = [];
  if (env("AUTOROUTER_USER") && env("AUTOROUTER_PASSWORD")) list.push("autorouter");
  if (env("FAA_CLIENT_ID") && env("FAA_CLIENT_SECRET")) list.push("faa");
  if (env("ICAO_API_KEY")) list.push("icao");
  return list;
}

function setupGuide() {
  return {
    recommended: "autorouter",
    message:
      "No NOTAM API credentials are configured on this server, so live NOTAM text cannot be loaded. The links below remain valid. This site does not scrape File2Fly or Windy.",
    options: [
      {
        id: "autorouter",
        label: "autorouter (recommended for South Africa)",
        why: "NOTAMs come from Eurocontrol EAD (International NOTAM Operations). South Africa (NOF FAJN) publishes international series A, B, F and T into EAD, so FA** aerodrome NOTAMs marked for international distribution should appear. National-only series may be missing.",
        steps: [
          "Create a free account at https://www.autorouter.aero/",
          "Open a support ticket on autorouter and ask them to enable API access on your account (required before OAuth works).",
          "Set AUTOROUTER_USER to your account email and AUTOROUTER_PASSWORD to your password, then restart the server.",
        ],
        env: ["AUTOROUTER_USER", "AUTOROUTER_PASSWORD"],
      },
      {
        id: "faa",
        label: "FAA NOTAM API (free portal account)",
        why: "The official FAA NOTAM API is at https://external-api.faa.gov/notamapi/v1/notams and requires a free developer account. Some descriptions say it includes international NOTAMs held in the US system; others say it is US-only. Coverage of FAOR/FACT is therefore not guaranteed. Confirm with a real FAOR query after you have a key.",
        steps: [
          "Register at https://api.faa.gov (external users create a portal user id and password).",
          "After login, open APIs, find the NOTAM API, and click Request Access. Choose the Production instance and name your application.",
          "When the request is approved, open My Applications and copy client_id and client_secret.",
          "Set FAA_CLIENT_ID and FAA_CLIENT_SECRET, then restart the server.",
        ],
        env: ["FAA_CLIENT_ID", "FAA_CLIENT_SECRET"],
      },
      {
        id: "icao",
        label: "ICAO API Data Service",
        why: "Official ICAO Stored / Realtime NOTAM APIs. Registration includes 100 free calls; further use is paid (booster packs or an unlimited plan). See https://www.icao.int/api-data-service-2",
        steps: [
          "Register at https://www.icao.int/api-data-service-2 and create an API key.",
          "Set ICAO_API_KEY, then restart the server.",
        ],
        env: ["ICAO_API_KEY"],
      },
    ],
  };
}

function locationsFor(ids) {
  const locs = new Set();
  for (const icao of ids) {
    locs.add(icao);
    locs.add(firFor(icao));
  }
  return [...locs];
}

function formatWhen(unixOrIso) {
  if (unixOrIso == null || unixOrIso === "") return "";
  const date = typeof unixOrIso === "number"
    ? new Date(unixOrIso > 1e12 ? unixOrIso : unixOrIso * 1000)
    : new Date(unixOrIso);
  if (Number.isNaN(date.getTime())) return String(unixOrIso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " UTC";
}

function normalise(partial) {
  return {
    id: partial.id || "",
    icao: partial.icao || "",
    locations: partial.locations || (partial.icao ? [partial.icao] : []),
    series: partial.series || "",
    number: partial.number || "",
    year: partial.year || "",
    type: partial.type || "",
    start: partial.start || "",
    end: partial.end || "",
    text: (partial.text || "").replace(/\s+/g, " ").trim(),
    q: partial.q || "",
    fir: partial.fir || "",
    raw: partial.raw || "",
  };
}

let autorouterToken = { value: "", exp: 0 };

async function autorouterLogin() {
  if (autorouterToken.value && Date.now() < autorouterToken.exp - 60_000) {
    return autorouterToken.value;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env("AUTOROUTER_USER"),
    client_secret: env("AUTOROUTER_PASSWORD"),
  });
  const res = await fetch("https://api.autorouter.aero/v1.0/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `autorouter login HTTP ${res.status}`);
  }
  autorouterToken = {
    value: json.access_token,
    exp: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
  return autorouterToken.value;
}

async function fetchAutorouter(ids) {
  const token = await autorouterLogin();
  const itemas = locationsFor(ids);
  const url = new URL("https://api.autorouter.aero/v1.0/notam");
  url.searchParams.set("itemas", JSON.stringify(itemas));
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "100");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 403) {
    autorouterToken = { value: "", exp: 0 };
    throw new Error("autorouter token expired or API access is not enabled on the account.");
  }
  if (!res.ok) throw new Error(`autorouter NOTAM HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.rows || json.notams || [];
  return rows.map((row) => {
    const loc = (row.itema && row.itema[0]) || ids[0];
    const series = row.series || "";
    const number = String(row.number ?? "");
    const year = String(row.year ?? "");
    const type = row.type || "";
    const id = `${series}${String(number).padStart(4, "0")}/${year}`;
    const text = row.iteme || row.text || "";
    return normalise({
      id,
      icao: loc,
      locations: row.itema || [loc],
      series,
      number,
      year,
      type,
      start: formatWhen(row.startvalidity),
      end: formatWhen(row.endvalidity),
      text,
      fir: row.fir || "",
      raw: `${id} NOTAM${type}\nA) ${(row.itema || []).join(" ")}\nB) ${formatWhen(row.startvalidity)}  C) ${formatWhen(row.endvalidity)}\nE) ${text}`,
    });
  });
}

function faaCore(feature) {
  const props = feature.properties || feature;
  return props.coreNOTAMData || props.coreNotamData || props;
}

async function fetchFaaPage(icao, pageNum) {
  const url = new URL("https://external-api.faa.gov/notamapi/v1/notams");
  url.searchParams.set("icaoLocation", icao);
  url.searchParams.set("responseFormat", "geoJson");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("pageNum", String(pageNum));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      client_id: env("FAA_CLIENT_ID"),
      client_secret: env("FAA_CLIENT_SECRET"),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("FAA NOTAM API rejected the credentials (401/403). Check FAA_CLIENT_ID and FAA_CLIENT_SECRET and that access was approved.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FAA NOTAM HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  return res.json();
}

async function fetchFaa(ids) {
  const out = [];
  for (const icao of locationsFor(ids)) {
    let page = 1;
    let pages = 1;
    do {
      const json = await fetchFaaPage(icao, page);
      const features =
        json.data?.features ||
        json.features ||
        json.items ||
        json.notams ||
        [];
      const total = json.totalNotamCount || json.total || features.length;
      const size = json.pageSize || features.length || 100;
      pages = Math.max(1, Math.ceil(total / size));
      for (const feature of features) {
        const core = faaCore(feature);
        const text =
          core.text ||
          core.icaoMessage ||
          core.traditionalMessage ||
          core.translatedText?.formattedText ||
          "";
        const loc = core.icaoLocation || icao;
        const id = core.notamNumber || core.notamID || core.id || "";
        out.push(
          normalise({
            id,
            icao: loc,
            locations: [loc],
            series: String(id).charAt(0) || "",
            number: id,
            start: formatWhen(core.effectiveStart || core.startDate || core.effectiveStartDate),
            end: formatWhen(core.effectiveEnd || core.endDate || core.effectiveEndDate),
            text: String(text),
            raw: String(text),
          })
        );
      }
      page += 1;
    } while (page <= pages && page <= 5);
  }
  return out;
}

async function fetchIcao(ids) {
  const url = new URL("https://applications.icao.int/dataservices/api/notams-realtime-list");
  url.searchParams.set("api_key", env("ICAO_API_KEY"));
  url.searchParams.set("format", "json");
  url.searchParams.set("locations", locationsFor(ids).join(","));
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ICAO NOTAM HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json.notams || json.items || json.data || [];
  return rows.map((row) => {
    const loc = row.location || row.locations || row.icaoId || row.ItemA || ids[0];
    const text = row.all || row.message || row.text || row.itemE || row.e || "";
    const id = row.id || row.notamID || row.NotamID || "";
    return normalise({
      id: String(id),
      icao: Array.isArray(loc) ? loc[0] : String(loc),
      locations: Array.isArray(loc) ? loc : [String(loc)],
      start: formatWhen(row.startDate || row.startValidity || row.startdate),
      end: formatWhen(row.endDate || row.endValidity || row.enddate),
      text: String(text),
      raw: String(text),
    });
  });
}

const FETCHERS = {
  autorouter: { label: "autorouter (Eurocontrol EAD)", fetch: fetchAutorouter },
  faa: { label: "FAA NOTAM API", fetch: fetchFaa },
  icao: { label: "ICAO API Data Service", fetch: fetchIcao },
};

async function loadFromProviders(ids) {
  const providers = configuredProviders();
  const errors = [];
  // Prefer autorouter for FA** coverage when several keys are set.
  const order = ["autorouter", "icao", "faa"].filter((id) => providers.includes(id));
  for (const id of order) {
    try {
      const notams = await FETCHERS[id].fetch(ids);
      return { provider: id, providerLabel: FETCHERS[id].label, notams, errors };
    } catch (err) {
      errors.push({ provider: id, error: err.message || String(err) });
    }
  }
  return { provider: null, providerLabel: null, notams: [], errors };
}

async function getNotams(input, { refresh = false } = {}) {
  const ids = parseIds(input);
  if (!ids.length) {
    const err = new Error("Provide at least one 4-letter ICAO code.");
    err.status = 400;
    throw err;
  }
  const providers = configuredProviders();
  if (!providers.length) {
    return {
      ids,
      configured: false,
      provider: null,
      providerLabel: null,
      locations: locationsFor(ids),
      notams: [],
      fetchedAt: null,
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      setup: setupGuide(),
    };
  }

  const key = [...ids].sort().join(",") + "|" + providers.join("+");
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.payload, cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    const result = await loadFromProviders(ids);
    if (!result.notams.length && result.errors.length) {
      const err = new Error(result.errors.map((e) => `${e.provider}: ${e.error}`).join(" | "));
      err.status = 502;
      throw err;
    }
    const byAirport = {};
    for (const icao of ids) byAirport[icao] = [];
    for (const notam of result.notams) {
      const targets = ids.filter(
        (icao) =>
          notam.icao === icao ||
          (notam.locations || []).includes(icao) ||
          (notam.locations || []).includes(firFor(icao)) ||
          notam.fir === firFor(icao)
      );
      const assign = targets.length ? targets : ids;
      for (const icao of assign) {
        if (!byAirport[icao]) byAirport[icao] = [];
        // Avoid exact duplicates per airport
        if (!byAirport[icao].some((n) => n.id && n.id === notam.id && n.text === notam.text)) {
          byAirport[icao].push(notam);
        }
      }
    }
    const payload = {
      ids,
      configured: true,
      provider: result.provider,
      providerLabel: result.providerLabel,
      locations: locationsFor(ids),
      notams: result.notams,
      byAirport,
      fetchedAt: new Date().toISOString(),
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      errors: result.errors,
      disclaimer:
        "NOTAMs are provided as received from the configured API and may be incomplete (especially national-only series not distributed internationally). This is not an official ATNS briefing. Use File2Fly for official RSA NOTAMs.",
    };
    cache.set(key, { at: Date.now(), payload });
    return payload;
  })().finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

module.exports = { getNotams, configuredProviders, setupGuide, CACHE_MS };
