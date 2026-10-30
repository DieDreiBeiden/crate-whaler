import { test, expect } from "@playwright/test";
import { guard, ORIGIN } from "./helpers.mjs";

// Nachgebaute Wargaming-API: Login leitet sofort zurück, account/info liefert einen kleinen Hafen
const WG = [/^https:\/\/api\.worldoftanks\.eu\/wot\/auth\//, /^https:\/\/api\.worldofwarships\.eu\/wows\//];
const UNKNOWN_ID = 4000000001;

async function mockWg(page, calls) {
  const ids = await page.evaluate(() => {
    const keys = new Set(GROUP_SHIPS.A.slice(0, 3).map((s) => s.key));
    return SHIPS_RAW.filter(([, name, , , demo]) => !demo && keys.has(shipKey(name))).map(([id]) => id);
  });
  await page.route(WG[0], async (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname);
    if (u.pathname.endsWith("/logout/")) return r.fulfill({ json: { status: "ok" } });
    const back = new URL(u.searchParams.get("redirect_uri"));
    for (const [k, v] of Object.entries({ status: "ok", access_token: "tok123", account_id: "500", nickname: "Kapitän", expires_at: String(Math.floor(Date.now() / 1000) + 3600) })) back.searchParams.set(k, v);
    return r.fulfill({ status: 302, headers: { location: back.href } });
  });
  await page.route(WG[1], (r) => {
    const u = new URL(r.request().url());
    calls.push(u.pathname + "?" + u.searchParams.toString());
    if (u.pathname.includes("account/info")) return r.fulfill({ json: { status: "ok", data: { 500: { private: { port: [...ids, UNKNOWN_ID] } } } } });
    if (u.pathname.includes("encyclopedia/ships")) return r.fulfill({ json: { status: "ok", data: { [UNKNOWN_ID]: { name: "Neues Testschiff", tier: 9, type: "Cruiser", has_demo_profile: false } } } });
    return r.fulfill({ json: { status: "error", error: { message: "UNKNOWN" } } });
  });
  return ids;
}

test("Login mit Einmal-Code lädt den Hafen und entfernt den Schlüssel aus der Adresse", async ({ page }) => {
  const errors = await guard(page, { allow: WG });
  const calls = [];
  await page.goto("/");
  await expect(page.locator("#gate")).toBeVisible();
  const ids = await mockWg(page, calls);
  expect(ids.length).toBeGreaterThan(0);

  await page.locator('[data-realm="eu"]').click();
  await expect(page.locator("#importMsg")).toHaveClass(/ok/);
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#ubName")).toHaveText("Kapitän");

  const info = calls.find((c) => c.includes("account/info"));
  expect(info).toContain("access_token=tok123");
  expect(info).toContain("application_id=");
  // Unbekannte Schiffs-ID wird in der Enzyklopädie nachgeschlagen
  expect(calls.some((c) => c.includes("encyclopedia/ships") && c.includes(String(UNKNOWN_ID)))).toBe(true);
  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("santa26:imported")));
  expect(imported.ids).toContain(UNKNOWN_ID);

  // Abmelden widerruft den Schlüssel bei WG und zeigt wieder die Login-Seite
  await page.locator("#ubLogout").click();
  await expect(page.locator("#gate")).toBeVisible();
  await expect.poll(() => calls.some((c) => c.endsWith("/logout/"))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("santa26:session")))).toBeNull();
  expect(errors).toEqual([]);
});

test("Untergeschobener Login-Link ohne passenden Einmal-Code wird abgewiesen", async ({ page }) => {
  const errors = await guard(page);
  await page.goto(`/?realm=eu&n=gefaelscht&status=ok&access_token=fremd&account_id=666&nickname=Angreifer&expires_at=${Math.floor(Date.now() / 1000) + 3600}`);
  await expect(page.locator("#gateMsg")).toHaveClass(/err/);
  await expect(page).toHaveURL(`${ORIGIN}/`);
  expect(await page.evaluate(() => localStorage.getItem("santa26:session"))).toBeNull();
  await expect(page.locator("#gate")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Abgebrochener Login zeigt eine Meldung statt einer Sitzung", async ({ page }) => {
  await guard(page);
  await page.goto("/");
  await page.evaluate(() => sessionStorage.setItem("santa26:nonce", "abc"));
  await page.goto("/?realm=eu&n=abc&status=error&message=AUTH_CANCEL");
  await expect(page.locator("#gateMsg")).toContainText("AUTH_CANCEL");
  expect(await page.evaluate(() => localStorage.getItem("santa26:session"))).toBeNull();
});
