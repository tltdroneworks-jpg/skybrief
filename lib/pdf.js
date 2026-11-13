function wrapLine(line, width) {
  if (line.length <= width) return [line];
  const words = line.split(/\s+/);
  const out = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= width) cur = next;
    else {
      if (cur) out.push(cur);
      if (word.length <= width) cur = word;
      else {
        for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
        cur = "";
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

function escapePdf(text) {
  return toPdfText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatStamp(iso, timeZone) {
  const date = iso ? new Date(iso) : new Date();
  const body = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const zone = timeZone === "Africa/Johannesburg" ? "SAST" : timeZone === "UTC" ? "UTC" : timeZone;
  return `${body} ${zone}`;
}

function toPdfText(text) {
  return String(text)
    .replace(/\u00b7|·/g, " | ")
    .replace(/\u00b0|°/g, " deg")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x20-\x7E]/g, "?");
}

function notamLines(notams) {
  const lines = ["", "=".repeat(72), "NOTAMs"];
  if (!notams) {
    lines.push("NOTAMs were requested but none were available.");
    return lines;
  }
  if (!notams.configured) {
    lines.push("Live NOTAM text was not included: no NOTAM API credentials are configured on the server.");
    lines.push("Official RSA NOTAMs and a combined NOTAM+MET PDF: ATNS File2Fly (https://file2fly.atns.co.za/aes/login.jsp).");
    return lines;
  }
  if (notams.providerLabel) lines.push(`Source: ${notams.providerLabel}`);
  if (notams.fetchedAt) {
    lines.push(`NOTAMs fetched: ${formatStamp(notams.fetchedAt, "Africa/Johannesburg")} / ${formatStamp(notams.fetchedAt, "UTC")}`);
  }
  if (notams.disclaimer) lines.push(notams.disclaimer);
  if (notams.error) lines.push(`Note: ${notams.error}`);
  const byAirport = notams.byAirport || {};
  const ids = notams.ids || Object.keys(byAirport);
  let any = false;
  for (const icao of ids) {
    const list = byAirport[icao] || (notams.notams || []).filter((n) => n.icao === icao || (n.locations || []).includes(icao));
    lines.push("");
    lines.push(`- ${icao} -`);
    if (!list.length) {
      lines.push("No NOTAMs returned for this airport (the source may not hold FA** or national-only series).");
      continue;
    }
    any = true;
    for (const n of list) {
      lines.push("");
      lines.push(n.id ? String(n.id) : "NOTAM");
      if (n.start || n.end) lines.push(`Valid: ${n.start || "?"} to ${n.end || "?"}`);
      lines.push(n.text || n.raw || "(no text)");
    }
  }
  if (!any && !(ids || []).length) {
    lines.push("The configured API returned no NOTAMs for the requested airports.");
  }
  return lines;
}

function weatherLines(data, options = {}) {
  const fetchedAt = data.fetchedAt || new Date().toISOString();
  const includeNotams = Boolean(options.notams);
  const includeSigmets = Boolean(options.sigmets);
  const includeAirspace = Boolean(options.airspaceNotes);
  const pack = includeNotams || includeSigmets || includeAirspace;
  const lines = [
    pack ? "Pilot briefing pack (text only)" : "METAR and TAF briefing (text only)",
    `Airports: ${(data.ids || []).join(", ")}`,
    ...(options.route && (options.route.dep || options.route.dest) ? [`Route: ${options.route.dep || '-'} to ${options.route.dest || '-'}${(options.route.alts || []).length ? '  Alts: ' + options.route.alts.join(', ') : ''}`] : []),
    `Generated: ${formatStamp(new Date().toISOString(), "Africa/Johannesburg")} / ${formatStamp(new Date().toISOString(), "UTC")}`,
    `Observations fetched: ${formatStamp(fetchedAt, "Africa/Johannesburg")} / ${formatStamp(fetchedAt, "UTC")}`,
    `Source: ${data.source || "Aviation Weather Center"}`,
    "This is not an official South African briefing. Official MET: SAWS. Official NOTAM: ATNS File2Fly.",
    "",
  ];
  for (const icao of data.ids || []) {
    const metar = (data.metars || []).find((m) => m.icao === icao);
    const taf = (data.tafs || []).find((t) => t.icao === icao);
    const name = metar?.name || taf?.name || icao;
    lines.push("=".repeat(72));
    lines.push(`${icao}  ${name}`);
    lines.push("- METAR -");
    lines.push(metar?.raw || "No METAR loaded for this airport.");
    if (metar?.summary) lines.push(`Decoded: ${metar.summary}`);
    if (metar?.fltCat) lines.push(`Flight category: ${metar.fltCat}`);
    if (metar?.source) lines.push(`METAR source: ${metar.source}`);
    lines.push("- TAF -");
    lines.push(taf?.raw || "No TAF loaded for this airport.");
    if (taf?.source) lines.push(`TAF source: ${taf.source}`);
    lines.push("");
  }
  if (options.sigmets) lines.push(...sigmetLines(options.sigmets));
  if (includeNotams) lines.push(...notamLines(options.notams));
  if (options.airspaceNotes) lines.push(...airspaceNoteLines(options.airspaceNotes));
  return lines;
}

function sigmetLines(sigmets) {
  const lines = ["", "=".repeat(72), "SIGMETs"];
  if (!sigmets) {
    lines.push("SIGMETs were requested but none were available.");
    return lines;
  }
  if (sigmets.source) lines.push(`Source: ${sigmets.source}`);
  if (sigmets.fetchedAt) {
    lines.push(`SIGMETs fetched: ${formatStamp(sigmets.fetchedAt, "Africa/Johannesburg")} / ${formatStamp(sigmets.fetchedAt, "UTC")}`);
  }
  const firs = sigmets.firs && sigmets.firs.length ? `FIRs: ${sigmets.firs.join(", ")}` : "";
  if (firs) lines.push(firs);
  const list = sigmets.sigmets || [];
  if (!list.length) {
    lines.push("No international SIGMETs currently returned for the requested FIRs.");
    return lines;
  }
  for (const s of list) {
    lines.push("");
    const head = [s.firId, s.hazard, s.qualifier, s.seriesId].filter(Boolean).join("  ");
    lines.push(head || "SIGMET");
    if (s.validFrom || s.validTo) lines.push(`Valid: ${s.validFrom || "?"} to ${s.validTo || "?"}`);
    if (s.base != null || s.top != null) lines.push(`Vertical: ${s.base ?? "?"} to ${s.top ?? "?"}`);
    lines.push(s.raw || "(no text)");
  }
  return lines;
}

function airspaceNoteLines(notes) {
  const lines = ["", "=".repeat(72), "Airspace and drone planning notes"];
  lines.push("Planning aid only — not permission to fly. Not for navigation.");
  const text = typeof notes === "string" ? notes : notes && notes.text;
  if (!text) {
    lines.push("No airspace / drone notes were generated (no map point was provided).");
    return lines;
  }
  for (const line of String(text).split(/\n/)) lines.push(line);
  return lines;
}

function buildPdf(title, lines) {
  const wrapped = [];
  for (const line of lines) {
    const parts = wrapLine(line, 95);
    wrapped.push(...(parts.length ? parts : [""]));
  }
  const linesPerPage = 52;
  const pages = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) pages.push(wrapped.slice(i, i + linesPerPage));
  if (!pages.length) pages.push([""]);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  const contentIds = [];
  for (const pageLines of pages) {
    const cmds = ["BT", "/F1 9 Tf", "14 TL", "40 812 Td"];
    pageLines.forEach((line, idx) => {
      if (idx > 0) cmds.push("T*");
      cmds.push(`(${escapePdf(line)}) Tj`);
    });
    cmds.push("ET");
    const stream = cmds.join("\n");
    contentIds.push(add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
  }
  const pageIds = [];
  for (const contentId of contentIds) {
    pageIds.push(
      add(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    );
  }
  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = add(`<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`);
  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const header = "%PDF-1.4\n";
  let body = "";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(header.length + body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info << /Title (${escapePdf(title)}) >> >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(header + body + xref + trailer);
}

function weatherPdf(data, options = {}) {
  const ids = data.ids || [];
  const pack = Boolean(options.notams || options.sigmets || options.airspaceNotes);
  const title = `${pack ? "BRIEFING" : "METAR-TAF"}-${ids.join("-") || "briefing"}`;
  return { title, buffer: buildPdf(title, weatherLines(data, options)) };
}

module.exports = { weatherPdf, formatStamp };
