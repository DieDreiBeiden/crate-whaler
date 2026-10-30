// Lädt die klassischen Browser-Scripts der Seite in einen Node-Kontext (ohne DOM).
import fs from "node:fs";
import vm from "node:vm";

export const root = new URL("../../", import.meta.url).pathname;
export function loadScripts(files, extra = {}) {
  const ctx = vm.createContext({ console, ...extra });
  for (const f of files) vm.runInContext(fs.readFileSync(root + "assets/js/" + f, "utf8"), ctx, { filename: f });
  // Top-Level-const sind im Kontext nur per Ausdruck erreichbar
  return (expr) => vm.runInContext(expr, ctx);
}
