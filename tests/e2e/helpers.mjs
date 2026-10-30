// Gemeinsame Hilfen: fremde Hosts sperren, Konsolenfehler und CSP-Verstöße sammeln
export const ORIGIN = "http://127.0.0.1:4173";

export async function guard(page, { allow = [] } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  // Nichts darf ungeplant nach außen gehen; erlaubte Muster werden im Test selbst nachgebaut
  await page.context().route((url) => url.origin !== ORIGIN && !allow.some((re) => re.test(url.href)), (r) => {
    errors.push("unerwartete Anfrage: " + r.request().url());
    return r.abort();
  });
  return errors;
}

// Startet ohne Anmeldung im Modus „von Hand“
export async function openManual(page, extra = {}) {
  await page.addInitScript((kv) => {
    if (sessionStorage.getItem("e2e:init")) return;
    sessionStorage.setItem("e2e:init", "1");
    localStorage.setItem("santa26:source", '"manual"');
    for (const [k, v] of Object.entries(kv)) localStorage.setItem("santa26:" + k, JSON.stringify(v));
  }, extra);
  await page.goto("/");
  await page.locator("#app").waitFor();
  await page.locator("#needsBody tr").first().waitFor();
}
