# WoWs Santa-Rechner

Container-Rechner für das Santa-Event in Update 15.11, live unter https://whaling.starbane.de. Nach dem Wargaming-Login kennt die Seite deinen Hafen und zeigt, wie viele Santa's, Mega oder Ultra Gift du für ein neues Schiff jeder Stufe brauchst (50 % und 90 % Chance). Dazu rechnet sie einen eigenen Container-Plan inklusive Golden Gift und Battle Forged Container durch.

Kein Build-Schritt, kein Backend. Lokal testen:

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Markup, Sicherheitsregel (CSP), Meta-Tags |
| `assets/js/boot.js` | Wargaming Application ID, Sprache und Farbschema vor dem ersten Zeichnen |
| `assets/js/i18n.js` | Alle Texte auf Deutsch und Englisch (`t()`), Übersetzung der Ressourcen |
| `assets/js/app.js` | Seitenlogik: Login, Tabelle „Wie viele Container“, Kaufplan in Paketen, Plan, Schiffsliste |
| `assets/js/sim.js` | Container-Simulation: Plan (`runPlan`), Container je Stufe (`runNeeds`), Meilensteine je Paket (`runMilestones`), Golden-Gift-Zähler (`runPityTable`) |
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

## Modellannahmen

Abgeglichen mit `santa_sim.py` und dem Kaufguide vom 29.10.2026: Meilensteine und Ertrag je Paket stimmen auf ±3 % überein.

- Garantie zählt Container ohne Schiff und setzt sich bei jedem Schiffsdrop zurück.
- Ein leerer Pool gibt seinen Anteil gewichtet an die übrigen Pools ab, erst ohne fehlende Schiffe gibt es Stahl.
- Golden Gift: erst die 3 regulären Schiffe, dann die 4 Gold-Schiffe, danach ersetzt der Battle Forged Container den Schiffsplatz. Ob die Golden-Gift-Garantie auch für den Battle Forged Container gilt, ist offen und auf der Seite umschaltbar.
- Unterschied zu `santa_sim.py`: Die Seite lässt die Container-Garantie weiterlaufen, wenn dem Container keine Schiffe mehr fehlen (dann Stahl statt Golden-Gift-Chance). Das macht die Golden-Gift-Ziele rund 3 % teurer.

## Sprachen

Deutsch und Englisch. Ohne gespeicherte Wahl richtet sich die Sprache nach dem Browser (`de…` → Deutsch, sonst Englisch), der Knopf DE/EN oben speichert die Wahl. Neue Texte kommen in `assets/js/i18n.js` in beide Wörterbücher; im HTML werden sie mit `data-i18n`, `data-i18n-html` oder `data-i18n-attr` eingebunden.

## Schiffs-Icons

`assets/img/ships/<schlüssel>.webp`, 128 × 75 px, aus `images.small` der Wargaming-Enzyklopädie (`encyclopedia/ships`), Stand 30.10.2026. Der Schlüssel ist `shipKey(name)` aus `sim.js`, z. B. `tōgasa` → `togasa`. Die Icons liegen lokal, damit die Seite ohne Anmeldung keine Anfragen an Dritte stellt.

Noch nicht veröffentlichte Schiffe (Rodina G, Somers G, Tōgasa G, Tywysog Cymru, New Jersey BF) zeigen vorläufig das Icon ihres Basisschiffs (`ICON_ALIAS` in `app.js`, gestrichelt markiert). Sobald Wargaming sie in der Enzyklopädie führt: Icon laden, als `<schlüssel>.webp` speichern und den Eintrag aus `ICON_ALIAS` entfernen. Bilder und Schiffsnamen sind Eigentum von Wargaming.
