# WoWs Santa-Rechner

Statische Seite für das Santa-Event in Update 15.11, live unter https://whaling.starbane.de. Du meldest dich bei Wargaming an, danach lädt die Seite deinen Hafen. Damit rechnet sie die Schneeflocken-Belohnungen aus und simuliert Santa's Gift, Mega, Ultra, Golden Gift und Battle Forged Container.

Kein Build-Schritt, kein Backend. Lokal testen:

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Markup, Sicherheitsregel (CSP), Meta-Tags |
| `assets/js/boot.js` | Wargaming Application ID, Farbschema vor dem ersten Zeichnen |
| `assets/js/app.js` | Seitenlogik: Login, Hafen, Plan, Schiffsliste, Gefechte |
| `assets/js/sim.js` | Container-Simulation (von Seite und Worker genutzt) |
| `assets/js/sim-worker.js` | Rechnet die Simulation im Hintergrund |
| `assets/js/santa2026.js` | Drop-Tabellen und Schiffslisten des Events |
| `assets/js/ships.js` | Schiffsdaten (ID, Name, Stufe, Typ, Testschiff) |
| `assets/css/` | Styles und lokale Schriften |
| `assets/img/`, `manifest.webmanifest` | Icons, Vorschaubild, App-Manifest |

## Application ID

1. Auf https://developers.wargaming.net/applications/ mit dem Wargaming-Konto anmelden.
2. Eine Application vom Typ **Mobile** oder **Standalone** anlegen. **Server** ist an IP-Adressen gebunden und funktioniert hier nicht, weil die Anfragen aus dem Browser kommen.
3. Die ID in `assets/js/boot.js` bei `WG_APPLICATION_ID` eintragen.

Die ID ist öffentlich, sie steht in jeder Anfrage an Wargaming.

## Hosting

GitHub Pages aus `main`, Ordner `/ (root)`. Die Domain steht in `CNAME`, bei Strato ist `whaling.starbane.de` per CNAME auf `diedreibeiden.github.io` gesetzt. Als Rücksprung-Adresse nach dem Login nutzt die Seite automatisch ihre eigene Adresse.

## Ablauf für Nutzer

1. Server wählen (EU, NA oder ASIA). Die Seite leitet zur Anmeldung bei Wargaming weiter.
2. Nach dem Login kommt man zurück. Der Zugriffsschlüssel wird sofort aus der Adresszeile entfernt und nur im Browser gespeichert.
3. Die Seite ruft `account/info` mit `private.port` ab. Schiffe, die in den eingebauten Daten fehlen oder dort noch als Testschiff stehen, schlägt sie in `encyclopedia/ships` nach.
4. „Abmelden“ löscht Schlüssel und Hafendaten im Browser und entwertet den Schlüssel bei Wargaming.

Ohne Login lässt sich der Hafen auch von Hand eingeben.

## Daten aktualisieren

- Drop-Raten: `assets/js/santa2026.js`. Quelle ist der Devblog „Closed Test 15.11“ vom 29.10.2026. Die Werte sind vorläufig, vor dem Release mit der finalen Wargaming-Seite abgleichen.
- Garantie-Werte für Santa's, Mega, Ultra und Golden sind vom Event 2025 übernommen. Auf der Seite lassen sie sich ändern.

## Sicherheit und Datenschutz

- Die Content-Security-Policy in `index.html` erlaubt nur Scripts von dieser Seite und Verbindungen zur Wargaming-API. Inline-Scripts gibt es keine, deshalb ist bei Änderungen nichts nachzurechnen.
- `no-referrer` verhindert, dass die Adresse an andere Server geht.
- Schriften liegen lokal in `fonts/` (SIL Open Font License). Die Seite stellt keine Anfragen an Google.

## Lizenz

Rechenlogik und Schiffsdaten stammen aus https://github.com/Rukenshia/shipwhaling (GPL-3.0), deshalb steht auch diese Seite unter GPL-3.0.
