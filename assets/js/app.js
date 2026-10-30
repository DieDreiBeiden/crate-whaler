(() => {
"use strict";
const $ = (id) => document.getElementById(id);
// Worker mit derselben Versionsnummer wie app.js laden (siehe ?v= in index.html)
const WORKER_URL = "assets/js/sim-worker.js" + (document.currentScript ? new URL(document.currentScript.src).search : "");
const fmt = new Intl.NumberFormat(LOCALE);
const fmt1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const fmtP = (p) => (p * 100).toLocaleString(LOCALE, { maximumFractionDigits: p > 0 && p < 0.001 ? 3 : p < 0.1 ? 2 : 1 }) + (LANG === "de" ? "\u00a0%" : "%");
const ROMAN = { 0: "?", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "★" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const store = {
  get(k, d) { try { const v = localStorage.getItem("santa26:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem("santa26:" + k); else localStorage.setItem("santa26:" + k, JSON.stringify(v)); } catch { /* Speicher gesperrt */ } }
};

// ---------- Farbschema ----------
const THEMES = ["dark", "light", "auto"];
applyI18n();
$("langBtn").textContent = LANG.toUpperCase();
$("langBtn").addEventListener("click", () => { store.set("lang", LANG === "de" ? "en" : "de"); location.reload(); });
function applyTheme(th) {
  if (th === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  const name = t("theme." + th);
  $("themeLabel").textContent = name;
  $("themeBtn").setAttribute("aria-label", t("theme.aria", { name }));
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = th === "auto" ? (m.media.includes("dark") ? "#08141c" : "#e6edf0") : bg; });
}
let theme = store.get("theme", "dark");
if (!THEMES.includes(theme)) theme = "dark";
$("themeBtn").addEventListener("click", () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  store.set("theme", theme);
  applyTheme(theme);
});
applyTheme(theme);

// ---------- Zustand ----------
const SHIPS = new Map(SHIPS_RAW.map(([id, name, tier, type, demo]) => [id, { id, name, tier, type, demo }]));
$("shipCount").textContent = fmt.format(SHIPS.size);

const state = {
  source: store.get("source", "import"),   // "import" = Wargaming-Login, "manual" = nur Häkchen
  imported: store.get("imported", null),
  manual: store.get("manual", {}),
  plan: store.get("plan", null),
  pity: Object.fromEntries(Object.entries(PITY_DEFAULT).map(([k, d]) => { const v = parseInt((store.get("pity", {}) || {})[k], 10); return [k, v > 0 && v < 10000 ? v : d]; })),
  filter: store.get("filter", "missing"),
  ctype: store.get("ctype", "santa"),
  openGroups: new Set(store.get("openGroups", []))
};
if (!CONTAINER_DEFS[state.ctype] || state.ctype === "golden" || state.ctype === "bf") state.ctype = "santa";

// ---------- Tracker: eingetragene Öffnungen auswerten ----------
// Gespeichert: base = Container-Schiffe im Hafen vor dem ersten Eintrag, entries = Einträge in Reihenfolge
const TRACK_RUNS = 1000, TRACK_TYPES = ["santa", "mega", "ultra"];
const ALL_KEYS = new Set(GROUP_ORDER.flatMap((g) => GROUP_SHIPS[g].map((s) => s.key)));
const SHIP_BY_KEY = new Map(GROUP_ORDER.flatMap((g) => GROUP_SHIPS[g].map((s) => [s.key, s])));
const NJ_KEYS = GROUP_SHIPS.NJ.map((s) => s.key);
const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
// Gespeicherte Daten prüfen: nur bekannte Container-Typen, ganze Zahlen und bekannte Schiffe
const tracker = (() => {
  const raw = store.get("tracker", null) || {};
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).filter((e) => e && TRACK_TYPES.includes(e.type)).map((e) => ({
    at: int(e.at, 0, 8.64e15), type: e.type, packs: int(e.packs, 0, 100000), per: int(e.per, 1, 1000), golden: int(e.golden, 0, 1e7),
    ships: [...new Set(Array.isArray(e.ships) ? e.ships.filter((k) => ALL_KEYS.has(k)) : [])]
  }));
  const base = Array.isArray(raw.base) ? raw.base.filter((k) => ALL_KEYS.has(k)) : null;
  return { base: entries.length ? base || [] : null, entries, per: raw.per ? int(raw.per, 1, 1000) : 20, type: TRACK_TYPES.includes(raw.type) ? raw.type : "ultra" };
})();
const saveTracker = () => store.set("tracker", tracker);
const trackedKeys = () => new Set(tracker.entries.flatMap((e) => e.ships));
const entryN = (e) => e.packs * e.per;

const hasImport = () => state.source === "import" && state.imported && state.imported.ids.length > 0;
function importedKeys() {
  const s = new Set();
  if (hasImport()) for (const id of state.imported.ids) { const sh = SHIPS.get(id); if (sh) s.add(shipKey(sh.name)); }
  return s;
}
// Besitz der Container-Schiffe: Import (per Name), Häkchen von Hand und Schiffe aus dem Tracker
function ownedSet() {
  const imp = importedKeys(), trk = trackedKeys(), s = new Set();
  for (const g of GROUP_ORDER) for (const sh of GROUP_SHIPS[g]) {
    const m = state.manual[sh.key];
    if (m === true || trk.has(sh.key) || (m !== false && imp.has(sh.key))) s.add(sh.key);
  }
  return s;
}
// Stufe eines Container-Schiffs; neue Schiffe (Stufe unbekannt) aus Enzyklopädie-Daten nachschlagen
let tierByKey = new Map();
function rebuildTiers() { tierByKey = new Map(); for (const sh of SHIPS.values()) tierByKey.set(shipKey(sh.name), sh.tier); }
const tierOf = (s) => s.tier || tierByKey.get(s.key) || 0;

// ---------- Wargaming-Login ----------
// OpenID-Login: Rücksprung auf diese Seite mit ?status=ok&access_token=…&account_id=…&nickname=…&expires_at=…
const REALM_LABEL = { eu: "EU", com: "NA", asia: "ASIA" };
const appId = () => (WG_APPLICATION_ID || store.get("appId", "") || "").trim();
const wowsApi = (realm, path) => `https://api.worldofwarships.${realm}/wows/${path}`;
const selfUrl = () => location.origin + location.pathname;
let session = store.get("session", null);
let pendingLogin = false;

function importMsg(text, kind) {
  for (const id of ["importMsg", "gateMsg"]) { const m = $(id); m.className = "msg" + (kind ? " " + kind : ""); m.textContent = text; }
}
const sessionValid = () => session && session.token && (!session.exp || session.exp * 1000 > Date.now() + 60000);

function setSource(src) {
  state.source = src; store.set("source", src);
  renderAccount();
  changed();
}
$("skipLogin").addEventListener("click", () => setSource("manual"));
$("ubLogin").addEventListener("click", () => setSource("import"));

// Ohne gültige Anmeldung sieht man nur die Login-Seite (außer im Modus „von Hand“)
function renderAccount() {
  const logged = sessionValid();
  const gate = state.source !== "manual" && (!logged || pendingLogin);
  $("gate").hidden = !gate;
  $("app").hidden = gate;
  $("setupBox").hidden = !!WG_APPLICATION_ID || pendingLogin;
  $("appId").value = store.get("appId", "");
  $("realmButtons").hidden = pendingLogin;
  $("skipLogin").hidden = pendingLogin;
  $("gateTitle").textContent = t(pendingLogin ? "gate.okTitle" : "gate.title");
  $("gateSub").textContent = pendingLogin ? t("gate.okSub", { name: session.nick || session.account }) : t("gate.sub");
  $("userbar").hidden = !logged || gate || state.source === "manual";
  $("ubLogin").hidden = gate || state.source !== "manual";
  if (!logged) return;
  $("ubName").textContent = session.nick || session.account;
  $("ubRealm").textContent = REALM_LABEL[session.realm] || session.realm;
}
$("appId").addEventListener("input", (e) => { store.set("appId", e.target.value.trim()); });

document.querySelectorAll("[data-realm]").forEach((b) => b.addEventListener("click", () => {
  if (!appId()) { importMsg(t("msg.noAppId"), "err"); $("appId").focus(); return; }
  const realm = b.dataset.realm;
  const exp = Math.floor(Date.now() / 1000) + 14 * 86400;
  // Einmal-Code gegen untergeschobene Login-Links (Login-CSRF): wird beim Rücksprung verglichen
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join("");
  try { sessionStorage.setItem("santa26:nonce", nonce); } catch { /* ohne Speicher keine Prüfung möglich */ }
  location.href = `https://api.worldoftanks.${realm}/wot/auth/login/?application_id=${encodeURIComponent(appId())}&expires_at=${exp}&redirect_uri=${encodeURIComponent(`${selfUrl()}?realm=${realm}&n=${nonce}`)}`;
}));

// Rücksprung auswerten und den Schlüssel sofort aus der Adresszeile entfernen
function handleCallback() {
  const q = new URLSearchParams(location.search);
  if (!q.has("status")) return;
  history.replaceState(null, "", selfUrl() + location.hash);
  let expected = null, storageOk = true;
  try { expected = sessionStorage.getItem("santa26:nonce"); sessionStorage.removeItem("santa26:nonce"); } catch { storageOk = false; }
  if (storageOk && (!expected || q.get("n") !== expected)) { importMsg(t("msg.badState"), "err"); return; }
  if (q.get("status") !== "ok") {
    importMsg(t("msg.loginFailed", { reason: q.get("message") || q.get("code") || q.get("status") }), "err");
    return;
  }
  const realm = REALM_LABEL[q.get("realm")] ? q.get("realm") : "eu";
  session = { realm, token: q.get("access_token"), account: q.get("account_id"), nick: q.get("nickname") || "", exp: +q.get("expires_at") || 0 };
  if (!session.token || !session.account) { session = null; importMsg(t("msg.noToken"), "err"); return; }
  store.set("session", session);
  pendingLogin = true;
  setSource("import");
  loadPort();
}

async function wgGet(realm, path, params) {
  const u = new URL(wowsApi(realm, path));
  u.searchParams.set("application_id", appId());
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let res;
  try { res = await fetch(u); } catch { throw new Error(t("msg.offline")); }
  const j = await res.json().catch(() => null);
  if (!j) throw new Error(t("msg.badResponse", { status: res.status }));
  if (j.status !== "ok") {
    const msg = (j.error && j.error.message) || "UNKNOWN";
    const e = new Error(msg === "INVALID_ACCESS_TOKEN" ? t("msg.tokenExpired") :
      msg === "INVALID_APPLICATION_ID" ? t("msg.badAppId") :
      msg === "REQUEST_LIMIT_EXCEEDED" ? t("msg.rateLimit") : t("msg.wgError", { msg }));
    e.code = msg;
    throw e;
  }
  return j.data;
}

// Unbekannte IDs und damalige Testschiffe in der Enzyklopädie nachschlagen
async function resolveUnknown(realm, ids) {
  const out = {};
  const missing = ids.filter((id) => !SHIPS.has(id) || SHIPS.get(id).demo);
  for (let i = 0; i < missing.length; i += 100) {
    const data = await wgGet(realm, "encyclopedia/ships/", { ship_id: missing.slice(i, i + 100).join(","), fields: "name,tier,type,has_demo_profile" });
    for (const [id, s] of Object.entries(data || {})) if (s) out[id] = [s.name, s.tier, s.type, !!s.has_demo_profile];
  }
  return out;
}
function applyExtra(extra) {
  for (const [id, [name, tier, type, demo]] of Object.entries(extra || {})) SHIPS.set(+id, { id: +id, name, tier, type, demo });
  rebuildTiers();
}

let loading = false;
async function loadPort() {
  if (loading || !sessionValid()) return;
  loading = true; $("ubReload").disabled = true;
  importMsg(t("msg.loading"));
  try {
    const data = await wgGet(session.realm, "account/info/", { account_id: session.account, access_token: session.token, fields: "private.port", extra: "private.port" });
    const acc = data && data[session.account];
    if (!acc) throw new Error(t("msg.noAccount"));
    if (!acc.private || !Array.isArray(acc.private.port)) throw new Error(t("msg.noPort"));
    const ids = [...new Set(acc.private.port.map(Number))];
    let extra = {};
    try { extra = await resolveUnknown(session.realm, ids); } catch { /* Enzyklopädie ist optional */ }
    applyExtra(extra);
    state.imported = { ids, kind: "port", at: Date.now(), extra };
    store.set("imported", state.imported);
    const found = ownedSet().size;
    importMsg(t("msg.loaded", { n: fmt.format(ids.length), found: fmt.format(found) }), "ok");
    changed();
  } catch (err) {
    if (err.code === "INVALID_ACCESS_TOKEN") { session = null; store.set("session", null); }
    importMsg(err.message, "err");
  } finally {
    loading = false; $("ubReload").disabled = false;
    pendingLogin = false;
    renderAccount();
  }
}
$("ubReload").addEventListener("click", loadPort);

$("ubLogout").addEventListener("click", () => {
  const s = session;
  session = null; store.set("session", null);
  state.imported = null; store.set("imported", null);
  if (s && appId()) {
    const body = new URLSearchParams({ application_id: appId(), access_token: s.token });
    fetch(`https://api.worldoftanks.${s.realm}/wot/auth/logout/`, { method: "POST", body }).catch(() => {});
  }
  importMsg(t("msg.loggedOut"));
  renderAccount();
  changed();
});

// ---------- Benötigte Container je Stufe ----------
const NEED_ROWS = [{ label: t("needs.any"), tier: null }].concat([10, 9, 8, 7, 6, 5].map((n) => ({ label: t("needs.tier", { t: ROMAN[n] }), tier: n })));
const SHORT = { santa: "Santa's Gift", mega: "Mega Gift", ultra: "Ultra Gift" };

// Erst schnell mit wenigen Läufen, dann im Hintergrund genauer (1000 Läufe: ±4 %, 5000: ±2 %)
const NEED_STAGES = [1000, 5000], NEED_CAP = 20000;

// Eigener Worker, damit die Tabelle nicht hinter der Plan-Simulation warten muss
let needsWorker = null, needsId = 0, needsPending = null;
const needsCache = new Map();   // Schlüssel: Typ + Garantie + Besitz -> { result, runs }
const needsFinal = () => NEED_STAGES[NEED_STAGES.length - 1];
function startNeedsWorker() {
  try {
    needsWorker = new Worker(WORKER_URL);
    needsWorker.onmessage = (e) => {
      if (!needsPending || needsPending.id !== e.data.id) return;
      const { key, runs } = needsPending;
      needsPending = null;
      needsCache.set(key, { result: e.data.result, runs });
      if (key === needsKey()) { drawNeeds(e.data.result); setNeedsNote(runs); requestNeeds(); }
    };
    needsWorker.onerror = () => { needsWorker = null; needsPending = null; };
  } catch { needsWorker = null; }
}
startNeedsWorker();

function needsKey() { return `${state.ctype}|${state.pity[state.ctype]}|${state.pity.golden}|${[...ownedSet()].sort().join(",")}`; }
function missingByRow(owned) {
  const def = CONTAINER_DEFS[state.ctype];
  const groups = [...new Set(def.slots.flat().filter((e) => e.ship).map((e) => e.ship))].concat(["GR", "GG"]);
  return NEED_ROWS.map((row) => groups.reduce((a, g) => a + availIn(g, owned).filter((s) => row.tier == null || tierOf(s) === row.tier).length, 0));
}
function setNeedsNote(runs) {
  $("needsNote").textContent = t("needs.note", { runs: fmt.format(runs) }) +
    (needsWorker && runs < needsFinal() ? t("needs.refining", { runs: fmt.format(needsFinal()) }) : "") +
    (!hasImport() && !Object.keys(state.manual).length ? t("needs.noLogin") : "");
}

function renderNeeds() {
  const type = state.ctype;
  document.querySelectorAll("[data-ctype]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ctype === type));
  $("needsLede").textContent = t("needs.lede", { c: SHORT[type], n: state.pity[type] });
  document.querySelectorAll("[data-box-pity]").forEach((el) => { el.textContent = t("needs.boxPity", { n: fmt.format(state.pity[el.dataset.boxPity]) }); });
  const hit = needsCache.get(needsKey());
  if (hit) { drawNeeds(hit.result); setNeedsNote(hit.runs); } else { drawNeeds(null); setNeedsNote(NEED_STAGES[0]); }
  requestNeeds();
}
// Nächste Stufe für den aktuellen Stand anfordern. Ein Job für einen veralteten Stand wird abgebrochen,
// damit eine lange Rechnung nicht vor der neuen Eingabe in der Warteschlange steht.
function requestNeeds() {
  const key = needsKey(), hit = needsCache.get(key);
  const runs = NEED_STAGES.find((n) => !hit || n > hit.runs);
  if (!runs || (hit && !needsWorker)) return;
  if (needsPending) {
    if (needsPending.key === key) return;
    needsWorker.terminate(); needsPending = null; startNeedsWorker();
  }
  const tiers = {};
  for (const g of GROUP_ORDER) for (const s of GROUP_SHIPS[g]) if (!s.tier) tiers[s.key] = tierOf(s);
  const params = { ownedKeys: [...ownedSet()], type: state.ctype, pityCfg: { ...state.pity }, runs, cap: NEED_CAP,
    targets: NEED_ROWS.map((r, i) => ({ id: "r" + i, tier: r.tier })), tiers };
  if (needsWorker) {
    needsPending = { id: ++needsId, key, runs };
    needsWorker.postMessage({ id: needsPending.id, kind: "needs", params });
  } else if (!hit) {
    // Ohne Worker nur eine kleine Rechnung im Hauptthread, damit die Seite bedienbar bleibt
    setTimeout(() => { const res = runNeeds({ ...params, runs: 400 }); needsCache.set(key, { result: res, runs: 400 }); if (key === needsKey()) { drawNeeds(res); setNeedsNote(400); } }, 0);
  }
}

// result = null zeichnet die Tabelle mit Platzhaltern, solange gerechnet wird
function drawNeeds(result) {
  const missing = missingByRow(ownedSet()), total = missingByRow(new Set());
  const num = (n) => (Number.isFinite(n) ? fmt.format(n) : `> ${fmt.format(NEED_CAP)}`);
  // Zeile 0 („irgendein Schiff“) ist die Kennzahl oben, die Stufen stehen in der Tabelle
  const any = result && result.r0;
  $("heroP50").textContent = !missing[0] ? "–" : any ? num(any.p50) : "…";
  $("heroP90").textContent = !missing[0] ? "–" : any ? num(any.p90) : "…";
  $("heroSub").textContent = missing[0] ? t("needs.heroMiss", { n: fmt.format(missing[0]), c: SHORT[state.ctype] }) : t("needs.heroDone");
  $("needsHero").classList.toggle("wait", !!missing[0] && !any);
  $("needsBody").innerHTML = NEED_ROWS.map((row, i) => {
    if (row.tier == null) return "";
    // Striche: Anteil der Schiffe dieser Stufe, die dir noch fehlen
    const on = total[i] ? Math.round(missing[i] / total[i] * 10) : 0;
    const pips = `<span class="pips" aria-hidden="true">${Array.from({ length: 10 }, (_, k) => `<i${k < on ? ' class="on"' : ""}></i>`).join("")}</span>`;
    const head = `<th scope="row"><span class="visually-hidden">${esc(row.label)}</span><span class="roman" aria-hidden="true">${ROMAN[row.tier]}</span></th>` +
      `<td><span class="miss-c">${pips}<span>${t("needs.missInline", { n: fmt.format(missing[i]) })}</span></span></td>`;
    if (!missing[i]) return `<tr class="done">${head}<td colspan="2" class="mini">${t("needs.allOwned")}</td></tr>`;
    const r = result && result["r" + i];
    const cls = row.tier === curveTier ? "sel" : "";
    if (!r) return `<tr class="${cls}" data-tier="${row.tier}">${head}<td class="num big wait">…</td><td class="num big p90 wait">…</td></tr>`;
    return `<tr class="${cls}" data-tier="${row.tier}">${head}<td class="num big">${num(r.p50)}</td><td class="num big p90">${num(r.p90)}</td></tr>`;
  }).join("");
  $("needsTitle").setAttribute("aria-busy", result ? "false" : "true");
  if (result) lastNeeds = result;
  $("curveBox").classList.toggle("stale", !result);
  drawCurve();
}

// ---------- Kurve: Wahrscheinlichkeit nach geöffneten Containern ----------
// Zwei Farben: "Irgendein Schiff" und die gewählte Stufe; übrige Stufen grau als Kontext.
let lastNeeds = null, curveTier = store.get("curveTier", 10), curveX = null;
// Gezeichnet in der echten Breite des Containers, damit Schrift auf dem Handy lesbar bleibt
const curveDims = () => { const W = Math.max(280, Math.round($("curvePlot").clientWidth || 720)); return { W, H: W < 500 ? 240 : 300, L: 42, R: 14, T: 14, B: 40 }; };
function curveSeries() {
  if (!lastNeeds) return [];
  return NEED_ROWS.map((row, i) => ({ row, i, r: lastNeeds["r" + i] })).filter((s) => s.r && s.r.qs);
}
// Anteil der Durchläufe, die nach x Containern das Ziel erreicht haben (Auflösung 1 %)
const probAt = (qs, x) => { let k = 0; while (k < qs.length && qs[k] <= x) k++; return k / 100; };

function drawCurve() {
  const box = $("curvePlot");
  const series = curveSeries();
  // Stufen-Auswahl
  const tiers = series.filter((s) => s.row.tier != null).map((s) => s.row.tier);
  if (tiers.length && !tiers.includes(curveTier)) curveTier = tiers[0];
  $("curveTiers").innerHTML = tiers.map((tr) => `<button type="button" class="chip" data-curve-tier="${tr}" aria-pressed="${tr === curveTier}">${ROMAN[tr]}</button>`).join("");
  $("curveBox").hidden = !series.length;
  if (!series.length) { box.innerHTML = ""; return; }
  const { W, H, L, R, T, B } = curveDims();
  const finite = series.flatMap((s) => s.r.qs.filter(Number.isFinite));
  const xMax = Math.pow(10, Math.ceil(Math.log10(Math.max(10, ...finite))));
  const sx = (x) => L + Math.log10(Math.max(1, x)) / Math.log10(xMax) * (W - L - R);
  const sy = (p) => T + (1 - p) * (H - T - B);
  let g = "";
  for (const p of [0, 0.25, 0.5, 0.75, 1]) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(p)}" y2="${sy(p)}"/><text x="${L - 6}" y="${sy(p) + 4}" text-anchor="end">${fmtP(p)}</text>`;
  for (const p of [0.5, 0.9]) g += `<line class="ref" x1="${L}" x2="${W - R}" y1="${sy(p)}" y2="${sy(p)}"/>`;
  // Schmale Kurve: große Werte kürzen (1k, 10k), damit sich die Beschriftungen nicht überlappen
  const narrow = (W - L - R) / Math.log10(xMax) < 80;
  const xl = (x) => (narrow && x >= 1000 ? `${fmt.format(x / 1000)}k` : fmt.format(x));
  for (let x = 1; x <= xMax; x *= 10) g += `<line class="grid" x1="${sx(x)}" x2="${sx(x)}" y1="${T}" y2="${H - B}"/><text x="${sx(x)}" y="${H - B + 16}" text-anchor="${x === 1 ? "start" : x === xMax ? "end" : "middle"}">${xl(x)}</text>`;
  g += `<text class="axis-title" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${esc(t("curve.xAxis"))}</text>`;
  const path = (qs) => {
    const pts = [[sx(1), sy(0)]];
    qs.forEach((x, i) => { if (Number.isFinite(x)) pts.push([sx(x), sy((i + 1) / 100)]); });
    return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
  };
  const role = (s) => (s.row.tier == null ? "any" : s.row.tier === curveTier ? "sel" : "ctx");
  // Kontextlinien zuerst, damit die farbigen oben liegen
  const ordered = [...series].sort((a, b) => ({ ctx: 0, sel: 1, any: 2 }[role(a)] - { ctx: 0, sel: 1, any: 2 }[role(b)]));
  let lines = "";
  for (const s of ordered) lines += `<path class="ln ${role(s)}" d="${path(s.r.qs)}"/>`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-labelledby="curveTitle" aria-describedby="curveDesc">
    <desc id="curveDesc">${esc(t("curve.desc"))}</desc>
    ${g}${lines}
    <line class="xhair" id="xhair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="tip" id="curveTip" role="status" hidden></div>`;
  $("curveLegend").innerHTML = `<span><i class="key any"></i>${esc(t("curve.any"))}</span><span><i class="key sel"></i>${esc(t("needs.tier", { t: ROMAN[curveTier] }))}</span><span><i class="key ctx"></i>${esc(t("curve.others"))}</span>`;
  const svg = box.querySelector("svg");
  const showAt = (x) => {
    curveX = Math.min(xMax, Math.max(1, x));
    const hx = sx(curveX);
    const xh = svg.querySelector("#xhair"); xh.setAttribute("x1", hx); xh.setAttribute("x2", hx); xh.setAttribute("visibility", "visible");
    const tip = $("curveTip");
    tip.textContent = "";
    const head = document.createElement("div"); head.className = "tip-h"; head.textContent = t("curve.tipHead", { n: fmt.format(Math.round(curveX)) }); tip.appendChild(head);
    for (const s of series) {
      const rl = role(s), row = document.createElement("div"); row.className = "tip-r " + rl;
      const k = document.createElement("i"); k.className = "key " + rl;
      const v = document.createElement("strong"); v.textContent = fmtP(probAt(s.r.qs, curveX));
      const n = document.createElement("span"); n.textContent = s.row.label;
      row.append(k, v, n); tip.appendChild(row);
    }
    tip.hidden = false;
    const rect = svg.getBoundingClientRect(), px = hx / W * rect.width;
    tip.style.left = `${Math.min(rect.width - tip.offsetWidth, Math.max(0, px + 12))}px`;
  };
  const hide = () => { svg.querySelector("#xhair").setAttribute("visibility", "hidden"); $("curveTip").hidden = true; };
  const fromEvent = (e) => { const rect = svg.getBoundingClientRect(); const vx = (e.clientX - rect.left) / rect.width * W; return Math.pow(10, (vx - L) / (W - L - R) * Math.log10(xMax)); };
  svg.addEventListener("pointermove", (e) => showAt(fromEvent(e)));
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  // Tastatur: Pfeile verschieben das Fadenkreuz in Schritten von 1/20 Dekade
  svg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hide(); return; }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const step = Math.pow(10, 1 / 20), cur = curveX || 10;
    showAt(e.key === "Home" ? 1 : e.key === "End" ? xMax : e.key === "ArrowRight" ? cur * step : cur / step);
  });
  svg.addEventListener("focus", () => showAt(curveX || 10));
}
$("curveTiers").addEventListener("click", (e) => {
  const tr = e.target.dataset && e.target.dataset.curveTier;
  if (!tr) return;
  curveTier = +tr; store.set("curveTier", curveTier);
  drawNeeds(lastNeeds);
});
$("needsBody").addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-tier]");
  if (!row || !row.dataset.tier) return;
  curveTier = +row.dataset.tier; store.set("curveTier", curveTier);
  drawNeeds(lastNeeds);
});
document.querySelectorAll("[data-ctype]").forEach((b) => b.addEventListener("click", () => {
  state.ctype = b.dataset.ctype; store.set("ctype", state.ctype); renderNeeds();
}));
const scheduleNeeds = debounce(renderNeeds, 250);
let curveW = 0;
window.addEventListener("resize", debounce(() => { const w = $("curvePlot").clientWidth; if (w && w !== curveW) { curveW = w; drawCurve(); } }, 150));

// ---------- Kaufplan in Paketen ----------
const fmtEur = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const BUY_RUNS = { ultra: 1000, mega: 600, santa: 500 }, BUY_CAP = 30000, BUY_MAX_PACKS = 15, PITY_RUNS = 2000;
const GOALS = [
  { id: "pool", label: (c) => t("buy.goalPool", { c: SHORT[c] }) },
  { id: "reg3", label: () => "Latouche-Tréville, Rodina, Tōgasa" },
  { id: "all7", label: () => t("buy.goalAll7") },
  { id: "nj", label: () => "New Jersey BF" }
];
const buy = { type: "ultra", pack: 20, price: 123, bfPity: true, counter: 0, ...store.get("buy", {}) };
if (!BUY_RUNS[buy.type]) buy.type = "ultra";
$("b-type").value = buy.type; $("b-pack").value = buy.pack; $("b-price").value = buy.price;
$("b-bfpity").checked = buy.bfPity; $("b-counter").value = buy.counter;

let buyWorker = null, buyId = 0, buyResult = null, pityResult = null;
const buyCache = new Map();
try {
  buyWorker = new Worker(WORKER_URL);
  buyWorker.onmessage = (e) => { const job = buyJobs.get(e.data.id); if (!job) return; buyJobs.delete(e.data.id); buyCache.set(job.key, e.data.result); if (job.key === buyKey(job.kind)) applyBuy(job.kind, e.data.result); };
  buyWorker.onerror = () => { buyWorker = null; };
} catch { buyWorker = null; }
const buyJobs = new Map();

function buyKey(kind) { return `${kind}|${buy.type}|${buy.pack}|${buy.bfPity}|${JSON.stringify(state.pity)}|${[...ownedSet()].sort().join(",")}`; }
function buyParams() { return { ownedKeys: [...ownedSet()], type: buy.type, pityCfg: { ...state.pity }, pack: buy.pack, bfPity: buy.bfPity }; }
function requestBuy() {
  buyResult = pityResult = null;
  const jobs = [["milestones", { ...buyParams(), runs: BUY_RUNS[buy.type], cap: BUY_CAP, maxPacks: BUY_MAX_PACKS }], ["pitytable", { ...buyParams(), runs: PITY_RUNS }]];
  let pending = 0;
  for (const [kind, params] of jobs) {
    const key = buyKey(kind);
    if (buyCache.has(key)) { applyBuy(kind, buyCache.get(key)); continue; }
    pending++;
    const id = ++buyId;
    buyJobs.set(id, { kind, key });
    if (buyWorker) buyWorker.postMessage({ id, kind, params });
    else setTimeout(() => { const fn = kind === "milestones" ? runMilestones : runPityTable; const res = fn({ ...params, runs: Math.ceil(params.runs / 4) }); buyCache.set(key, res); if (key === buyKey(kind)) applyBuy(kind, res); }, 0);
  }
  if (pending) { $("buyState").dataset.busy = "true"; $("buyState").textContent = t("calc.busy"); }
  drawBuy(); drawPity();
}
function applyBuy(kind, res) {
  if (kind === "milestones") buyResult = res; else pityResult = res;
  if (buyResult && pityResult) { $("buyState").dataset.busy = "false"; $("buyState").textContent = t("calc.runs", { n: fmt.format(BUY_RUNS[buy.type]) }); }
  if (kind === "milestones") drawBuy(); else drawPity();
}
const scheduleBuy = debounce(requestBuy, 300);

function drawBuy() {
  const r = buyResult;
  const cell = (n) => {
    if (!Number.isFinite(n)) return `<span class="packs">–</span><span class="eur">${t("buy.notReached")}</span>`;
    const packs = Math.ceil(n / buy.pack);
    return `<span class="packs">${fmt.format(packs)} ${t(packs === 1 ? "buy.pack1" : "buy.packN")}</span><span class="eur">${fmtEur.format(packs * buy.price)}</span>`;
  };
  $("buyBody").innerHTML = GOALS.map((g) => {
    const head = `<th scope="row">${esc(g.label(buy.type))}</th>`;
    if (!r) return `<tr>${head}<td class="num col-miss wait">…</td><td class="num wait">…</td><td class="num wait">…</td></tr>`;
    const m = r[g.id];
    if (m.done) return `<tr class="done">${head}<td colspan="3" class="mini">${t("buy.reached")}</td></tr>`;
    return `<tr>${head}<td class="num col-miss">${Number.isFinite(m.mean) ? fmt.format(Math.round(m.mean)) : "–"}</td><td class="num">${cell(m.p50)}</td><td class="num">${cell(m.p90)}</td></tr>`;
  }).join("");
  const rows = [];
  if (r) for (let p = 1; p <= BUY_MAX_PACKS; p++) {
    const y = r.yields[p] || 0;
    if (y < 0.05 && p > 1) { rows.push(`<tr><td colspan="3" class="mini">${t("buy.yieldEnd", { p })}</td></tr>`); break; }
    rows.push(`<tr><td>${p}</td><td class="num">${fmt1.format(y)}</td><td class="num">${y > 0 ? fmtEur.format(buy.price / y) : "–"}</td></tr>`);
  }
  $("yieldBody").innerHTML = rows.join("") || `<tr><td colspan="3" class="mini">${t("buy.calc")}</td></tr>`;
}

function drawPity() {
  const N = state.pity.golden, c = Math.min(N - 1, Math.max(0, buy.counter));
  $("pityGrid").innerHTML = Array.from({ length: N }, (_, i) => `<div class="${i === c ? "cur" : ""}"${i === c ? ' aria-current="true"' : ""}><span class="z">${i}</span><span class="c">${pityResult ? fmtP(pityResult[i]).replace(" %", "%") : "…"}</span></div>`).join("");
  const v = $("pityVerdict");
  if (!pityResult) { v.className = "pity-verdict"; v.textContent = ""; return; }
  const p = pityResult[c];
  if (p >= 0.8) { v.className = "pity-verdict buy"; v.textContent = t("buy.vBuy", { p: fmtP(p) }); }
  else if (p >= 0.5) { v.className = "pity-verdict maybe"; v.textContent = t("buy.vMaybe", { p: fmtP(p) }); }
  else { v.className = "pity-verdict stop"; v.textContent = t("buy.vStop", { p: fmtP(p) }); }
  $("pityNote").textContent = t("buy.pityNote", { n: buy.pack, c: SHORT[buy.type], g: N });
}

const BUY_INPUTS = { type: ["b-type", "change"], pack: ["b-pack", "input"], price: ["b-price", "input"], bfPity: ["b-bfpity", "change"], counter: ["b-counter", "input"] };
for (const [k, [id, ev]] of Object.entries(BUY_INPUTS)) {
  $(id).addEventListener(ev, () => {
    const el = $(id);
    buy[k] = k === "type" ? el.value : k === "bfPity" ? el.checked : k === "price" ? Math.max(0, parseFloat(el.value) || 0) : Math.max(k === "pack" ? 1 : 0, parseInt(el.value, 10) || 0);
    store.set("buy", buy);
    if (k === "price") drawBuy();
    else if (k === "counter") drawPity();
    else scheduleBuy();
  });
}

// ---------- Plan ----------
const PLAN_IDS = { free: "c-free", pass: "c-pass", tokens: "c-tokens", tokenUse: "c-tokenUse", santa: "c-santa", mega: "c-mega", ultra: "c-ultra", golden: "c-golden" };
function readPlan() {
  const n = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
  return { free: n("c-free"), pass: n("c-pass"), tokens: n("c-tokens"), tokenUse: $("c-tokenUse").value, santa: n("c-santa"), mega: n("c-mega"), ultra: n("c-ultra"), golden: n("c-golden") };
}
function planCounts(p) {
  const tk = p.tokenUse === "santa" ? { santa: p.tokens, mega: 0 } : p.tokenUse === "mega" ? { santa: 0, mega: Math.floor(p.tokens / 5) } : { santa: 0, mega: 0 };
  return { ultra: p.ultra, mega: p.mega + tk.mega, santa: p.free + p.pass + p.santa + tk.santa, golden: p.golden };
}
function renderPlanInputs() {
  const p = readPlan(), c = planCounts(p);
  const rest = p.tokenUse === "mega" ? p.tokens % 5 : 0;
  $("tokenHint").textContent = p.tokenUse === "mega" ? t("plan.tokMega", { n: fmt.format(Math.floor(p.tokens / 5)) }) + (rest ? t("plan.tokRest", { n: rest }) : "") : p.tokenUse === "santa" ? t("plan.tokSanta", { n: fmt.format(p.tokens) }) : t("plan.tokCredits", { n: fmt.format(p.tokens * 375000) });
  const parts = [];
  if (c.santa) parts.push(`${fmt.format(c.santa)} Santa's Gift`);
  if (c.mega) parts.push(`${fmt.format(c.mega)} Mega`);
  if (c.ultra) parts.push(`${fmt.format(c.ultra)} Ultra`);
  if (c.golden) parts.push(`${fmt.format(c.golden)} Golden`);
  $("totalNote").textContent = parts.length ? t("plan.total", { list: parts.join(", ") }) : t("plan.empty");
}
if (state.plan) for (const [k, id] of Object.entries(PLAN_IDS)) if (state.plan[k] !== undefined) $(id).value = state.plan[k];
for (const id of Object.values(PLAN_IDS)) {
  $(id).addEventListener(id === "c-tokenUse" ? "change" : "input", () => {
    state.plan = readPlan(); store.set("plan", state.plan);
    renderPlanInputs();
    scheduleSim();
  });
}
document.querySelectorAll("[data-pity-label]").forEach((el) => { el.textContent = t("plan.pity", { c: el.dataset.pityLabel }); });
for (const k of Object.keys(PITY_DEFAULT)) {
  const inp = $("p-" + k);
  inp.value = state.pity[k];
  inp.addEventListener("change", () => { state.pity[k] = Math.max(1, parseInt(inp.value, 10) || PITY_DEFAULT[k]); inp.value = state.pity[k]; store.set("pity", state.pity); renderDropTables(); renderNeeds(); scheduleBuy(); scheduleSim(); });
}
$("runs").addEventListener("change", () => scheduleSim());

// ---------- Simulation im Hintergrund ----------
let worker = null, simId = 0, lastSim = null;
try {
  worker = new Worker(WORKER_URL);
  worker.onmessage = (e) => { if (e.data.id === simId) finishSim(e.data.result); };
  worker.onerror = () => { worker = null; scheduleSim(); };
} catch { worker = null; }

function startSim() {
  const runs = Math.min(20000, Math.max(200, parseInt($("runs").value, 10) || 3000));
  const params = { ownedKeys: [...ownedSet()], cnt: planCounts(readPlan()), runs, pityCfg: { ...state.pity } };
  const id = ++simId;
  $("calcState").dataset.busy = "true";
  $("calcState").textContent = t("calc.busy");
  if (worker) worker.postMessage({ id, kind: "plan", params });
  else setTimeout(() => { if (id === simId) finishSim(runPlan(params)); }, 0);
}
const scheduleSim = debounce(startSim, 200);
function finishSim(result) {
  lastSim = result;
  $("calcState").dataset.busy = "false";
  $("calcState").textContent = t("calc.runs", { n: fmt.format(result.runs) });
  renderSim(result);
  refreshGroupStats();
}

function renderSim(sim) {
  const atLeast1 = 1 - (sim.hist[0] || 0) / sim.runs;
  const nj = (sim.shipHits[shipKey("New Jersey BF")] || 0) / sim.runs;
  readout($("contReadout"), [
    { k: t("plan.kNew"), v: fmt1.format(sim.mean), s: t("plan.sNew"), accent: true },
    { k: t("plan.kOne"), v: fmtP(atLeast1), s: t("plan.sOne") },
    { k: t("plan.kGolden"), v: fmt1.format(sim.golden), s: t("plan.sGolden") },
    { k: "New Jersey BF", v: fmtP(nj), s: sim.bf > 0 ? t("plan.sNjBf", { n: fmt1.format(sim.bf) }) : t("plan.sNjNone") }
  ]);
  const keys = Object.keys(sim.hist).map(Number).sort((a, b) => a - b);
  const rows = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k++) rows.push([k, sim.hist[k] || 0]);
  const maxV = Math.max(...rows.map((r) => r[1]));
  let cum = 0, median = 0;
  for (const [k, v] of rows) { cum += v; if (cum >= sim.runs / 2) { median = k; break; } }
  $("histNote").textContent = t("plan.histNote", { m: fmt.format(median) }) + (sim.comps > 0.005 ? t("plan.histComp", { n: fmt1.format(sim.comps) }) : "");
  $("hist").innerHTML = rows.slice(0, 20).map(([k, v]) => `<div class="b"><span>${t(k === 1 ? "plan.ships1" : "plan.shipsN", { n: k })}</span><span class="bar${k === 0 ? " zero" : ""}" style="width:${(v / maxV * 100).toFixed(1)}%"></span><span style="text-align: right;">${fmtP(v / sim.runs)}</span></div>`).join("") + (rows.length > 20 ? `<div class="mini">${t("plan.histMore", { n: keys[keys.length - 1] })}</div>` : "");
  $("hist").setAttribute("aria-label", t("plan.histAriaFull", { m: median, p: fmtP(atLeast1) }));
  const ORDER = ["Stahl", "Kohle", "Dublonen", "Credits", "Elite-Kommandanten-EP", "Forschungspunkte", "Premium-Tage", "Hafenplätze", "Signale (25×)"];
  const res = Object.entries(sim.resSum).sort((a, b) => {
    const ia = ORDER.indexOf(a[0]), ib = ORDER.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], "de");
  });
  $("resBody").innerHTML = res.length ? res.map(([k, v]) => { const a = v / sim.runs; return `<tr><td>${esc(resName(k))}</td><td class="num">${a >= 100 ? fmt.format(Math.round(a)) : fmt1.format(a)}</td></tr>`; }).join("") : `<tr><td colspan="2" class="mini">${t("plan.noCont")}</td></tr>`;
}
function readout(el, items) {
  el.innerHTML = items.map((it) => `<div><span class="k">${esc(it.k)}</span><span class="v${it.accent ? " accent" : ""}">${it.v}</span>${it.s ? `<span class="s">${it.s}</span>` : ""}</div>`).join("");
}

// ---------- Schiffsliste ----------
// Icons liegen lokal unter assets/img/ships/<schlüssel>.webp (aus der Wargaming-Enzyklopädie, 128 × 75 px).
// Noch nicht veröffentlichte Schiffe zeigen vorläufig das Icon ihres Basisschiffs.
const ICON_ALIAS = { rodinag: "rodina", somersg: "somers", togasag: "togasa", tywysogcymru: "princeofwales", newjerseybf: "newjersey" };
function shipIcon(s) {
  const alias = ICON_ALIAS[s.key];
  return `<img class="sicon${alias ? " ph" : ""}" src="assets/img/ships/${alias || s.key}.webp" width="64" height="38" loading="lazy" decoding="async" alt=""${alias ? ` title="${esc(t("ships.iconPh"))}"` : ""}>`;
}

function shipChance(g) {
  return lastSim && lastSim.missing[g] ? Math.min(1, (lastSim.groupHits[g] || 0) / lastSim.runs / lastSim.missing[g]) : 0;
}
function groupSub(g, owned) {
  if (GROUP_SHIPS[g].every((s) => owned.has(s.key))) return t("ships.groupAll");
  if (!lastSim) return "";
  return t("ships.groupAny", { p: fmtP((lastSim.groupAny[g] || 0) / lastSim.runs) });
}
function renderOwnedNote(owned) {
  const all = GROUP_ORDER.reduce((a, g) => a + GROUP_SHIPS[g].length, 0);
  $("ownedNote").textContent = t("ships.owned", { n: fmt.format(owned.size), all: fmt.format(all) }) + t(hasImport() ? "ships.ownedImport" : "ships.ownedManual");
}
function refreshGroupStats() {
  const owned = ownedSet();
  renderOwnedNote(owned);
  document.querySelectorAll("#groups details.grp").forEach((d) => {
    const g = d.dataset.group;
    d.querySelector(".gsub").textContent = groupSub(g, owned);
    d.querySelector(".gstat").textContent = `${GROUP_SHIPS[g].filter((s) => owned.has(s.key)).length}/${GROUP_SHIPS[g].length}`;
    const p = fmtP(shipChance(g));
    d.querySelectorAll(".ship").forEach((row) => { row.querySelector(".p").textContent = row.querySelector("input").checked ? t("ships.inPort") : p; });
  });
}
function setFilter(f) {
  state.filter = f; store.set("filter", f);
  $("fMissing").setAttribute("aria-pressed", f === "missing");
  $("fAll").setAttribute("aria-pressed", f === "all");
  renderGroups();
}
$("fMissing").addEventListener("click", () => setFilter("missing"));
$("fAll").addEventListener("click", () => setFilter("all"));
$("shipSearch").addEventListener("input", debounce(() => renderGroups(), 120));

function renderGroups() {
  const owned = ownedSet(), imp = importedKeys();
  const q = shipKey($("shipSearch").value);
  const missingOnly = state.filter === "missing";
  let html = "";
  for (const g of GROUP_ORDER) {
    const list = GROUP_SHIPS[g];
    const og = list.filter((s) => owned.has(s.key)).length;
    const shown = list.filter((s) => (!missingOnly || !owned.has(s.key)) && (!q || s.key.includes(q)));
    if (q && !shown.length) continue;
    const open = q ? true : state.openGroups.has(g);
    const p = shipChance(g);
    const rows = shown.map((s) => {
      const has = owned.has(s.key);
      const src = state.manual[s.key] !== undefined ? t("ships.srcHand") : imp.has(s.key) ? t("ships.srcImport") : "";
      return `<label class="ship${has ? " owned" : ""}"><input type="checkbox" data-ship="${esc(s.key)}" ${has ? "checked" : ""}>${shipIcon(s)}<span class="nm">${esc(s.name)}${src ? ` <span class="src">${src}</span>` : ""}</span><span class="tier">${ROMAN[tierOf(s)]}</span><span class="p">${has ? t("ships.inPort") : lastSim ? fmtP(p) : ""}</span></label>`;
    }).join("");
    html += `<details class="grp" data-group="${g}"${open ? " open" : ""}>
      <summary><span class="gname">${esc(t("group." + g))}</span><span class="gstat">${og}/${list.length}</span><span class="gsub">${groupSub(g, owned)}</span></summary>
      <div class="grp-actions"><button type="button" class="ghost sm" data-all="${g}">${t("ships.btnAll")}</button><button type="button" class="ghost sm" data-none="${g}">${t("ships.btnNone")}</button></div>
      ${rows ? `<div class="ships">${rows}</div>` : `<div class="empty">${t(missingOnly ? "ships.emptyMissing" : "ships.emptyHits")}</div>`}
    </details>`;
  }
  $("groups").innerHTML = html || `<div class="empty">${t("ships.none")}</div>`;
  renderOwnedNote(owned);
}
$("groups").addEventListener("toggle", (e) => {
  const g = e.target.dataset && e.target.dataset.group;
  if (!g || $("shipSearch").value) return;
  if (e.target.open) state.openGroups.add(g); else state.openGroups.delete(g);
  store.set("openGroups", [...state.openGroups]);
}, true);
$("groups").addEventListener("change", (e) => {
  const k = e.target.dataset && e.target.dataset.ship;
  if (!k) return;
  const imp = importedKeys().has(k);
  if (e.target.checked === imp) delete state.manual[k]; else state.manual[k] = e.target.checked;
  store.set("manual", state.manual);
  const row = e.target.closest(".ship");
  row.classList.toggle("owned", e.target.checked);
  row.querySelector(".p").textContent = e.target.checked ? t("ships.inPort") : "…";
  resetRoll();
  scheduleNeeds();
  scheduleBuy();
  scheduleSim();
});
$("groups").addEventListener("click", (e) => {
  const g = e.target.dataset && (e.target.dataset.all || e.target.dataset.none);
  if (!g) return;
  const val = !!e.target.dataset.all, imp = importedKeys();
  for (const s of GROUP_SHIPS[g]) { if (imp.has(s.key) === val) delete state.manual[s.key]; else state.manual[s.key] = val; }
  store.set("manual", state.manual);
  resetRoll();
  renderGroups();
  renderNeeds();
  scheduleBuy();
  scheduleSim();
});

// ---------- Drop-Tabellen ----------
function renderDropTables() {
  const label = (e) => {
    if (e.ship) return `${esc(t("group." + e.ship))} (${t("drops.ships", { n: GROUP_SHIPS[e.ship].length })})`;
    if (e.give === "golden") return t("drops.oneGolden");
    return Object.entries(e.res).map(([k, v]) => `${fmt.format(v)} ${esc(resName(k))}`).join(", ");
  };
  $("dropTables").innerHTML = ["santa", "mega", "ultra", "golden", "bf"].map((ct) => {
    const d = CONTAINER_DEFS[ct];
    const shipP = d.slots.flat().filter((e) => e.ship).reduce((a, e) => a + e.p, 0);
    const N = state.pity[ct];
    const avgFirst = N ? (1 - Math.pow(1 - shipP, N)) / shipP : 1 / shipP;
    const slots = d.slots.map((s, i) => `${d.slots.length > 1 ? `<tr class="sub"><td colspan="2">${t("drops.slot", { n: i + 1 })}</td></tr>` : ""}` + s.map((e) => `<tr${e.ship ? ' class="shiprow"' : ""}><td>${label(e)}</td><td class="num">${fmtP(e.p)}</td></tr>`).join("")).join("");
    const comp = d.golden ? t("drops.golden") : t("drops.comp", { n: fmt.format(d.comp["Stahl"]) });
    return `<details class="plain"><summary>${esc(d.label)} <span class="mini">${t("drops.summary", { p: fmtP(shipP), n: N, avg: fmt1.format(avgFirst) })}</span></summary>
      <div class="tbl" style="margin-top: 6px;"><table><tbody>${slots}</tbody></table></div><p class="note" style="margin-top: 6px;">${comp}</p></details>`;
  }).join("");
}

// ---------- Einzeln öffnen ----------
// Golden Gift und Battle Forged aus Drops landen im Vorrat und werden per eigenem Knopf geöffnet.
let rollCtx = null, rollNo = 0;
const SANTA_POOL = ["A", "B", "C"];
for (const ct of ["santa", "mega", "ultra"]) {
  const o = document.createElement("option"); o.value = ct; o.textContent = CONTAINER_DEFS[ct].label; $("rollSel").appendChild(o);
}
function ensureRollCtx() {
  if (rollCtx) return;
  rollCtx = { owned: ownedSet(), pity: {}, pityCfg: { ...state.pity }, bfPity: buy.bfPity, inv: { golden: 0, bf: 0 }, mainOpened: 0, poolShown: false, goldShown: false,
    loot: { opened: {}, ships: [], res: {}, times: {}, got: { golden: 0, bf: 0 } } };
  rollNo = 0;
  checkNotices(true);
}
function resetRoll() {
  rollCtx = null;
  $("rollLog").innerHTML = "";
  renderLoot();
  for (const id of ["poolNotice", "goldNotice"]) { $(id).hidden = true; $(id).innerHTML = ""; }
  renderRollState();
}
const isEmpty = (groups) => groups.every((g) => !availIn(g, rollCtx.owned).length);

function showNotice(id, title, text, fresh) {
  const el = $(id);
  el.innerHTML = `<strong>${esc(title)}</strong><span>${esc(text)}</span>`;
  el.hidden = false;
  el.classList.toggle("fresh", fresh);
}
// Einblendungen, sobald der Schiffspool der Santa-Container bzw. der Golden-Gift-Pool leer ist
function checkNotices(atStart) {
  if (!rollCtx.poolShown && isEmpty(SANTA_POOL)) {
    rollCtx.poolShown = true;
    const n = SANTA_POOL.reduce((a, g) => a + GROUP_SHIPS[g].length, 0);
    showNotice("poolNotice", t("roll.poolTitle"), `${t("roll.poolText", { n: fmt.format(n) })} ${atStart ? t("roll.poolStart") : t("roll.poolAt", { n: fmt.format(rollCtx.mainOpened) })}`, !atStart);
  }
  if (!rollCtx.goldShown && isEmpty(["GR", "GG"])) {
    rollCtx.goldShown = true;
    showNotice("goldNotice", t("roll.goldTitle"), t("roll.goldText"), !atStart);
  }
  if (rollCtx.goldShown && isEmpty(["NJ"])) showNotice("goldNotice", t("roll.goldTitle"), t("roll.njDone"), false);
}
function renderRollState() {
  const inv = rollCtx ? rollCtx.inv : { golden: 0, bf: 0 };
  $("rollInv").hidden = !inv.golden && !inv.bf;
  $("openGolden").hidden = !inv.golden;
  $("openGolden").innerHTML = `${esc(t("roll.openGolden"))}<span class="count">${inv.golden}</span>`;
  $("openBf").hidden = !inv.bf;
  $("openBf").innerHTML = `${esc(t("roll.openBf"))}<span class="count">${inv.bf}</span>`;
  const types = [$("rollSel").value, "golden"].concat(isRollBf() ? ["bf"] : []);
  const label = { santa: "Santa's", mega: "Mega", ultra: "Ultra", golden: "Golden", bf: "Battle Forged" };
  $("rollStatus").textContent = t("roll.status", { list: types.map((ct) => `${label[ct]} ${rollCtx ? rollCtx.pity[ct] || 0 : 0}/${state.pity[ct]}`).join(" · ") });
}
const isRollBf = () => rollCtx && (rollCtx.inv.bf > 0 || (rollCtx.pity.bf || 0) > 0 || isEmpty(["GR", "GG"]));

function rollOpen(ct) {
  ensureRollCtx();
  const o = openContainer(ct, rollCtx);
  rollNo++;
  if (ct !== "golden" && ct !== "bf") rollCtx.mainOpened++;
  const parts = [];
  for (const s of o.ships) parts.push(`${s.name} (${ROMAN[tierOf(s)]})`);
  for (const [k, v] of Object.entries(o.res)) parts.push(`${fmt.format(v)} ${resName(k)}`);
  const line = document.createElement("div");
  if (o.ships.length) line.className = "hit";
  line.innerHTML = o.ships.map((s) => shipIcon(s)).join("") + esc(`#${rollNo} ${CONTAINER_DEFS[ct].label}: ${parts.join(" + ") || "–"}${o.forced ? t("roll.forced") : ""}${o.comp ? t("roll.comp") : ""}`);
  $("rollLog").prepend(line);
  // Erhaltene Golden Gifts und Battle Forged Container eigens hervorheben
  // Beute aufsummieren
  const L = rollCtx.loot;
  L.opened[ct] = (L.opened[ct] || 0) + 1;
  L.ships.push(...o.ships);
  for (const [k, v] of Object.entries(o.res)) { L.res[k] = (L.res[k] || 0) + v; L.times[k] = (L.times[k] || 0) + 1; }
  for (const g of o.give) L.got[g]++;
  for (const g of o.give) {
    rollCtx.inv[g]++;
    const extra = document.createElement("div");
    extra.className = g === "golden" ? "gold" : "bfline";
    extra.textContent = `   ${t(g === "golden" ? "roll.gotGolden" : "roll.gotBf")}`;
    $("rollLog").prepend(extra);
  }
  checkNotices(false);
  renderRollState();
  renderLoot();
}

// Beute-Übersicht: alles, was seit dem letzten Zurücksetzen geöffnet und erhalten wurde
const LOOT_ORDER = ["Dublonen", "Premium-Tage", "Stahl", "Kohle", "Forschungspunkte", "Elite-Kommandanten-EP", "Credits", "Hafenplätze"];
function renderLoot() {
  const L = rollCtx && rollCtx.loot;
  const total = L ? Object.values(L.opened).reduce((a, b) => a + b, 0) : 0;
  $("rollLoot").hidden = !total;
  if (!total) return;
  const label = { santa: "Santa's", mega: "Mega", ultra: "Ultra", golden: "Golden", bf: "Battle Forged" };
  const opened = ["ultra", "mega", "santa", "golden", "bf"].filter((ct) => L.opened[ct]).map((ct) => `${fmt.format(L.opened[ct])} ${label[ct]}`).join(" · ");
  const left = (g) => (rollCtx.inv[g] ? t("loot.notOpened", { n: fmt.format(rollCtx.inv[g]) }) : "");
  $("lootReadout").innerHTML = [
    [t("loot.opened"), total, opened], [t("loot.ships"), L.ships.length, ""],
    [t("loot.golden"), L.got.golden, left("golden")], [t("loot.bf"), L.got.bf, left("bf")]
  ].map(([k, v, sub]) => `<div><span class="k">${esc(k)}</span><span class="v">${fmt.format(v)}</span><span class="s">${esc(sub)}</span></div>`).join("");
  $("lootShips").innerHTML = L.ships.map((sh) => `<span class="loot-ship">${shipIcon(sh)}<span>${esc(sh.name)} <span class="mini">${ROMAN[tierOf(sh)] || ""}</span></span></span>`).join("");
  // „Booster episch (6×)“ = 6 Stück je Drop: in die Menge einrechnen und gleiche Arten zusammenfassen
  const rows = new Map();
  for (const [k, v] of Object.entries(L.res)) {
    const m = /\s*\((\d+)×\)$/.exec(k), base = m ? k.slice(0, m.index) : k, name = resName(k).replace(/\s*\(\d+×\)$/, "");
    const r = rows.get(name) || { base, name, amount: 0, times: 0 };
    r.amount += v * (m ? +m[1] : 1); r.times += L.times[k];
    rows.set(name, r);
  }
  const rank = (r) => { const i = LOOT_ORDER.indexOf(r.base); return i < 0 ? LOOT_ORDER.length : i; };
  const list = [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, LOCALE));
  $("lootBody").innerHTML = list.length ? list.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td class="num">${fmt.format(r.amount)}</td><td class="num">${fmt.format(r.times)}×</td></tr>`).join("")
    : `<tr><td colspan="3" class="mini">${esc(t("loot.none"))}</td></tr>`;
}
$("rollBtn").addEventListener("click", () => rollOpen($("rollSel").value));
$("openGolden").addEventListener("click", () => { if (rollCtx && rollCtx.inv.golden) { rollCtx.inv.golden--; rollOpen("golden"); } });
$("openBf").addEventListener("click", () => { if (rollCtx && rollCtx.inv.bf) { rollCtx.inv.bf--; rollOpen("bf"); } });
$("rollSel").addEventListener("change", renderRollState);
$("rollReset").addEventListener("click", resetRoll);

// ---------- Reiter ----------
const VIEWS = ["stufen", "kaufplan", "plan", "schiffe", "tracker"];
function showView() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "stufen";
  for (const id of VIEWS) $("v-" + id).hidden = id !== v;
  if (v === "tracker" && typeof renderTracker === "function") renderTracker();
  document.querySelectorAll("nav.tabs a").forEach((el) => { if (el.dataset.view === v) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
}
window.addEventListener("hashchange", () => {
  showView();
  const nav = document.querySelector("nav.tabs");
  if (nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
});

let trkPicked = [];

$("trkType").value = tracker.type;
$("trkPer").value = tracker.per;
function trkSum() {
  const n = int($("trkPacks").value, 0, 100000) * int($("trkPer").value, 1, 1000);
  $("trkSum").textContent = t("trk.sum", { n: fmt.format(n) });
}
for (const id of ["trkPacks", "trkPer"]) $(id).addEventListener("input", trkSum);
$("trkType").addEventListener("change", () => { tracker.type = $("trkType").value; saveTracker(); });
$("trkPer").addEventListener("change", () => { tracker.per = int($("trkPer").value, 1, 1000); $("trkPer").value = tracker.per; saveTracker(); });

// Schiffs-Suche: nur Schiffe, die dir laut Hafen, Häkchen und Tracker noch fehlen
function trkCandidates() {
  const q = shipKey($("trkSearch").value.trim());
  if (!q) return [];
  const owned = ownedSet();
  return GROUP_ORDER.flatMap((g) => GROUP_SHIPS[g]).filter((s) => !owned.has(s.key) && !trkPicked.includes(s.key) && s.key.includes(q)).slice(0, 8);
}
function renderTrkPicker() {
  const list = trkCandidates();
  $("trkResults").innerHTML = list.map((s) => `<button type="button" class="ghost trk-hit" data-key="${s.key}">${shipIcon(s)}<span class="nm">${esc(s.name)}</span><span class="tier">${ROMAN[tierOf(s)] || ""}</span></button>`).join("") +
    ($("trkSearch").value.trim() && !list.length ? `<p class="mini">${esc(t("trk.noHit"))}</p>` : "");
  $("trkPicked").innerHTML = trkPicked.map((k) => { const s = SHIP_BY_KEY.get(k); return `<button type="button" class="chip trk-chip" data-key="${k}" aria-label="${esc(t("trk.remove", { name: s.name }))}">${esc(s.name)} <span aria-hidden="true">×</span></button>`; }).join("");
}
$("trkSearch").addEventListener("input", renderTrkPicker);
$("trkSearch").addEventListener("keydown", (e) => {
  // Enter übernimmt den ersten Treffer, statt das Formular abzuschicken
  if (e.key !== "Enter" || !$("trkSearch").value.trim()) return;
  e.preventDefault();
  const first = trkCandidates()[0];
  if (first) { trkPicked.push(first.key); $("trkSearch").value = ""; renderTrkPicker(); }
});
$("trkResults").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-key]");
  if (!b) return;
  trkPicked.push(b.dataset.key); $("trkSearch").value = ""; renderTrkPicker(); $("trkSearch").focus();
});
$("trkPicked").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-key]");
  if (!b) return;
  trkPicked = trkPicked.filter((k) => k !== b.dataset.key); renderTrkPicker(); $("trkSearch").focus();
});

$("trkForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const entry = { at: Date.now(), type: $("trkType").value, packs: int($("trkPacks").value, 0, 100000), per: int($("trkPer").value, 1, 1000), golden: int($("trkGolden").value, 0, 1e7), ships: [...trkPicked] };
  const msg = $("trkMsg");
  if (!entryN(entry) && !entry.golden && !entry.ships.length) { msg.className = "msg err"; msg.textContent = t("trk.errEmpty"); return; }
  if (entry.golden > entryN(entry)) { msg.className = "msg err"; msg.textContent = t("trk.errGolden"); return; }
  if (!tracker.base) tracker.base = [...ownedSet()];
  tracker.entries.push(entry);
  saveTracker();
  trkPicked = []; $("trkGolden").value = 0; $("trkSearch").value = "";
  msg.className = "msg ok"; msg.textContent = t("trk.added", { n: fmt.format(entryN(entry)), s: fmt.format(entry.ships.length) });
  changed();
});
$("trkUndo").addEventListener("click", () => {
  if (!tracker.entries.length) return;
  tracker.entries.pop();
  if (!tracker.entries.length) tracker.base = null;
  saveTracker(); $("trkMsg").textContent = ""; changed();
});
$("trkReset").addEventListener("click", () => {
  if (!tracker.entries.length || !window.confirm(t("trk.resetConfirm"))) return;
  tracker.entries = []; tracker.base = null;
  saveTracker(); $("trkMsg").textContent = ""; changed();
});

// Simulation im eigenen Worker; eine veraltete Rechnung wird abgebrochen
let trackWorker = null, trackPending = null, trackId = 0;
const trackCache = new Map();
function startTrackWorker() {
  try {
    trackWorker = new Worker(WORKER_URL);
    trackWorker.onmessage = (e) => {
      if (!trackPending || trackPending.id !== e.data.id) return;
      const key = trackPending.key; trackPending = null;
      trackCache.set(key, e.data.result);
      if (key === trackKey()) drawTrackResult(e.data.result);
    };
    trackWorker.onerror = () => { trackWorker = null; trackPending = null; };
  } catch { trackWorker = null; }
}
startTrackWorker();
const trackParams = () => ({ ownedKeys: tracker.base || [], pityCfg: { ...state.pity }, bfPity: buy.bfPity,
  steps: tracker.entries.filter((e) => entryN(e) > 0).map((e) => ({ type: e.type, n: entryN(e) })), runs: TRACK_RUNS });
const trackKey = () => JSON.stringify(trackParams());

function renderTracker() {
  trkSum(); renderTrkPicker(); renderTrkMissing(); renderTrkLog();
  const has = tracker.entries.length > 0;
  $("trkEmpty").hidden = has; $("trkBody").hidden = !has;
  $("trkUndo").disabled = !has; $("trkReset").disabled = !has;
  if (!has) { $("trkState").textContent = ""; return; }
  const key = trackKey();
  if (trackCache.has(key)) { drawTrackResult(trackCache.get(key)); return; }
  $("trkState").dataset.busy = "true"; $("trkState").textContent = t("calc.busy");
  $("trkBody").classList.add("stale");
  if (trackPending) { if (trackPending.key === key) return; trackWorker.terminate(); trackPending = null; startTrackWorker(); }
  const params = trackParams();
  if (trackWorker) { trackPending = { id: ++trackId, key }; trackWorker.postMessage({ id: trackPending.id, kind: "track", params }); }
  else setTimeout(() => { const res = runTrack({ ...params, runs: 300 }); trackCache.set(key, res); if (key === trackKey()) drawTrackResult(res); }, 0);
}

function drawTrackResult(res) {
  $("trkState").dataset.busy = "false"; $("trkState").textContent = t("calc.runs", { n: fmt.format(res.runs) });
  $("trkBody").classList.remove("stale");
  const tracked = trackedKeys(), base = new Set(tracker.base || []);
  const k = tracker.entries.reduce((a, e) => a + e.ships.length, 0);
  const g = tracker.entries.reduce((a, e) => a + e.golden, 0);
  const sl = luckOf(res.ships, res.runs, k), gl = luckOf(res.golden, res.runs, g);
  const total = tracker.entries.reduce((a, e) => a + entryN(e), 0);
  const byType = TRACK_TYPES.map((ty) => [ty, tracker.entries.filter((e) => e.type === ty).reduce((a, e) => a + entryN(e), 0)]).filter(([, n]) => n);
  // Sehr kleine oder sehr große Anteile nicht als 0 % bzw. 100 % zeigen
  const fp = (p) => (p <= 0 ? `< ${fmtP(1 / res.runs)}` : p >= 1 ? `> ${fmtP(1 - 1 / res.runs)}` : fmtP(p));
  const fm = (m) => fmt1.format(m);
  const band = sl.luck >= 0.85 ? "trk.v5" : sl.luck >= 0.6 ? "trk.v4" : sl.luck > 0.4 ? "trk.v3" : sl.luck > 0.15 ? "trk.v2" : "trk.v1";
  $("trkReadout").innerHTML = [
    [t("trk.kCont"), fmt.format(total), byType.map(([ty, n]) => `${fmt.format(n)} ${SHORT[ty]}`).join(" · "), ""],
    [t("trk.kShips"), fmt.format(k), t("trk.expected", { m: fm(sl.mean) }), ""],
    [t("trk.kGolden"), fmt.format(g), t("trk.expected", { m: fm(gl.mean) }), ""],
    [t("trk.kLuck"), fp(sl.luck), t(band), " accent"]
  ].map(([kk, v, sub, cls]) => `<div><span class="k">${esc(kk)}</span><span class="v${cls}">${esc(v)}</span><span class="s">${esc(sub)}</span></div>`).join("");
  $("trkVerdict").textContent = t("trk.verdict", { band: t(band), p: fp(sl.luck) });
  $("trkProb").textContent = t("trk.prob", { k: fmt.format(k), pe: fp(sl.pExact), pa: fp(sl.pAtLeast), pb: fp(sl.pAtMost) });
  $("trkHistCap").textContent = t("trk.histCap", { n: fmt.format(total) });
  drawTrackHist(res, k);
  $("trkGoldLine").textContent = t("trk.goldLine", { g: fmt.format(g), m: fm(gl.mean), l: fp(gl.luck) });
  const njBefore = NJ_KEYS.every((key) => base.has(key));
  $("trkNjLine").hidden = njBefore;
  if (!njBefore) $("trkNjLine").textContent = t(NJ_KEYS.some((key) => tracked.has(key)) ? "trk.njGot" : "trk.njNot", { p: fp(res.nj / res.runs) });
}

// Säulen: Anteil der Durchläufe je Anzahl neuer Schiffe, dein Ergebnis hervorgehoben
let lastTrkHist = null;
window.addEventListener("resize", debounce(() => { if (lastTrkHist && !$("v-tracker").hidden) drawTrackHist(...lastTrkHist); }, 150));
function drawTrackHist(res, k) {
  const h = res.ships, n = res.runs;
  let lo = 0, hi = h.length - 1, cum = 0;
  for (let i = 0; i < h.length; i++) { cum += h[i]; if (cum / n >= 0.002) { lo = i; break; } }
  cum = 0;
  for (let i = h.length - 1; i >= 0; i--) { cum += h[i]; if (cum / n >= 0.002) { hi = i; break; } }
  lo = Math.min(lo, k); hi = Math.max(hi, k);
  lastTrkHist = [res, k];
  // In der echten Breite zeichnen, damit Schrift und Höhe auf jedem Bildschirm passen
  const W = Math.max(280, Math.round($("trkHist").clientWidth || 640)), H = W < 500 ? 130 : 170, L = 8, R = 8, T = 10, B = 26, cols = hi - lo + 1;
  const bw = (W - L - R) / cols, max = Math.max(...h.slice(lo, hi + 1), 1);
  let bars = "";
  for (let i = lo; i <= hi; i++) {
    const v = h[i] || 0, bh = v / max * (H - T - B), x = L + (i - lo) * bw;
    const tip = esc(t("trk.histBar", { k: fmt.format(i), p: fmtP(v / n) }));
    bars += `<rect class="${i === k ? "me" : "bar"}" x="${(x + Math.min(1, bw * 0.15)).toFixed(1)}" y="${(H - B - Math.max(i === k ? 2 : 0, bh)).toFixed(1)}" width="${Math.max(1, bw - Math.min(2, bw * 0.3)).toFixed(1)}" height="${Math.max(i === k ? 2 : 0, bh).toFixed(1)}"><title>${tip}</title></rect>`;
  }
  const lab = (i, anchor) => `<text x="${(L + (i - lo + 0.5) * bw).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${fmt.format(i)}</text>`;
  const labels = [lab(lo, "start"), lab(hi, "end")];
  if (k !== lo && k !== hi) labels.push(`<text class="me-l" x="${(L + (k - lo + 0.5) * bw).toFixed(1)}" y="${H - 8}" text-anchor="middle">${fmt.format(k)}</text>`);
  $("trkHist").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="trkHistCap"><line class="base" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${bars}${labels.join("")}</svg>`;
}

function renderTrkMissing() {
  const owned = ownedSet();
  $("trkMissing").innerHTML = GROUP_ORDER.map((g) => {
    const all = GROUP_SHIPS[g], miss = all.filter((s) => !owned.has(s.key));
    const head = `<div class="trk-mh"><strong>${esc(t("group." + g))}</strong><span class="mini">${miss.length ? t("trk.missGroup", { miss: fmt.format(miss.length), total: fmt.format(all.length) }) : t("trk.missNone")}</span></div>`;
    if (!miss.length) return `<div class="trk-mg done">${head}</div>`;
    // Kleine Gruppen mit Namen, große nach Stufe zusammengefasst
    if (all.length <= 8) return `<div class="trk-mg">${head}<p class="trk-names">${miss.map((s) => esc(s.name)).join(" · ")}</p></div>`;
    const byTier = {};
    for (const s of miss) byTier[tierOf(s)] = (byTier[tierOf(s)] || 0) + 1;
    const tiers = Object.keys(byTier).map(Number).sort((a, b) => b - a).map((tr) => `${ROMAN[tr]}: ${fmt.format(byTier[tr])}`).join(" · ");
    return `<div class="trk-mg">${head}<p class="trk-names">${esc(tiers)}</p></div>`;
  }).join("");
}

function renderTrkLog() {
  const dt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  $("trkLog").innerHTML = tracker.entries.length ? [...tracker.entries].reverse().map((e) => `<tr>
    <td>${esc(dt.format(e.at))}</td>
    <td>${entryN(e) ? esc(t("trk.logCont", { packs: fmt.format(e.packs), per: fmt.format(e.per), c: SHORT[e.type] })) : t("trk.logNone")}</td>
    <td class="num">${fmt.format(e.golden)}</td>
    <td>${e.ships.length ? e.ships.map((key) => esc(SHIP_BY_KEY.get(key).name)).join(", ") : t("trk.logNone")}</td></tr>`).join("")
    : `<tr><td colspan="4" class="mini">${esc(t("trk.logEmpty"))}</td></tr>`;
}

// ---------- Neu zeichnen ----------
function changed() {
  resetRoll();
  renderNeeds();
  requestBuy();
  renderPlanInputs();
  renderGroups();
  scheduleSim();
  renderTracker();
}

// ---------- Start ----------
if (state.imported) applyExtra(state.imported.extra); else rebuildTiers();
renderDropTables();
setFilter(state.filter === "all" ? "all" : "missing");
if (session && !sessionValid()) { session = null; store.set("session", null); importMsg(t("msg.expired")); }
setSource(state.source === "manual" ? "manual" : "import");
handleCallback();
if (sessionValid() && !state.imported) loadPort();
showView();
})();
