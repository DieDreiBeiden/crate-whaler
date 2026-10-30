# Release-Checkliste: finale Drop-Raten 15.11

Für den Tag, an dem Wargaming die endgültigen Container-Inhalte veröffentlicht. Bis dahin rechnet die Seite mit den vorläufigen Werten aus dem Devblog „Closed Test 15.11“ vom 29.10.2026.

Dauer: etwa 30–45 Minuten. Rollback: unter 5 Minuten (siehe unten).

## 1. Vorher

- [ ] Quelle festhalten: Link zur offiziellen Wargaming-Seite (Portal-Artikel oder Container-Info im Spiel), Datum, Region. Der Devblog allein reicht nicht.
- [ ] Ausgangsstand notieren: `git log -1 --format=%h` → Commit-Hash als Rückfallpunkt.
- [ ] CI ist auf `main` grün (GitHub → Actions → „Tests“).

## 2. Daten vergleichen und anpassen

Alles in `assets/js/santa2026.js`, sofern nicht anders angegeben.

| Prüfen | Wo | Hinweis |
|---|---|---|
| Wahrscheinlichkeit je Platz (Ressourcen, Golden Gift, Schiffsgruppen) | `CONTAINER_DEFS.<typ>.slots` | Jeder Platz muss 100 % ergeben, der Unit-Test prüft das |
| Schiffe je Gruppe und Stufe | `SANTA_GROUPS` | Namen exakt wie im Spiel; neue Schiffe brauchen ein Icon (Abschnitt 3) |
| Kompensation, wenn dem Container keine Schiffe mehr fehlen | `CONTAINER_DEFS.<typ>.comp` | Derzeit 1250 Stahl, Battle Forged 2500 |
| Golden-Gift-Kette (neue Schiffe → Gold-Versionen → Battle Forged) | `GR`, `GG`, `NJ` und Golden-Platz | Reihenfolge der Kette steckt in `openContainer` in `sim.js` |
| Battle Forged: Chance auf New Jersey BF, Garantie beim 3. | `CONTAINER_DEFS.bf` | |
| Garantie-Zähler (Santa's 100, Mega 15, Ultra 7, Golden 10, BF 3) | `PITY_DEFAULT` in `sim.js` **und** `pity` in `CONTAINER_DEFS` | Beide Stellen gleich halten |
| Gilt die Golden-Gift-Garantie auch für den BF-Container? | Schalter im Kaufplan, Standard `bfPity: true` in `app.js` (`const buy`) | Wenn geklärt: Standardwert setzen, Texte `buy.bfPity` und `buy.bfPityHelp` in `i18n.js` (DE und EN) anpassen |
| Paketgröße und Preis (derzeit 20 Ultra für 123 €) | `#b-pack`, `#b-price` in `index.html` und `const buy` in `app.js` | Nur falls sich die Shop-Angebote ändern |

- [ ] Kopfkommentar in `santa2026.js` aktualisieren (Quelle, Datum, „final“).
- [ ] README, Abschnitt „Daten aktualisieren“: „vorläufig“ entfernen, Quelle nennen.
- [ ] Ändert sich das Modell (z. B. Garantie-Regeln): Abschnitt „Modellannahmen“ in der README anpassen.

## 3. Neue Schiffe

- [ ] Icon als `assets/img/ships/<shipKey>.webp` ablegen (128 × 75, aus `images.small` der Enzyklopädie).
- [ ] Für noch nicht veröffentlichte Schiffe ohne Bild: Eintrag in `ICON_ALIAS` in `app.js`.
- [ ] Fehlt das Schiff in `ships.js`, löst die Seite die ID beim Hafen-Import über die Enzyklopädie auf. Ein Eintrag in `ships.js` ist trotzdem besser (gilt auch im Modus „von Hand“).

## 4. Tests

```bash
npm ci
```

```bash
npm test
```

- [ ] `tests/unit/sim.test.mjs` enthält Referenzwerte, die von den Drop-Raten abhängen: die Kaufguide-Meilensteine und die benötigten Santa's für irgendein Schiff. Nach neuen Raten schlagen diese Tests absichtlich fehl. Neue Sollwerte nur übernehmen, wenn sie unabhängig plausibel sind (z. B. Gegenrechnung mit `santa_sim.py` oder dem aktualisierten Kaufguide). Nicht einfach die Ausgabe der Seite eintragen.
- [ ] Ziel: alle Unit- und E2E-Tests grün.

## 5. Cache-Version erhöhen

GitHub Pages liefert Dateien mit `max-age=600` aus. Ohne neue Version können Browser bis zu 10 Minuten alte Drop-Raten mit der neuen Seite mischen.

- [ ] In `index.html` bei allen `?v=` das Datum auf den Release-Tag setzen (z. B. `?v=20261112`, bei mehreren Releases am selben Tag `?v=20261112-2`). Der Worker übernimmt die Version automatisch.

## 6. Ausrollen

```bash
git add -A && git commit -m "Finale Drop-Raten 15.11"
```

```bash
git push origin main
```

- [ ] GitHub → Actions: „Tests“ grün und „pages build and deployment“ fertig (meist 1–2 Minuten).

## 7. Live prüfen (https://whaling.starbane.de)

- [ ] Hart neu laden (Strg+Umschalt+R). Im Netzwerk-Tab tragen die Scripts die neue `?v=`.
- [ ] Reiter „Pro Stufe“: Werte plausibel gegenüber dem Vortag (Richtung der Änderung passt zu den neuen Raten).
- [ ] Reiter „Schiffe“ → Drop-Tabellen: Prozente stimmen mit der offiziellen Quelle überein. Stichprobe je Container-Typ.
- [ ] Login mit einem echten Account (EU), Hafen lädt.
- [ ] DE/EN und Hell/Dunkel einmal umschalten. Browser-Konsole ohne Fehler.
- [ ] Einmal am Handy öffnen.

## Rollback

Wenn live etwas nicht stimmt und die Ursache nicht in wenigen Minuten klar ist:

```bash
git revert --no-edit HEAD
```

```bash
git push origin main
```

- `git revert` legt einen neuen Commit an, der die Änderung rückgängig macht. Die Historie bleibt erhalten, nichts geht verloren. Der fehlerhafte Stand kann später erneut angewendet werden.
- Nach 1–2 Minuten ist der alte Stand live. Browser, die die neue `index.html` schon geladen haben, sehen ihn spätestens nach 10 Minuten (Cache-Dauer). Die alte `?v=` kommt mit dem Revert zurück, alte und neue Dateien mischen sich also nicht.
- Kein `git push --force` auf `main`.

## Bekannte Risiken

- **Raten weichen stark ab oder neue Mechanik** (z. B. andere Garantie-Logik): Dann reicht eine Datenänderung nicht, `openContainer` in `sim.js` muss angepasst werden. Lieber einen Tag später live gehen als mit falschem Modell.
- **WG-Anfragelimit**: Bei vielen gleichzeitigen Logins am Event-Start kann die API `REQUEST_LIMIT_EXCEEDED` liefern. Die Seite zeigt dann „Zu viele Anfragen. Warte kurz und lade dann neu.“ Kein Handlungsbedarf, nur beobachten.
- **Schiffsnamen**: Weicht ein Name im Spiel von `santa2026.js` ab (Sonderzeichen, Apostroph), erkennt der Import das Schiff im Hafen nicht. Prüfen: mit einem Account einloggen, der das Schiff besitzt, oder Namen mit `encyclopedia/ships` abgleichen.
