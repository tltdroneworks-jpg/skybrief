/*
 * Skybrief in-app feedback sheet.
 * No server storage (free Render plan has no persistent disk), so "Send feedback"
 * opens a prefilled mailto:, with a secondary prefilled GitHub issue link.
 */
(function () {
  "use strict";

  const TO = "tltdroneworks@gmail.com";
  const ISSUES = "https://github.com/tltdroneworks-jpg/skybrief/issues/new";
  const $ = (id) => document.getElementById(id);

  const sheet = $("feedback-sheet");
  const form = $("feedback-form");
  if (!sheet || !form) return;

  let appVersion = null;
  function loadVersion() {
    if (appVersion) return Promise.resolve(appVersion);
    return fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (appVersion = (j && j.version) || appVersion))
      .catch(() => appVersion);
  }

  function appState() {
    try {
      // `state` is the top-level const in app.js (shared global scope of classic scripts).
      // eslint-disable-next-line no-undef
      return typeof state !== "undefined" ? state : null;
    } catch {
      return null;
    }
  }

  function fields() {
    const data = new FormData(form);
    return {
      name: String(data.get("name") || "").trim(),
      licence: String(data.get("licence") || "").trim(),
      category: String(data.get("category") || "Other"),
      message: String(data.get("message") || "").trim(),
    };
  }

  function context() {
    const st = appState();
    const standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    const lines = [
      `App version: ${appVersion || "unknown"}${standalone ? " (installed app)" : " (browser)"}`,
      `Device: ${navigator.userAgent}`,
      `Screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`,
    ];
    if (st) {
      lines.push(`Map: ${st.mapMode || "skybrief"} · layer ${st.wxLayer || "none"}`);
      if (Array.isArray(st.ids) && st.ids.length) lines.push(`Airports: ${st.ids.join(", ")}`);
      if (st.clickPoint) lines.push(`Map point: ${st.clickPoint.lat.toFixed(4)}, ${st.clickPoint.lon.toFixed(4)}`);
    }
    lines.push(`URL: ${window.location.href}`);
    lines.push(`Sent: ${new Date().toISOString()}`);
    return lines;
  }

  function bodyText(f, { markdown = false } = {}) {
    const head = markdown ? "### " : "";
    const out = [];
    out.push(`${head}Feedback`);
    out.push(`Category: ${f.category}`);
    out.push(`Name: ${f.name || "—"}`);
    out.push(`Licence / flies: ${f.licence || "—"}`);
    out.push("");
    out.push(f.message || "(no message yet)");
    out.push("");
    out.push(`${head}Context`);
    for (const l of context()) out.push(markdown ? `- ${l}` : l);
    return out.join("\n");
  }

  function mailtoUrl(f) {
    const subject = `Skybrief feedback: ${f.category}`;
    return `mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText(f))}`;
  }

  function issueUrl(f) {
    const summary = f.message ? f.message.split(/\n/)[0].slice(0, 70) : "";
    const title = `[${f.category}] ${summary || "Skybrief feedback"}`;
    const params = new URLSearchParams({ title, body: bodyText(f, { markdown: true }) });
    return `${ISSUES}?${params.toString()}`;
  }

  function refreshIssueLink() {
    $("fb-github").href = issueUrl(fields());
  }

  function open() {
    $("fb-error").hidden = true;
    $("fb-sent").hidden = true;
    loadVersion().then(refreshIssueLink);
    refreshIssueLink();
    if (typeof sheet.showModal === "function") sheet.showModal();
    else sheet.setAttribute("open", "");
    document.body.classList.add("sheet-open");
    setTimeout(() => $("fb-message").focus({ preventScroll: true }), 50);
  }

  function close() {
    if (typeof sheet.close === "function" && sheet.open) sheet.close();
    else sheet.removeAttribute("open");
  }

  sheet.addEventListener("close", () => document.body.classList.remove("sheet-open"));
  // Tap on the backdrop closes the sheet.
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) close();
  });

  document.querySelectorAll("#feedback-btn, [data-feedback-open]").forEach((b) => b.addEventListener("click", open));
  document.querySelectorAll("[data-feedback-close]").forEach((b) => b.addEventListener("click", close));
  form.addEventListener("input", () => {
    $("fb-error").hidden = true;
    refreshIssueLink();
  });
  form.addEventListener("change", refreshIssueLink);
  $("fb-github").addEventListener("click", refreshIssueLink);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = fields();
    if (!f.message) {
      $("fb-error").hidden = false;
      $("fb-message").focus();
      return;
    }
    await loadVersion();
    window.location.href = mailtoUrl(f);
    $("fb-sent").hidden = false;
  });

  window.SkybriefFeedback = { open, close, mailtoUrl: () => mailtoUrl(fields()), issueUrl: () => issueUrl(fields()) };
})();
