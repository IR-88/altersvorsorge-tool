# Vorsorge-Check

Ein interaktives Quiz-Tool zur ersten Einschätzung der persönlichen Vorsorgesituation
(AHV / 1. Säule und Pensionskasse / 2. Säule, Schweiz). Die Auswertung wird über eine
Netlify Function serverseitig via Anthropic API (Claude) erstellt.

## Projektstruktur

```
index.html                     Frontend (Quiz + Ergebnis-Anzeige)
netlify.toml                   Netlify Build-Konfiguration
netlify/functions/claude.js    Serverless Function, ruft die Anthropic API auf
```

## Deployment

### 1. Repository auf GitHub anlegen
```bash
git init
git add .
git commit -m "Initial commit: Vorsorge-Check Tool"
git branch -M main
git remote add origin https://github.com/<dein-username>/<dein-repo>.git
git push -u origin main
```

### 2. Mit Netlify verbinden
1. Auf [app.netlify.com](https://app.netlify.com) einloggen
2. **Add new site → Import an existing project** → GitHub-Repository auswählen
3. Build-Einstellungen werden automatisch aus `netlify.toml` übernommen
   (Build-Command bleibt leer, Functions-Ordner: `netlify/functions`)

### 3. API-Key hinterlegen
In den Netlify-Projekteinstellungen unter **Site configuration → Environment variables**:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | dein Anthropic-API-Key |

Danach einmal **Deploys → Trigger deploy** ausführen, damit die Function den Key sieht.

## Wichtig

- Der API-Key wird **nie** im Frontend verwendet, sondern ausschliesslich serverseitig
  in `netlify/functions/claude.js` gelesen.
- Diese Auswertung ersetzt keine persönliche Vorsorgeberatung – das Tool dient der
  ersten, unverbindlichen Orientierung.
