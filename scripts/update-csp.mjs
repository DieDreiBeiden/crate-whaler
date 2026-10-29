// Berechnet die SHA-256-Prüfsummen aller Inline-Scripts in index.html und trägt sie in die
// Content-Security-Policy ein. Nach jeder Änderung an einem <script>-Block ausführen:
//   node scripts/update-csp.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const file = new URL("../index.html", import.meta.url);
const html = readFileSync(file, "utf8");
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
const re = /(script-src )[^;]*(;)/;
if (!re.test(html)) throw new Error("Keine script-src-Angabe in der CSP gefunden.");
writeFileSync(file, html.replace(re, `$1${hashes.join(" ")}$2`));
console.log(`${hashes.length} Script-Prüfsummen eingetragen.`);
