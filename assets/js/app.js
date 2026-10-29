(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("de-DE");
const fmt1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const fmtP = (p) => (p * 100).toLocaleString("de-DE", { maximumFractionDigits: p > 0 && p < 0.001 ? 3 : p < 0.1 ? 2 : 1 }) + " %";
const ROMAN = { 0: "?", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "★" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const store = {
  get(k, d) { try { const v = localStorage.getItem("santa26:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem("santa26:" + k); else localStorage.setItem("santa26:" + k, JSON.stringify(v)); } catch { /* Speicher gesperrt */ } }
};

// ---------- Farbschema ----------
const THEMES = ["auto", "light", "dark"];
const THEME_LABEL = { auto: "Auto", light: "Hell", dark: "Dunkel" };
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  $("themeLabel").textContent = THEME_LABEL[t];
  $("themeBtn").setAttribute("aria-label", `Farbschema: ${THEME_LABEL[t]}. Klicken zum Wechseln`);
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = t === "auto" ? (m.media.includes("dark") ? "#0d1922" : "#eef2f1") : bg; });
}
let theme = store.get("theme", "auto");
if (!THEMES.includes(theme)) theme = "auto";
$("themeBtn").addEventListener("click", () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  store.set("theme", theme === "auto" ? null : theme);
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
  pity: { ...PITY_DEFAULT, ...store.get("pity", {}) },
  filter: store.get("filter", "missing"),
  ctype: store.get("ctype", "santa"),
  openGroups: new Set(store.get("openGroups", []))
};
if (!CONTAINER_DEFS[state.ctype] || state.ctype === "golden" || state.ctype === "bf") state.ctype = "santa";

const hasImport = () => state.source === "import" && state.imported && state.imported.ids.length > 0;
function importedKeys() {
  const s = new Set();
  if (hasImport()) for (const id of state.imported.ids) { const sh = SHIPS.get(id); if (sh) s.add(shipKey(sh.name)); }
  return s;
}
// Besitz der Container-Schiffe: Import (per Name) plus Häkchen von Hand
function ownedSet() {
  const imp = importedKeys(), s = new Set();
  for (const g of GROUP_ORDER) for (const sh of GROUP_SHIPS[g]) {
    const m = state.manual[sh.key];
    if (m === true || (m !== false && imp.has(sh.key))) s.add(sh.key);
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
  $("gateTitle").textContent = pendingLogin ? "Anmeldung erfolgreich" : "Server wählen und anmelden";
  $("gateSub").textContent = pendingLogin ? `Willkommen, ${session.nick || session.account}. Dein Hafen wird geladen …` : "Du wirst zur Anmeldung bei Wargaming weitergeleitet. Danach weiß der Rechner, welche Schiffe du schon hast.";
  $("userbar").hidden = !logged || gate || state.source === "manual";
  $("ubLogin").hidden = gate || state.source !== "manual";
  if (!logged) return;
  $("ubName").textContent = session.nick || session.account;
  $("ubRealm").textContent = REALM_LABEL[session.realm] || session.realm;
}
$("appId").addEventListener("input", (e) => { store.set("appId", e.target.value.trim()); });

document.querySelectorAll("[data-realm]").forEach((b) => b.addEventListener("click", () => {
  if (!appId()) { importMsg("Für die Anmeldung fehlt die Wargaming Application ID.", "err"); $("appId").focus(); return; }
  const realm = b.dataset.realm;
  const exp = Math.floor(Date.now() / 1000) + 14 * 86400;
  location.href = `https://api.worldoftanks.${realm}/wot/auth/login/?application_id=${encodeURIComponent(appId())}&expires_at=${exp}&redirect_uri=${encodeURIComponent(`${selfUrl()}?realm=${realm}`)}`;
}));

// Rücksprung auswerten und den Schlüssel sofort aus der Adresszeile entfernen
function handleCallback() {
  const q = new URLSearchParams(location.search);
  if (!q.has("status")) return;
  history.replaceState(null, "", selfUrl() + location.hash);
  if (q.get("status") !== "ok") {
    importMsg(`Anmeldung abgebrochen oder fehlgeschlagen (${q.get("message") || q.get("code") || q.get("status")}).`, "err");
    return;
  }
  const realm = REALM_LABEL[q.get("realm")] ? q.get("realm") : "eu";
  session = { realm, token: q.get("access_token"), account: q.get("account_id"), nick: q.get("nickname") || "", exp: +q.get("expires_at") || 0 };
  if (!session.token || !session.account) { session = null; importMsg("Wargaming hat keinen Zugriffsschlüssel geliefert. Bitte erneut anmelden.", "err"); return; }
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
  try { res = await fetch(u); } catch { throw new Error("Wargaming ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es gleich noch einmal."); }
  const j = await res.json().catch(() => null);
  if (!j) throw new Error(`Unerwartete Antwort von Wargaming (HTTP ${res.status}).`);
  if (j.status !== "ok") {
    const msg = (j.error && j.error.message) || "unbekannt";
    const e = new Error(msg === "INVALID_ACCESS_TOKEN" ? "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an." :
      msg === "INVALID_APPLICATION_ID" ? "Die Application ID ist ungültig." :
      msg === "REQUEST_LIMIT_EXCEEDED" ? "Zu viele Anfragen. Warte kurz und lade dann neu." : `Wargaming meldet: ${msg}`);
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
  importMsg("Lade Hafen von Wargaming …");
  try {
    const data = await wgGet(session.realm, "account/info/", { account_id: session.account, access_token: session.token, fields: "private.port", extra: "private.port" });
    const acc = data && data[session.account];
    if (!acc) throw new Error("Konto nicht gefunden.");
    if (!acc.private || !Array.isArray(acc.private.port)) throw new Error("Wargaming liefert keine Hafendaten. Bitte melde dich neu an.");
    const ids = [...new Set(acc.private.port.map(Number))];
    let extra = {};
    try { extra = await resolveUnknown(session.realm, ids); } catch { /* Enzyklopädie ist optional */ }
    applyExtra(extra);
    state.imported = { ids, kind: "port", at: Date.now(), extra };
    store.set("imported", state.imported);
    const found = ownedSet().size;
    importMsg(`Hafen geladen: ${fmt.format(ids.length)} Schiffe, davon ${fmt.format(found)} aus den Container-Listen.`, "ok");
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
  importMsg("Abgemeldet. Deine Hafendaten sind aus diesem Browser gelöscht.");
  renderAccount();
  changed();
});

// ---------- Benötigte Container je Stufe ----------
const NEED_ROWS = [{ label: "Irgendein neues Schiff", tier: null }].concat([10, 9, 8, 7, 6, 5].map((t) => ({ label: `Stufe ${ROMAN[t]}`, tier: t })));
const SHORT = { santa: "Santa's Gift", mega: "Mega Gift", ultra: "Ultra Gift" };

const NEED_RUNS = 1000, NEED_CAP = 20000;

// Eigener Worker, damit die Tabelle nicht hinter der Plan-Simulation warten muss
let needsWorker = null, needsId = 0;
const needsCache = new Map();   // Schlüssel: Typ + Garantie + Besitz -> Ergebnis
try {
  needsWorker = new Worker("assets/js/sim-worker.js");
  needsWorker.onmessage = (e) => { const job = needsJobs.get(e.data.id); if (job) { needsJobs.delete(e.data.id); needsCache.set(job, e.data.result); if (job === needsKey()) drawNeeds(e.data.result); } };
  needsWorker.onerror = () => { needsWorker = null; };
} catch { needsWorker = null; }
const needsJobs = new Map();

function needsKey() { return `${state.ctype}|${state.pity[state.ctype]}|${state.pity.golden}|${[...ownedSet()].sort().join(",")}`; }
function missingByRow(owned) {
  const def = CONTAINER_DEFS[state.ctype];
  const groups = [...new Set(def.slots.flat().filter((e) => e.ship).map((e) => e.ship))].concat(["GR", "GG"]);
  return NEED_ROWS.map((row) => groups.reduce((a, g) => a + availIn(g, owned).filter((s) => row.tier == null || tierOf(s) === row.tier).length, 0));
}

function renderNeeds() {
  const type = state.ctype;
  document.querySelectorAll("[data-ctype]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ctype === type));
  $("needsLede").textContent = `So viele ${SHORT[type]} musst du öffnen, bis du mit 50 % bzw. 90 % Wahrscheinlichkeit ein neues Schiff der Stufe bekommst. Schiffe in deinem Hafen sind herausgerechnet, die Garantie nach ${state.pity[type]} Containern ist eingerechnet.`;
  $("needsNote").textContent = `Simulation mit ${fmt.format(NEED_RUNS)} Durchläufen: Gezogene Schiffe fallen aus dem Pool, Golden Gift aus dem Container wird mitgeöffnet. Balken logarithmisch, kräftig = 50 %, hell = 90 %.` +
    (!hasImport() && !Object.keys(state.manual).length ? " Ohne Anmeldung gilt jedes Schiff als fehlend." : "");
  const key = needsKey();
  if (needsCache.has(key)) { drawNeeds(needsCache.get(key)); return; }
  drawNeeds(null);
  const tiers = {};
  for (const g of GROUP_ORDER) for (const s of GROUP_SHIPS[g]) if (!s.tier) tiers[s.key] = tierOf(s);
  const params = { ownedKeys: [...ownedSet()], type, pityCfg: { ...state.pity }, runs: NEED_RUNS, cap: NEED_CAP,
    targets: NEED_ROWS.map((r, i) => ({ id: "r" + i, tier: r.tier })), tiers };
  const id = ++needsId;
  needsJobs.set(id, key);
  if (needsWorker) needsWorker.postMessage({ id, kind: "needs", params });
  else setTimeout(() => { const res = runNeeds({ ...params, runs: 400 }); needsCache.set(key, res); if (key === needsKey()) drawNeeds(res); }, 0);
}

// result = null zeichnet die Tabelle mit Platzhaltern, solange gerechnet wird
function drawNeeds(result) {
  const missing = missingByRow(ownedSet());
  const fin = result ? Object.values(result).flatMap((r) => [r.p90]).filter(Number.isFinite) : [];
  const maxLog = Math.log10(Math.max(10, ...fin));
  const w = (n) => (Number.isFinite(n) ? Math.max(2, Math.log10(Math.max(1, n)) / maxLog * 100) : 100).toFixed(1);
  const num = (n) => (Number.isFinite(n) ? fmt.format(n) : `> ${fmt.format(NEED_CAP)}`);
  $("needsBody").innerHTML = NEED_ROWS.map((row, i) => {
    const head = `<th scope="row">${esc(row.label)}<span class="miss-inline">${fmt.format(missing[i])} fehlen dir</span></th><td class="num col-miss">${fmt.format(missing[i])}</td>`;
    if (!missing[i]) return `<tr class="done">${head}<td colspan="3" class="mini">alle im Hafen</td></tr>`;
    const r = result && result["r" + i];
    if (!r) return `<tr${row.tier == null ? ' class="any"' : ""}>${head}<td class="num big wait">…</td><td class="num big wait">…</td><td class="bar-col"><span class="nbar"></span></td></tr>`;
    return `<tr${row.tier == null ? ' class="any"' : ""}>${head}<td class="num big">${num(r.p50)}</td><td class="num big">${num(r.p90)}</td>
      <td class="bar-col"><span class="nbar" aria-hidden="true"><span class="p90" style="width:${w(r.p90)}%"></span><span class="p50" style="width:${w(r.p50)}%"></span></span></td></tr>`;
  }).join("");
  $("needsTitle").setAttribute("aria-busy", result ? "false" : "true");
}
document.querySelectorAll("[data-ctype]").forEach((b) => b.addEventListener("click", () => {
  state.ctype = b.dataset.ctype; store.set("ctype", state.ctype); renderNeeds();
}));
const scheduleNeeds = debounce(renderNeeds, 250);

// ---------- Plan ----------
const PLAN_IDS = { free: "c-free", pass: "c-pass", tokens: "c-tokens", tokenUse: "c-tokenUse", santa: "c-santa", mega: "c-mega", ultra: "c-ultra", golden: "c-golden" };
function readPlan() {
  const n = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
  return { free: n("c-free"), pass: n("c-pass"), tokens: n("c-tokens"), tokenUse: $("c-tokenUse").value, santa: n("c-santa"), mega: n("c-mega"), ultra: n("c-ultra"), golden: n("c-golden") };
}
function planCounts(p) {
  const t = p.tokenUse === "santa" ? { santa: p.tokens, mega: 0 } : p.tokenUse === "mega" ? { santa: 0, mega: Math.floor(p.tokens / 5) } : { santa: 0, mega: 0 };
  return { ultra: p.ultra, mega: p.mega + t.mega, santa: p.free + p.pass + p.santa + t.santa, golden: p.golden };
}
function renderPlanInputs() {
  const p = readPlan(), c = planCounts(p);
  const rest = p.tokenUse === "mega" ? p.tokens % 5 : 0;
  $("tokenHint").textContent = p.tokenUse === "mega" ? `5 Tokens je Mega: ${fmt.format(Math.floor(p.tokens / 5))} Mega${rest ? `, ${rest} übrig` : ""}` : p.tokenUse === "santa" ? `1 Token je Santa's: ${fmt.format(p.tokens)} Santa's Gift` : `375.000 je Token: ${fmt.format(p.tokens * 375000)} Credits`;
  const parts = [];
  if (c.santa) parts.push(`${fmt.format(c.santa)} Santa's Gift`);
  if (c.mega) parts.push(`${fmt.format(c.mega)} Mega`);
  if (c.ultra) parts.push(`${fmt.format(c.ultra)} Ultra`);
  if (c.golden) parts.push(`${fmt.format(c.golden)} Golden`);
  $("totalNote").textContent = parts.length ? `Gerechnet wird mit ${parts.join(", ")}. Golden und Battle Forged aus Drops werden automatisch mitgeöffnet.` : "Trag ein, welche Container du öffnen willst.";
}
if (state.plan) for (const [k, id] of Object.entries(PLAN_IDS)) if (state.plan[k] !== undefined) $(id).value = state.plan[k];
for (const id of Object.values(PLAN_IDS)) {
  $(id).addEventListener(id === "c-tokenUse" ? "change" : "input", () => {
    state.plan = readPlan(); store.set("plan", state.plan);
    renderPlanInputs();
    scheduleSim();
  });
}
for (const t of Object.keys(PITY_DEFAULT)) {
  const inp = $("p-" + t);
  inp.value = state.pity[t];
  inp.addEventListener("change", () => { state.pity[t] = Math.max(1, parseInt(inp.value, 10) || PITY_DEFAULT[t]); inp.value = state.pity[t]; store.set("pity", state.pity); renderDropTables(); renderNeeds(); scheduleSim(); });
}
$("runs").addEventListener("change", () => scheduleSim());

// ---------- Simulation im Hintergrund ----------
let worker = null, simId = 0, lastSim = null;
try {
  worker = new Worker("assets/js/sim-worker.js");
  worker.onmessage = (e) => { if (e.data.id === simId) finishSim(e.data.result); };
  worker.onerror = () => { worker = null; scheduleSim(); };
} catch { worker = null; }

function startSim() {
  const runs = Math.min(20000, Math.max(200, parseInt($("runs").value, 10) || 3000));
  const params = { ownedKeys: [...ownedSet()], cnt: planCounts(readPlan()), runs, pityCfg: { ...state.pity } };
  const id = ++simId;
  $("calcState").dataset.busy = "true";
  $("calcState").textContent = "Rechnet …";
  if (worker) worker.postMessage({ id, kind: "plan", params });
  else setTimeout(() => { if (id === simId) finishSim(runPlan(params)); }, 0);
}
const scheduleSim = debounce(startSim, 200);
function finishSim(result) {
  lastSim = result;
  $("calcState").dataset.busy = "false";
  $("calcState").textContent = `${fmt.format(result.runs)} Durchläufe`;
  renderSim(result);
  refreshGroupStats();
}

function renderSim(sim) {
  const atLeast1 = 1 - (sim.hist[0] || 0) / sim.runs;
  const nj = (sim.shipHits[shipKey("New Jersey BF")] || 0) / sim.runs;
  readout($("contReadout"), [
    { k: "Ø neue Schiffe", v: fmt1.format(sim.mean), s: "aus deinem Plan", accent: true },
    { k: "Mind. 1 Schiff", v: fmtP(atLeast1), s: "Wahrscheinlichkeit" },
    { k: "Ø Golden Gift", v: fmt1.format(sim.golden), s: "werden geöffnet" },
    { k: "New Jersey BF", v: fmtP(nj), s: sim.bf > 0 ? `Ø ${fmt1.format(sim.bf)} Battle Forged Container` : "erst wenn alle Golden-Schiffe da sind" }
  ]);
  const keys = Object.keys(sim.hist).map(Number).sort((a, b) => a - b);
  const rows = [];
  for (let k = keys[0]; k <= keys[keys.length - 1]; k++) rows.push([k, sim.hist[k] || 0]);
  const maxV = Math.max(...rows.map((r) => r[1]));
  let cum = 0, median = 0;
  for (const [k, v] of rows) { cum += v; if (cum >= sim.runs / 2) { median = k; break; } }
  $("histNote").textContent = `So viele neue Schiffe bekommst du mit welcher Wahrscheinlichkeit. Median ${fmt.format(median)}.` + (sim.comps > 0.005 ? ` Ø ${fmt1.format(sim.comps)}× Stahl statt Schiff, weil dir kein Schiff des Containers mehr fehlt.` : "");
  $("hist").innerHTML = rows.slice(0, 20).map(([k, v]) => `<div class="b"><span>${k} Schiff${k === 1 ? "" : "e"}</span><span class="bar${k === 0 ? " zero" : ""}" style="width:${(v / maxV * 100).toFixed(1)}%"></span><span style="text-align: right;">${fmtP(v / sim.runs)}</span></div>`).join("") + (rows.length > 20 ? `<div class="mini">… bis ${keys[keys.length - 1]} Schiffe</div>` : "");
  $("hist").setAttribute("aria-label", `Verteilung: Median ${median} neue Schiffe, mindestens eines mit ${fmtP(atLeast1)}`);
  const ORDER = ["Stahl", "Kohle", "Dublonen", "Credits", "Elite-Kommandanten-EP", "Forschungspunkte", "Premium-Tage", "Hafenplätze", "Signale (25×)"];
  const res = Object.entries(sim.resSum).sort((a, b) => {
    const ia = ORDER.indexOf(a[0]), ib = ORDER.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], "de");
  });
  $("resBody").innerHTML = res.length ? res.map(([k, v]) => { const a = v / sim.runs; return `<tr><td>${esc(k)}</td><td class="num">${a >= 100 ? fmt.format(Math.round(a)) : fmt1.format(a)}</td></tr>`; }).join("") : `<tr><td colspan="2" class="mini">Keine Container im Plan.</td></tr>`;
}
function readout(el, items) {
  el.innerHTML = items.map((it) => `<div><span class="k">${esc(it.k)}</span><span class="v${it.accent ? " accent" : ""}">${it.v}</span>${it.s ? `<span class="s">${it.s}</span>` : ""}</div>`).join("");
}

// ---------- Schiffsliste ----------
function shipChance(g) {
  return lastSim && lastSim.missing[g] ? Math.min(1, (lastSim.groupHits[g] || 0) / lastSim.runs / lastSim.missing[g]) : 0;
}
function groupSub(g, owned) {
  if (GROUP_SHIPS[g].every((s) => owned.has(s.key))) return "Alle im Hafen";
  if (!lastSim) return "";
  return `Mit deinem Plan mind. ein Schiff daraus: ${fmtP((lastSim.groupAny[g] || 0) / lastSim.runs)}`;
}
function renderOwnedNote(owned) {
  const all = GROUP_ORDER.reduce((a, g) => a + GROUP_SHIPS[g].length, 0);
  $("ownedNote").textContent = `${fmt.format(owned.size)} von ${fmt.format(all)} Container-Schiffen sind in deinem Hafen. ` +
    (hasImport() ? "Erkannt aus deinem Wargaming-Konto, per Häkchen korrigierbar." : "Hake die Schiffe ab, die du schon hast.");
}
function refreshGroupStats() {
  const owned = ownedSet();
  renderOwnedNote(owned);
  document.querySelectorAll("#groups details.grp").forEach((d) => {
    const g = d.dataset.group;
    d.querySelector(".gsub").textContent = groupSub(g, owned);
    d.querySelector(".gstat").textContent = `${GROUP_SHIPS[g].filter((s) => owned.has(s.key)).length}/${GROUP_SHIPS[g].length}`;
    const p = fmtP(shipChance(g));
    d.querySelectorAll(".ship").forEach((row) => { row.querySelector(".p").textContent = row.querySelector("input").checked ? "im Hafen" : p; });
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
      const src = state.manual[s.key] !== undefined ? "von Hand" : imp.has(s.key) ? "Import" : "";
      return `<label class="ship${has ? " owned" : ""}"><input type="checkbox" data-ship="${esc(s.key)}" ${has ? "checked" : ""}><span class="nm">${esc(s.name)}${src ? ` <span class="src">${src}</span>` : ""}</span><span class="tier">${ROMAN[tierOf(s)]}</span><span class="p">${has ? "im Hafen" : lastSim ? fmtP(p) : ""}</span></label>`;
    }).join("");
    html += `<details class="grp" data-group="${g}"${open ? " open" : ""}>
      <summary><span class="gname">${esc(SANTA_GROUPS[g].label)}</span><span class="gstat">${og}/${list.length}</span><span class="gsub">${groupSub(g, owned)}</span></summary>
      <div class="grp-actions"><button type="button" class="ghost sm" data-all="${g}">Alle im Hafen</button><button type="button" class="ghost sm" data-none="${g}">Keins im Hafen</button></div>
      ${rows ? `<div class="ships">${rows}</div>` : `<div class="empty">${missingOnly ? "Du hast alle Schiffe dieser Gruppe." : "Keine Treffer."}</div>`}
    </details>`;
  }
  $("groups").innerHTML = html || `<div class="empty">Kein Schiff gefunden.</div>`;
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
  row.querySelector(".p").textContent = e.target.checked ? "im Hafen" : "…";
  rollCtx = null;
  scheduleNeeds();
  scheduleSim();
});
$("groups").addEventListener("click", (e) => {
  const g = e.target.dataset && (e.target.dataset.all || e.target.dataset.none);
  if (!g) return;
  const val = !!e.target.dataset.all, imp = importedKeys();
  for (const s of GROUP_SHIPS[g]) { if (imp.has(s.key) === val) delete state.manual[s.key]; else state.manual[s.key] = val; }
  store.set("manual", state.manual);
  rollCtx = null;
  renderGroups();
  renderNeeds();
  scheduleSim();
});

// ---------- Drop-Tabellen ----------
function renderDropTables() {
  const label = (e) => {
    if (e.ship) return `${esc(SANTA_GROUPS[e.ship].label)} (${GROUP_SHIPS[e.ship].length} Schiffe)`;
    if (e.give === "golden") return "1× Golden Gift";
    return Object.entries(e.res).map(([k, v]) => `${fmt.format(v)} ${esc(k)}`).join(", ");
  };
  $("dropTables").innerHTML = ["santa", "mega", "ultra", "golden", "bf"].map((t) => {
    const d = CONTAINER_DEFS[t];
    const shipP = d.slots.flat().filter((e) => e.ship).reduce((a, e) => a + e.p, 0);
    const N = state.pity[t];
    const avgFirst = N ? (1 - Math.pow(1 - shipP, N)) / shipP : 1 / shipP;
    const slots = d.slots.map((s, i) => `${d.slots.length > 1 ? `<tr class="sub"><td colspan="2">Platz ${i + 1}</td></tr>` : ""}` + s.map((e) => `<tr${e.ship ? ' class="shiprow"' : ""}><td>${label(e)}</td><td class="num">${fmtP(e.p)}</td></tr>`).join("")).join("");
    const comp = d.golden ? "Hast du alle drei neuen Schiffe, steigt die Gold-Gruppe auf 10 %. Hast du alle sieben, gibt es stattdessen einen Battle Forged Premium Container." : `Hast du alle Schiffe einer Gruppe, kommt das Schiff aus einer anderen Gruppe. Erst wenn dir kein Schiff des Containers fehlt: ${fmt.format(d.comp["Stahl"])} Stahl.`;
    return `<details class="plain"><summary>${esc(d.label)} <span class="mini">· Schiff ${fmtP(shipP)} · Garantie nach ${N} · Ø ${fmt1.format(avgFirst)} bis zum ersten Schiff</span></summary>
      <div class="tbl" style="margin-top: 6px;"><table><tbody>${slots}</tbody></table></div><p class="note" style="margin-top: 6px;">${comp}</p></details>`;
  }).join("");
}

// ---------- Einzeln öffnen ----------
let rollCtx = null, rollNo = 0;
for (const t of ["santa", "mega", "ultra", "golden", "bf"]) {
  const o = document.createElement("option"); o.value = t; o.textContent = CONTAINER_DEFS[t].label; $("rollSel").appendChild(o);
}
$("rollBtn").addEventListener("click", () => {
  if (!rollCtx) { rollCtx = { owned: ownedSet(), pity: {}, pityCfg: { ...state.pity } }; rollNo = 0; }
  const t = $("rollSel").value;
  const o = openContainer(t, rollCtx);
  rollNo++;
  const parts = [];
  for (const s of o.ships) parts.push(`${s.name} (${ROMAN[tierOf(s)]})`);
  for (const [k, v] of Object.entries(o.res)) parts.push(`${fmt.format(v)} ${k}`);
  for (const g of o.give) parts.push(g === "golden" ? "1× Golden Gift" : "1× Battle Forged Container");
  const line = document.createElement("div");
  if (o.ships.length) line.className = "hit";
  line.textContent = `#${rollNo} ${CONTAINER_DEFS[t].label}: ${parts.join(" + ")}${o.forced ? " (Garantie)" : ""}${o.comp ? " (Ersatz)" : ""}`;
  $("rollLog").prepend(line);
});
$("rollReset").addEventListener("click", () => { rollCtx = null; $("rollLog").innerHTML = ""; });

// ---------- Neu zeichnen ----------
function changed() {
  rollCtx = null;
  renderNeeds();
  renderPlanInputs();
  renderGroups();
  scheduleSim();
}

// ---------- Start ----------
if (state.imported) applyExtra(state.imported.extra); else rebuildTiers();
renderDropTables();
setFilter(state.filter === "all" ? "all" : "missing");
if (session && !sessionValid()) { session = null; store.set("session", null); importMsg("Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."); }
setSource(state.source === "manual" ? "manual" : "import");
handleCallback();
if (sessionValid() && !state.imported) loadPort();
})();
