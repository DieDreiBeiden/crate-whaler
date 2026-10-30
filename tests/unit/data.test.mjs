import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadScripts, root } from "./load.mjs";

test("Deutsch und Englisch haben dieselben Text-Schlüssel", () => {
  const g = loadScripts(["i18n.js"], { LANG: "de", document: {} });
  const I = g("I18N");
  const de = Object.keys(I.de).sort(), en = Object.keys(I.en).sort();
  assert.deepEqual(de.filter((k) => !I.en[k]), [], "fehlt im Englischen");
  assert.deepEqual(en.filter((k) => !I.de[k]), [], "fehlt im Deutschen");
  // Platzhalter stimmen überein
  for (const k of de) {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(I.de[k]), vars(I.en[k]), `Platzhalter in ${k}`);
  }
});

test("Jeder Schlüssel im HTML existiert in den Übersetzungen", () => {
  const g = loadScripts(["i18n.js"], { LANG: "de", document: {} });
  const I = g("I18N");
  const html = fs.readFileSync(root + "index.html", "utf8");
  const keys = [...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1])
    .concat([...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(";").map((p) => p.split(":")[1].trim())));
  const missing = [...new Set(keys)].filter((k) => !(k in I.de));
  assert.deepEqual(missing, []);
});

test("Jedes Container-Schiff hat ein Icon", () => {
  const g = loadScripts(["santa2026.js", "sim.js"]);
  const GS = g("GROUP_SHIPS"), ORDER = g("GROUP_ORDER");
  const app = fs.readFileSync(root + "assets/js/app.js", "utf8");
  const alias = Object.fromEntries([...app.match(/ICON_ALIAS = \{([^}]+)\}/)[1].matchAll(/(\w+): "(\w+)"/g)].map((m) => [m[1], m[2]]));
  const missing = [...ORDER].flatMap((grp) => GS[grp]).map((s) => alias[s.key] || s.key).filter((k) => !fs.existsSync(`${root}assets/img/ships/${k}.webp`));
  assert.deepEqual(missing, []);
});
