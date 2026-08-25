# Klarblick Vorsorge

Website mit Landingpage und interaktivem Quiz-Tool zur ersten Einschätzung der
persönlichen Vorsorgesituation (AHV / 1. Säule und Pensionskasse / 2. Säule,
Schweiz). Die Auswertung wird über eine Netlify Function serverseitig via
Anthropic API (Claude) erstellt.

## Projektstruktur

```
index.html                     Landingpage (Klarblick Vorsorge)
vorsorge-check.html            Quiz-Tool (Fragen + Ergebnis-Anzeige)
netlify.toml                   Netlify Build-Konfiguration
netlify/functions/claude.js    Serverless Function, ruft die Anthropic API auf
```

Die Landingpage verlinkt über den Button "Jetzt Vorsorge-Check starten" auf
`vorsorge-check.html`.

## Deployment

Dieses Repository ist mit Netlify verbunden. Jeder Push auf den Branch, der
mit Netlify verbunden ist, veröffentlicht automatisch eine neue Version –
kein manuelles Hoch-/Runterladen von Dateien nötig.

### API-Key hinterlegen

In den Netlify-Projekteinstellungen unter **Site configuration → Environment
variables**:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | dein Anthropic-API-Key |

Nach dem ersten Setzen einmal **Deploys → Trigger deploy** ausführen, damit
die Function den Key sieht.

### Eigene Domain

Unter **Domain management → Add a domain** die gewünschte Domain (z.B.
`klarblick-vorsorge.ch`) eintragen und die angezeigten DNS-Einträge beim
Domain-Anbieter setzen.

## Wichtig

- Der API-Key wird **nie** im Frontend verwendet, sondern ausschliesslich
  serverseitig in `netlify/functions/claude.js` gelesen.
- Diese Auswertung ersetzt keine persönliche Vorsorgeberatung – das Tool
  dient der ersten, unverbindlichen Orientierung.
