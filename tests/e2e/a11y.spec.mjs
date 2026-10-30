import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { openManual } from "./helpers.mjs";

const axeSource = createRequire(import.meta.url)("axe-core").source;
// Die CSP der Seite verbietet fremde Scripts; nur für den Scan wird sie umgangen
test.use({ bypassCSP: true });

// target-size meldet bei Scroll-Positionen unter dem klebenden Reiterbalken Fehlalarme
// („partially obscured“); die Zielgrößen selbst sind per CSS auf mindestens 24 px gesetzt.
const DISABLED = ["target-size"];

for (const theme of ["light", "dark"]) {
  test(`axe: alle Reiter ohne WCAG-2.2-AA-Verstöße (${theme})`, async ({ page }) => {
    await openManual(page, { theme });
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await page.goto("/#kaufplan");
    await page.locator("#buyBody tr").first().waitFor();
    for (const v of ["stufen", "kaufplan", "plan", "schiffe", "tracker"]) {
      await page.goto(`/#${v}`);
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
      await page.waitForTimeout(200);
      await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate((disabled) => window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        rules: Object.fromEntries(disabled.map((r) => [r, { enabled: false }]))
      }), DISABLED);
      const found = res.violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
      expect(found, `Reiter ${v}`).toEqual([]);
    }
  });
}

test("Login-Seite ohne Verstöße", async ({ page }) => {
  await page.goto("/");
  await page.locator("#gate").waitFor();
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } }));
  expect(res.violations.map((x) => x.id)).toEqual([]);
});

// Elemente, die erst nach dem Öffnen erscheinen (Beute, Golden-Gift-Knopf), in beiden Modi prüfen
for (const theme of ["light", "dark"]) {
  test(`axe: Einzeln öffnen mit Beute und Golden-Gift-Knopf (${theme})`, async ({ page }) => {
    await openManual(page, { theme });
    await page.goto("/#kaufplan");
    await page.evaluate(() => document.querySelectorAll("details.more").forEach((d) => (d.open = true)));
    await page.selectOption("#rollSel", "ultra");
    for (let i = 0; i < 40 && !(await page.isVisible("#openGolden")); i++) await page.locator("#rollBtn").click();
    await expect(page.locator("#openGolden")).toBeVisible();
    await expect(page.locator("#rollLoot")).toBeVisible();
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate((disabled) => window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      rules: Object.fromEntries(disabled.map((r) => [r, { enabled: false }]))
    }), DISABLED);
    expect(res.violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  });
}

