import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts } from "./load.mjs";

const g = loadScripts(["santa2026.js", "sim.js"]);
const DEFS = g("CONTAINER_DEFS"), GS = g("GROUP_SHIPS"), PITY = g("PITY_DEFAULT");
const key = g("shipKey"), openContainer = g("openContainer"), runMilestones = g("runMilestones"), runNeeds = g("runNeeds");
const keysOf = (groups) => groups.flatMap((x) => GS[x].map((s) => s.key));

test("Drop-Chancen jedes Platzes ergeben 100 %", () => {
  for (const [type, def] of Object.entries(DEFS)) def.slots.forEach((slot, i) => {
    const sum = slot.reduce((a, e) => a + e.p, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${type} Platz ${i + 1}: ${sum}`);
  });
});

test("Schiffslisten: 42 / 53 / 48 Schiffe, keine Doppelten", () => {
  assert.deepEqual([GS.A.length, GS.B.length, GS.C.length], [42, 53, 48]);
  const all = keysOf(["A", "B", "C", "GR", "GG", "NJ"]);
  assert.equal(new Set(all).size, all.length);
});

test("Leere Gruppe: Schiff kommt aus einer anderen Gruppe, Stahl erst ohne fehlende Schiffe", () => {
  const ownedC = new Set(keysOf(["C"]));
  for (let i = 0; i < 300; i++) {
    const ctx = { owned: new Set(ownedC), pity: {}, pityCfg: { ...PITY, ultra: 1 } };   // Garantie erzwingt Schiff
    const o = openContainer("ultra", ctx);
    assert.equal(o.ships.length, 1);
    assert.notEqual(o.ships[0].group, "C");
    assert.equal(o.comp, false);
  }
  const ctx = { owned: new Set(keysOf(["A", "B", "C"])), pity: {}, pityCfg: { ...PITY, ultra: 1 } };
  const o = openContainer("ultra", ctx);
  assert.equal(o.ships.length, 0);
  assert.equal(o.comp, true);
  assert.equal(o.res["Stahl"], 1250);
});

test("Golden Gift: neue Schiffe, dann Gold-Gruppe, dann Battle Forged", () => {
  const forced = { ...PITY, golden: 1 };
  let o = openContainer("golden", { owned: new Set(), pity: {}, pityCfg: forced });
  assert.equal(o.ships[0].group, "GR");
  o = openContainer("golden", { owned: new Set(keysOf(["GR"])), pity: {}, pityCfg: forced });
  assert.equal(o.ships[0].group, "GG");
  o = openContainer("golden", { owned: new Set(keysOf(["GR", "GG"])), pity: {}, pityCfg: forced });
  assert.deepEqual([...o.give], ["bf"]);
  // Ohne BF-Pity greift die Garantie nicht mehr, sobald nur noch Battle Forged käme
  let bf = 0;
  for (let i = 0; i < 400; i++) if (openContainer("golden", { owned: new Set(keysOf(["GR", "GG"])), pity: {}, pityCfg: forced, bfPity: false }).give.includes("bf")) bf++;
  assert.ok(bf > 10 && bf < 80, `ohne BF-Pity ~10 % erwartet, war ${bf}/400`);
});

test("Battle Forged: New Jersey BF spätestens beim 3. Container", () => {
  for (let r = 0; r < 200; r++) {
    const ctx = { owned: new Set(), pity: {}, pityCfg: PITY };
    let got = 0;
    for (let i = 1; i <= 3 && !got; i++) if (openContainer("bf", ctx).ships.length) got = i;
    assert.ok(got >= 1 && got <= 3);
  }
});

// Referenz: Kaufguide vom 29.10.2026 (santa_sim.py), 7 offene Schiffe in A, 13 in B, C voll
test("Kaufguide-Szenario: Meilensteine in 20er-Ultra-Paketen (±1 Paket)", () => {
  const openA = ["Lüshun", "Puerto Rico", "Tonijn", "Fuyutsuki", "Almirante Irízar", "Błyskawica '52", "Indiana"];
  const openB = ["Marco Polo", "Groningen", "Aberdeen", "Baotou", "Fort Worth", "Cayuga", "Triunfante", "Friedrich Carl", "Turgut Reis", "Regele Carol I", "Shigure", "Hoche", "Prince of Wales"];
  const open = new Set([...openA, ...openB].map(key));
  const owned = keysOf(["A", "B", "C"]).filter((k) => !open.has(k));
  const m = runMilestones({ ownedKeys: owned, type: "ultra", pityCfg: PITY, runs: 1500, pack: 20, cap: 20000, bfPity: true, maxPacks: 15 });
  const packs = (n) => Math.ceil(n / 20);
  const expect = { pool: [3, 4], reg3: [5, 8], all7: [12, 16], nj: [15, 19] };
  for (const [k, [p50, p90]] of Object.entries(expect)) {
    assert.ok(Math.abs(packs(m[k].p50) - p50) <= 1, `${k} Median ${packs(m[k].p50)} statt ${p50}`);
    assert.ok(Math.abs(packs(m[k].p90) - p90) <= 1, `${k} 90 % ${packs(m[k].p90)} statt ${p90}`);
  }
  assert.ok(Math.abs(m.yields[1] - 7.2) < 0.5, `Paket 1: ${m.yields[1]} neue Schiffe`);
});

test("Benötigte Santa's für irgendein Schiff bei leerem Hafen: ~26 / ~86", () => {
  const r = runNeeds({ ownedKeys: [], type: "santa", pityCfg: PITY, runs: 2000, cap: 20000, targets: [{ id: "any", tier: null }], tiers: {} });
  assert.ok(r.any.p50 >= 23 && r.any.p50 <= 30, `Median ${r.any.p50}`);
  assert.ok(r.any.p90 >= 78 && r.any.p90 <= 95, `90 % ${r.any.p90}`);
  assert.equal(r.any.qs.length, 99);
});
