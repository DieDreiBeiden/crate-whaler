// Container-Simulation. Wird von der Seite (Einzeln öffnen) und vom Worker (Monte-Carlo) geladen.
// Erwartet SANTA_GROUPS und CONTAINER_DEFS aus santa2026.js.

const shipKey = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const GROUP_ORDER = ["A", "B", "C", "GR", "GG", "NJ"];
const PITY_DEFAULT = { santa: 100, mega: 15, ultra: 7, golden: 10, bf: 3 };

// Gruppe -> [{ name, tier, key, group }]
const GROUP_SHIPS = {};
for (const [g, def] of Object.entries(SANTA_GROUPS)) {
  GROUP_SHIPS[g] = [];
  for (const [tier, list] of Object.entries(def.tiers)) {
    for (const name of list.split("|")) GROUP_SHIPS[g].push({ name, tier: +tier, key: shipKey(name), group: g });
  }
  GROUP_SHIPS[g].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name, "de"));
}

function pickWeighted(entries, total) {
  let r = Math.random() * total;
  for (const e of entries) { r -= e.p; if (r < 0) return e; }
  return entries[entries.length - 1];
}
const availIn = (g, owned) => GROUP_SHIPS[g].filter((s) => !owned.has(s.key));

// Öffnet einen Container. ctx = { owned: Set, pity: {typ: zähler}, pityCfg: {typ: garantie} }.
// Gezogene Schiffe landen in ctx.owned und fallen damit aus späteren Drops heraus.
function openContainer(type, ctx) {
  const def = CONTAINER_DEFS[type];
  const out = { ships: [], res: {}, give: [], comp: false, forced: false };
  const addRes = (res) => { for (const [k, v] of Object.entries(res)) out.res[k] = (out.res[k] || 0) + v; };
  for (const slot of def.slots) {
    const shipEntries = slot.filter((e) => e.ship);
    if (!shipEntries.length) {
      const e = pickWeighted(slot, 1);
      if (e.res) addRes(e.res);
      if (e.give) out.give.push(e.give);
      continue;
    }

    // Golden: gehören alle neuen Schiffe dir, wandert deren Chance auf die Gold-Gruppe.
    let entries = slot;
    if (def.golden && availIn("GR", ctx.owned).length === 0) {
      const shipP = shipEntries.reduce((a, e) => a + e.p, 0);
      entries = slot.filter((e) => !e.ship).concat([{ p: shipP, ship: "GG" }]);
    }
    const pity = ctx.pity[type] || 0;
    const N = ctx.pityCfg[type];
    // Optional: Golden-Gift-Garantie greift nicht mehr, wenn statt eines Schiffs nur noch Battle Forged käme
    const bfOnly = def.golden && ctx.bfPity === false && !availIn("GR", ctx.owned).length && !availIn("GG", ctx.owned).length;
    const forced = N > 0 && pity + 1 >= N && !bfOnly;
    const pool = forced ? entries.filter((e) => e.ship) : entries;
    const e = pickWeighted(pool, pool.reduce((a, x) => a + x.p, 0));
    if (!e.ship) {
      ctx.pity[type] = pity + 1;
      if (e.res) addRes(e.res);
      if (e.give) out.give.push(e.give);
      continue;
    }

    ctx.pity[type] = 0;
    out.forced = forced;
    let cand = availIn(e.ship, ctx.owned);
    if (def.golden && !cand.length) {
      cand = availIn("GR", ctx.owned);
      if (!cand.length) cand = availIn("GG", ctx.owned);
      if (!cand.length) { out.give.push("bf"); continue; }
    }
    // Leere Gruppe: der Schiffs-Drop geht an eine andere Gruppe dieses Containers (gewichtet nach deren Chance).
    // Stahl gibt es erst, wenn alle Schiffe des Containers im Hafen sind.
    if (!cand.length) {
      const others = shipEntries.filter((x) => x.ship !== e.ship && availIn(x.ship, ctx.owned).length);
      if (!others.length) { out.comp = true; addRes(def.comp); continue; }
      cand = availIn(pickWeighted(others, others.reduce((a, x) => a + x.p, 0)).ship, ctx.owned);
    }
    const s = cand[Math.floor(Math.random() * cand.length)];
    ctx.owned.add(s.key);
    out.ships.push(s);
  }
  return out;
}

// Monte-Carlo über den ganzen Plan. Gibt nur einfache Objekte zurück (Worker-tauglich).
// cnt = { ultra, mega, santa, golden }
function runPlan({ ownedKeys, cnt, runs, pityCfg }) {
  const base = new Set(ownedKeys);
  const shipHits = {}, groupHits = {}, groupAny = {}, hist = {}, resSum = {};
  let total = 0, goldenOpened = 0, bfOpened = 0, comps = 0;
  for (let r = 0; r < runs; r++) {
    const ctx = { owned: new Set(base), pity: {}, pityCfg };
    const runGroups = new Set();
    let ships = 0, golden = cnt.golden, bf = 0;
    const take = (o) => {
      for (const s of o.ships) {
        ships++;
        shipHits[s.key] = (shipHits[s.key] || 0) + 1;
        groupHits[s.group] = (groupHits[s.group] || 0) + 1;
        runGroups.add(s.group);
      }
      for (const [k, v] of Object.entries(o.res)) resSum[k] = (resSum[k] || 0) + v;
      for (const g of o.give) { if (g === "golden") golden++; else if (g === "bf") bf++; }
      if (o.comp) comps++;
    };
    for (let i = 0; i < cnt.ultra; i++) take(openContainer("ultra", ctx));
    for (let i = 0; i < cnt.mega; i++) take(openContainer("mega", ctx));
    for (let i = 0; i < cnt.santa; i++) take(openContainer("santa", ctx));
    for (let i = 0; i < golden; i++) take(openContainer("golden", ctx));
    goldenOpened += golden;
    for (let i = 0; i < bf; i++) take(openContainer("bf", ctx));
    bfOpened += bf;
    for (const g of runGroups) groupAny[g] = (groupAny[g] || 0) + 1;
    total += ships;
    hist[ships] = (hist[ships] || 0) + 1;
  }
  const missing = {};
  for (const g of GROUP_ORDER) missing[g] = availIn(g, base).length;
  return { runs, mean: total / runs, hist, shipHits, groupHits, groupAny, missing, resSum, golden: goldenOpened / runs, bf: bfOpened / runs, comps: comps / runs };
}

// Benötigte Container je Ziel: öffnet Container eines Typs, bis jedes Ziel einmal getroffen ist.
// Golden Gift aus dem Container wird sofort mitgeöffnet. Gezogene Schiffe verkleinern den Pool (wie im Spiel).
// targets = [{ id, tier|null }], tiers = { shipKey: stufe } für Schiffe ohne bekannte Stufe in den Listen.
function runNeeds({ ownedKeys, type, pityCfg, runs, targets, tiers, cap }) {
  const tierOf = (s) => s.tier || tiers[s.key] || 0;
  const base = new Set(ownedKeys);
  const reachable = new Set();
  const groups = [...new Set(CONTAINER_DEFS[type].slots.flat().filter((e) => e.ship).map((e) => e.ship))].concat(["GR", "GG"]);
  for (const g of groups) for (const s of availIn(g, base)) reachable.add(s.key);
  const live = targets.filter((t) => [...reachable].some((k) => {
    if (t.tier == null) return true;
    const s = GROUP_ORDER.flatMap((g) => GROUP_SHIPS[g]).find((x) => x.key === k);
    return s && tierOf(s) === t.tier;
  }));
  const samples = Object.fromEntries(live.map((t) => [t.id, []]));
  for (let r = 0; r < runs; r++) {
    const ctx = { owned: new Set(base), pity: {}, pityCfg };
    const open = new Set(live.map((t) => t.id));
    let n = 0;
    const hit = (ships) => {
      for (const s of ships) for (const t of live) {
        if (open.has(t.id) && (t.tier == null || tierOf(s) === t.tier)) { open.delete(t.id); samples[t.id].push(n); }
      }
    };
    while (open.size && n < cap) {
      n++;
      const o = openContainer(type, ctx);
      hit(o.ships);
      for (const g of o.give) if (g === "golden") hit(openContainer("golden", ctx).ships);
    }
    for (const id of open) samples[id].push(Infinity);
  }
  const out = {};
  for (const t of live) {
    const a = samples[t.id].sort((x, y) => x - y);
    const q = (f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
    out[t.id] = { p50: q(0.5), p90: q(0.9) };
  }
  return out;
}

// Kaufplan: Container eines Typs paketweise öffnen, bis New Jersey BF da ist und dem Container kein Schiff mehr fehlt.
// Golden Gift und Battle Forged aus Drops werden sofort geöffnet.
// Gibt je Meilenstein Ø, Median und 90 % in Containern zurück, dazu Ø neue Schiffe je Paket.
function runMilestones({ ownedKeys, type, pityCfg, runs, pack, cap, bfPity, maxPacks }) {
  const base = new Set(ownedKeys);
  const poolKeys = [...new Set(CONTAINER_DEFS[type].slots.flat().filter((e) => e.ship).map((e) => e.ship))].flatMap((g) => GROUP_SHIPS[g].map((s) => s.key));
  const has = (owned, keys) => keys.every((k) => owned.has(k));
  const GR = GROUP_SHIPS.GR.map((s) => s.key), ALL7 = GR.concat(GROUP_SHIPS.GG.map((s) => s.key)), NJ = GROUP_SHIPS.NJ.map((s) => s.key);
  const goals = { pool: (o) => has(o, poolKeys), reg3: (o) => has(o, GR), all7: (o) => has(o, ALL7), nj: (o) => has(o, NJ) };
  const times = Object.fromEntries(Object.keys(goals).map((k) => [k, []]));
  const yields = new Array(maxPacks + 1).fill(0);
  for (let r = 0; r < runs; r++) {
    const ctx = { owned: new Set(base), pity: {}, pityCfg, bfPity };
    const t = {};
    for (const [k, f] of Object.entries(goals)) if (f(ctx.owned)) t[k] = 0;
    let n = 0;
    while ((t.nj === undefined || t.pool === undefined) && n < cap) {
      n++;
      let got = 0;
      const queue = [type];
      while (queue.length) {
        const o = openContainer(queue.shift(), ctx);
        got += o.ships.length;
        for (const g of o.give) queue.push(g);
      }
      const p = Math.ceil(n / pack);
      if (p <= maxPacks) yields[p] += got;
      for (const [k, f] of Object.entries(goals)) if (t[k] === undefined && f(ctx.owned)) t[k] = n;
    }
    for (const k of Object.keys(goals)) times[k].push(t[k] === undefined ? Infinity : t[k]);
  }
  const out = { yields: yields.map((v) => v / runs) };
  for (const [k, a] of Object.entries(times)) {
    a.sort((x, y) => x - y);
    const fin = a.filter(Number.isFinite);
    out[k] = { done: a[a.length - 1] === 0, mean: fin.length === a.length ? fin.reduce((s, v) => s + v, 0) / a.length : Infinity,
      p50: a[Math.floor(a.length / 2)], p90: a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] };
  }
  return out;
}

// Chance auf einen Treffer im Golden Gift (Schiff oder Battle Forged) innerhalb des nächsten Pakets,
// je nach Golden-Gift-Zählerstand 0 … Garantie-1. Zähler des Hauptcontainers startet bei 0.
function runPityTable({ ownedKeys, type, pityCfg, runs, pack, bfPity }) {
  const base = new Set(ownedKeys);
  const N = pityCfg.golden, out = [];
  for (let c = 0; c < N; c++) {
    let hits = 0;
    for (let r = 0; r < runs; r++) {
      const ctx = { owned: new Set(base), pity: { golden: c }, pityCfg, bfPity };
      let hit = false;
      for (let i = 0; i < pack && !hit; i++) {
        const o = openContainer(type, ctx);
        for (const g of o.give) if (g === "golden") {
          const og = openContainer("golden", ctx);
          if (og.ships.length || og.give.includes("bf")) hit = true;
        }
      }
      if (hit) hits++;
    }
    out.push(hits / runs);
  }
  return out;
}
