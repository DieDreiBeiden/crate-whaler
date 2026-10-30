import { test, expect } from "@playwright/test";
import { guard, openManual } from "./helpers.mjs";

test("Tracker: Eintrag auswerten, Schiff gilt als im Hafen, Rückgängig und Speichern", async ({ page }) => {
  const errors = await guard(page);
  await openManual(page, { lang: "de" });
  await expect(page.locator("#heroSub")).toContainText("150");
  await page.locator('nav.tabs a[data-view="tracker"]').click();
  await expect(page.locator("#trkEmpty")).toBeVisible();

  await page.selectOption("#trkType", "ultra");
  await page.fill("#trkPacks", "2");
  await page.fill("#trkPer", "20");
  await expect(page.locator("#trkSum")).toContainText("40");
  await page.fill("#trkGolden", "8");
  // Suche mit Enter übernimmt den ersten Treffer
  await page.fill("#trkSearch", "rodina");
  await expect(page.locator("#trkResults .trk-hit")).toHaveCount(2);
  await page.locator("#trkResults .trk-hit").first().click();
  await expect(page.locator("#trkPicked .trk-chip")).toHaveCount(1);
  await page.fill("#trkSearch", "puerto");
  await page.press("#trkSearch", "Enter");
  await expect(page.locator("#trkPicked .trk-chip")).toHaveCount(2);
  await page.locator("#trkAdd").click();

  await expect(page.locator("#trkMsg")).toHaveClass(/ok/);
  await expect(page.locator("#trkLog tr")).toHaveCount(1);
  await expect(page.locator("#trkReadout .v").first()).toHaveText("40");
  await expect(page.locator("#trkReadout .v").nth(3)).toHaveText(/%/, { timeout: 20_000 });
  await expect(page.locator("#trkProb")).toContainText("genau 2 Schiffe");
  await expect(page.locator("#trkHist rect.me")).toHaveCount(1);
  // Eingetragene Schiffe sind jetzt im Hafen und tauchen nicht mehr in der Suche auf
  await page.fill("#trkSearch", "rodina");
  await expect(page.locator("#trkResults .trk-hit")).toHaveCount(1);
  await page.goto("/#stufen");
  await expect(page.locator("#heroSub")).toContainText("148");

  // Bleibt nach dem Neuladen erhalten
  await page.reload();
  await page.goto("/#tracker");
  await expect(page.locator("#trkLog tr")).toHaveCount(1);
  await page.locator("#trkUndo").click();
  await expect(page.locator("#trkEmpty")).toBeVisible();
  await page.goto("/#stufen");
  await expect(page.locator("#heroSub")).toContainText("150");
  expect(errors).toEqual([]);
});

test("Tracker: leere Eingabe und zu viele Golden Gifts werden abgewiesen", async ({ page }) => {
  await guard(page);
  await openManual(page, { lang: "de" });
  await page.goto("/#tracker");
  await page.fill("#trkPacks", "0");
  await page.locator("#trkAdd").click();
  await expect(page.locator("#trkMsg")).toHaveClass(/err/);
  await page.fill("#trkPacks", "1");
  await page.fill("#trkPer", "5");
  await page.fill("#trkGolden", "6");
  await page.locator("#trkAdd").click();
  await expect(page.locator("#trkMsg")).toContainText("Mehr Golden Gifts");
  await expect(page.locator("#trkEmpty")).toBeVisible();
});

test("Tracker: 20 Container je Paket als Vorgabe", async ({ page }) => {
  await guard(page);
  await openManual(page, { lang: "de" });
  await page.goto("/#tracker");
  await expect(page.locator("#trkPer")).toHaveValue("20");
  await expect(page.locator("#trkSum")).toContainText("20 Container");
});
