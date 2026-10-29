# WoWs Santa-Rechner

Statische Seite für das Santa-Event in Update 15.11. Du meldest dich bei Wargaming an, danach lädt die Seite deinen Hafen. Damit rechnet sie die Schneeflocken-Belohnungen aus und simuliert Santa's Gift, Mega, Ultra, Golden Gift und Battle Forged Container.

Alles steckt in einer Datei: `index.html`. Es gibt keinen Build-Schritt und kein Backend.

## 1. Application ID anlegen

1. Auf https://developers.wargaming.net/applications/ mit deinem Wargaming-Konto anmelden.
2. Eine neue Application anlegen, Typ **Mobile** oder **Standalone**. Nicht **Server** wählen: Dieser Typ ist an IP-Adressen gebunden, die Anfragen kommen hier aber aus dem Browser der Nutzer.
3. Die ID in `index.html` eintragen:

   ```js
   const WG_APPLICATION_ID = "deine-id";
   ```

Diese ID ist öffentlich: Sie steht bei jedem Aufruf in der Anfrage an Wargaming. Ein Geheimnis gibt es bei diesem Ablauf nicht.

## 2. Hosten (Beispiel GitHub Pages)

1. Ein Repository anlegen und `index.html` hochladen.
2. Unter Settings → Pages: „Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`.
3. Nach etwa einer Minute ist die Seite unter `https://<name>.github.io/<repo>/` erreichbar.

Live-Adresse: https://whaling.starbane.de (Datei `CNAME`, DNS bei Strato als CNAME auf `diedreibeiden.github.io`).

Cloudflare Pages, Netlify oder ein eigener Webspace funktionieren genauso. Die Seite muss nur unter HTTPS und einer festen Adresse laufen. Als Rücksprung-Adresse nach dem Login nutzt sie automatisch ihre eigene Adresse.

## Ablauf für Nutzer

1. Server wählen (EU, NA oder ASIA). Die Seite leitet zur Anmeldung bei Wargaming weiter.
2. Nach dem Login kommt man zurück auf die Seite. Der Zugriffsschlüssel wird sofort aus der Adresszeile entfernt und nur im Browser (localStorage) gespeichert.
3. Die Seite ruft `account/info` mit `private.port` ab. Schiffe, die in den eingebauten Daten fehlen oder dort noch als Testschiff stehen, schlägt sie in `encyclopedia/ships` nach.
4. „Abmelden“ löscht Schlüssel und Hafendaten im Browser und entwertet den Schlüssel bei Wargaming.

## Daten aktualisieren

- Drop-Raten: im Script-Block `CONTAINER_DEFS` und `SANTA_GROUPS`. Quelle ist der Devblog „Closed Test 15.11“ vom 29.10.2026. Die Werte sind vorläufig, also vor dem Release am 15.11 mit der finalen Wargaming-Seite abgleichen.
- Garantie-Werte (Pity) für Santa's, Mega, Ultra und Golden sind vom Event 2025 übernommen. Auf der Seite lassen sie sich ändern.

## Lizenz

Die Rechenlogik und die Schiffsdaten stammen aus https://github.com/Rukenshia/shipwhaling (GPL-3.0). Wer die Seite veröffentlicht, sollte sie deshalb ebenfalls unter GPL-3.0 stellen und den Quelltext zugänglich lassen. Bei einer statischen HTML-Datei ist der Quelltext automatisch sichtbar.
