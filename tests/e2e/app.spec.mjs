import { test, expect } from "@playwright/test";
import { guard, openManual } from "./helpers.mjs";

test("Stufen-Tabelle und Kurve werden ohne Fehler aufgebaut", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page);
  // Kennzahl „irgendein Schiff“ oben, die sechs Stufen in der Tabelle
  await expect(page.locator("#needsBody tr")).toHaveCount(6);
  await expect(page.locator("#heroP50")).toHaveText(/\d/);
  await expect(page.locator("#heroP90")).toHaveText(/\d/);
  await expect(page.locator('[data-box-pity="santa"]')).toHaveText(/100/);
  await expect(page.locator("#curvePlot svg path.line, #curvePlot svg path").first()).toBeVisible();
  // Klick auf eine Stufe hebt die Kurve hervor
  const row = page.locator("#needsBody tr[data-tier]").nth(1);
  await row.click();
  await expect(row).toHaveClass(/sel/);
  expect(errors).toEqual([]);
});

test("Reiter wechseln die Ansicht und landen in der Adresse", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page);
  for (const v of ["kaufplan", "plan", "schiffe", "stufen"]) {
    await page.locator(`nav.tabs a[data-view="${v}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${v}$`));
    await expect(page.locator(`#v-${v}`)).toBeVisible();
    await expect(page.locator(".view:not([hidden])")).toHaveCount(1);
  }
  // Kaufplan rechnet im Worker
  await page.goto("/#kaufplan");
  await expect(page.locator("#buyBody tr").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Einzeln öffnen schreibt ins Protokoll", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page);
  await page.goto("/#kaufplan");
  await page.evaluate(() => document.querySelectorAll("details.more").forEach((d) => (d.open = true)));
  await page.locator("#rollBtn").click();
  await page.locator("#rollBtn").click();
  await expect(page.locator("#rollLog > div")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("Sprache umschalten bleibt nach dem Neuladen erhalten", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page, { lang: "de" });
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#needsTitle")).toHaveText("Wie viele Container brauchst du?");
  await page.locator("#langBtn").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#langBtn")).toHaveText("EN");
  await expect(page.locator("#needsTitle")).not.toHaveText("Wie viele Container brauchst du?");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors).toEqual([]);
});

test("Farbschema: Standard Dunkel, dann Hell und Automatisch, Wahl bleibt gespeichert", async ({ page }) => {
  await guard(page);
  await openManual(page);
  const html = page.locator("html");
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(await html.getAttribute("data-theme"));
    await page.locator("#themeBtn").click();
  }
  expect(new Set(seen)).toEqual(new Set([null, "light", "dark"]));
  await page.locator("#themeBtn").click(); // eins weiter, dann neu laden
  const before = await html.getAttribute("data-theme");
  await page.reload();
  expect(await html.getAttribute("data-theme")).toBe(before);
});

test("Kein horizontales Scrollen bei 320 px", async ({ page }) => {
  await guard(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await openManual(page);
  for (const v of ["stufen", "kaufplan", "plan", "schiffe", "tracker"]) {
    await page.goto(`/#${v}`);
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `Reiter ${v}`).toBeLessThanOrEqual(0);
  }
});

test("Alle Scripts und Styles tragen dieselbe Versionsnummer, auch im Worker", async ({ page }) => {
  await guard(page);
  const urls = [];
  page.on("request", (r) => { if (/\/assets\/(js|css)\//.test(r.url())) urls.push(new URL(r.url())); });
  await openManual(page);
  await expect.poll(() => urls.filter((u) => u.pathname.endsWith("/sim.js")).length).toBeGreaterThan(1); // Seite + Worker
  const versions = new Set(urls.map((u) => u.searchParams.get("v")));
  expect([...versions]).toHaveLength(1);
  expect([...versions][0]).toMatch(/^\d{8}(-\d+)?$/);
});

test("Tabelle wird im Hintergrund auf 5000 Läufe verfeinert, veraltete Rechnungen werden abgebrochen", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page, { lang: "de" });
  await expect(page.locator("#needsNote")).toContainText("1.000 Durchläufen");
  await expect(page.locator("#needsNote")).toContainText("Genauere Rechnung");
  // Schneller Wechsel während der Verfeinerung: der neue Typ muss trotzdem zügig sein schnelles Ergebnis zeigen
  await page.locator('[data-ctype="ultra"]').click();
  await expect(page.locator("#needsNote")).toContainText("Durchläufen", { timeout: 5_000 });
  await expect(page.locator("#heroP50")).toHaveText(/\d/, { timeout: 5_000 });
  await expect(page.locator("#needsNote")).toContainText("5.000 Durchläufen", { timeout: 30_000 });
  await expect(page.locator("#needsNote")).not.toContainText("Genauere Rechnung");
  // Zurück zum vorigen Typ: das schnelle Ergebnis kommt aus dem Cache, danach wird verfeinert
  await page.locator('[data-ctype="santa"]').click();
  await expect(page.locator("#needsNote")).toContainText("5.000 Durchläufen", { timeout: 45_000 });
  expect(errors).toEqual([]);
});

test("Beute-Übersicht summiert geöffnete Container und Ressourcen, Zurücksetzen leert sie", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page, { lang: "de" });
  await page.goto("/#kaufplan");
  await page.evaluate(() => document.querySelectorAll("details.more").forEach((d) => (d.open = true)));
  await expect(page.locator("#rollLoot")).toBeHidden();
  await page.selectOption("#rollSel", "ultra");
  for (let i = 0; i < 5; i++) await page.locator("#rollBtn").click();
  await expect(page.locator("#rollLoot")).toBeVisible();
  await expect(page.locator("#lootReadout .v").nth(1)).toHaveText("5");
  // Jeder Ultra hat drei Plätze, also mindestens Booster und EP/Kohle/Dublonen in der Tabelle
  expect(await page.locator("#lootBody tr").count()).toBeGreaterThanOrEqual(2);
  // Platz 2 jedes Ultra: 6 epische Booster, also 5 Drops = 30 Stück
  const booster = page.locator("#lootBody tr", { hasText: "Booster" }).first().locator("td");
  await expect(booster.last()).toHaveText("5×");
  await expect(booster.first()).toHaveText("30");
  await page.locator("#rollReset").click();
  await expect(page.locator("#rollLoot")).toBeHidden();
  expect(errors).toEqual([]);
});

test("20 auf einmal öffnen und Money wasted je Container-Typ", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page, { lang: "de" });
  await page.goto("/#kaufplan");
  await page.evaluate(() => document.querySelectorAll("details.more").forEach((d) => (d.open = true)));
  await page.selectOption("#rollSel", "ultra");
  await expect(page.locator("#rollPrice")).toHaveValue("6.15");
  await page.locator("#rollBtn20").click();
  await expect(page.locator("#lootReadout .v").nth(1)).toHaveText("20");
  await expect(page.locator("#lootReadout .v").first()).toHaveText(/123,00\s*€/);
  // Santa's aus Event-Marken kosten nichts: Zähler bleibt gleich
  await page.selectOption("#rollSel", "santa");
  await expect(page.locator("#rollPrice")).toHaveValue("0");
  await page.locator("#rollBtn").click();
  await expect(page.locator("#lootReadout .v").first()).toHaveText(/123,00\s*€/);
  // Eigener Preis wird je Typ gemerkt
  await page.fill("#rollPrice", "0.5");
  await page.press("#rollPrice", "Tab");
  await page.locator("#rollBtn").click();
  await expect(page.locator("#lootReadout .v").first()).toHaveText(/123,50\s*€/);
  await page.reload();
  await page.evaluate(() => document.querySelectorAll("details.more").forEach((d) => (d.open = true)));
  await page.selectOption("#rollSel", "santa");
  await expect(page.locator("#rollPrice")).toHaveValue("0.5");
  expect(errors).toEqual([]);
});

