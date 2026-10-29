// Läuft im <head>, bevor die Seite gezeichnet wird.

// Wargaming Application ID von https://developers.wargaming.net/applications/
const WG_APPLICATION_ID = "445aebe856370e69f1f98f7b7b743e22";

// Gespeichertes Farbschema sofort setzen, damit die Seite nicht kurz im falschen Modus aufblitzt.
// "light" / "dark" = feste Wahl, nichts gespeichert = Systemeinstellung.
(() => {
  try {
    const t = JSON.parse(localStorage.getItem("santa26:theme"));
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch { /* Speicher gesperrt: Systemeinstellung */ }
})();
