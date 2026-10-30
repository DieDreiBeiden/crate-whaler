// Läuft im <head>, bevor die Seite gezeichnet wird.

// Wargaming Application ID von https://developers.wargaming.net/applications/
const WG_APPLICATION_ID = "445aebe856370e69f1f98f7b7b743e22";

const readPref = (k) => { try { return JSON.parse(localStorage.getItem("santa26:" + k)); } catch { return null; } };

// Sprache: gespeicherte Wahl, sonst Browsersprache (Deutsch bei "de…", sonst Englisch)
const LANG = (() => {
  const saved = readPref("lang");
  if (saved === "de" || saved === "en") return saved;
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  return String(langs[0] || "").toLowerCase().startsWith("de") ? "de" : "en";
})();
document.documentElement.lang = LANG;
// Das HTML ist auf Deutsch geschrieben; auf Englisch bleibt die Seite unsichtbar, bis i18n.js die Texte gesetzt hat
if (LANG !== "de") {
  document.documentElement.classList.add("i18n-pending");
  setTimeout(() => document.documentElement.classList.remove("i18n-pending"), 2000);   // Rückfall, falls ein Script nicht lädt
}

// Gespeichertes Farbschema sofort setzen, damit die Seite nicht kurz im falschen Modus aufblitzt.
// "light" / "dark" = feste Wahl, nichts gespeichert = Systemeinstellung.
(() => {
  const t = readPref("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
})();
