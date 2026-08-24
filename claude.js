// netlify/functions/claude.js
// Server-seitige Function: nimmt die Quiz-Antworten entgegen, ruft die
// Anthropic API mit dem geheimen API-Key auf und gibt ein JSON-Array
// mit den Auswertungs-Cards zurück.

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  // Preflight-Request (CORS)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Nur POST-Anfragen werden unterstützt." })
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Der API-Schlüssel ist auf dem Server nicht konfiguriert. Bitte ANTHROPIC_API_KEY in den Netlify Umgebungsvariablen setzen."
      })
    };
  }

  let answers;
  try {
    answers = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Die gesendeten Daten konnten nicht gelesen werden." })
    };
  }

  const prompt = buildPrompt(answers);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system:
          "Du antwortest ausschliesslich mit einem validen JSON-Array. Kein Markdown, keine Codeblöcke, keine Backticks, kein Text vor oder nach dem JSON.",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (response.status === 529 || response.status === 503) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: "Der Dienst ist gerade stark ausgelastet. Bitte versuche es in einem Moment erneut." })
      };
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: "Die Anfrage an den KI-Dienst ist fehlgeschlagen (Status " + response.status + ")." })
      };
    }

    const data = await response.json();
    const textBlock = (data.content || []).map((b) => b.text || "").join("\n");
    const match = textBlock.match(/\[[\s\S]*\]/);

    if (!match) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Die Antwort konnte nicht ausgewertet werden. Bitte versuche es erneut." })
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Die Antwort war kein gültiges JSON. Bitte versuche es erneut." })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: parsed })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Unerwarteter Fehler beim Aufruf des KI-Dienstes. Bitte versuche es erneut." })
    };
  }
};

function buildPrompt(answers) {
  return `Du bist eine erfahrene Schweizer Vorsorge-Expertin und hilfst einer Kundin, eine erste Einschätzung zu ihrer Vorsorgesituation (1. Säule AHV und 2. Säule BVG/Pensionskasse) zu erhalten. Antworte ausschliesslich auf Deutsch (Schweizer Kontext).

Hier sind die Angaben der Kundin aus einem Quiz:
- Altersgruppe: ${answers.alter || "unbekannt"}
- Zivilstand: ${answers.zivilstand || "unbekannt"}
- Durchschnittliches Arbeitspensum: ${answers.pensum || "unbekannt"}
- Durchschnittliches Jahreseinkommen (brutto): ${answers.einkommen || "unbekannt"}
- AHV-Beitragslücken: ${answers.beitragsjahre || "unbekannt"}
- Pensionskassen-Guthaben (2. Säule): ${answers.pk_guthaben || "unbekannt"}
- Geplantes Pensionierungsalter: ${answers.pensionierungsalter || "unbekannt"}
- Präferenz Rente vs. Kapitalbezug: ${answers.sicherheit_flexibilitaet || "unbekannt"}
- Persönliches Anliegen: "${answers.anliegen || ""}"

Erstelle eine hilfreiche, konkrete, aber unverbindliche Einschätzung. Gib realistische Grössenordnungen an (z.B. dass die maximale AHV-Einzelrente 2026 bei ca. CHF 2'520/Monat liegt und die Minimalrente bei ca. CHF 1'260/Monat, abhängig von Beitragsjahren und Durchschnittseinkommen), weise aber klar darauf hin, dass dies keine verbindliche Berechnung ersetzt und eine individuelle Abklärung bei der Ausgleichskasse bzw. Pensionskasse nötig ist.

Wichtige aktuelle Fakten, die du einbeziehen sollst, wo relevant:
- Ab 2026 wird die 13. AHV-Rente eingeführt, erstmals ausbezahlt im Dezember 2026 — erwähne das kurz, falls es für die Situation der Kundin relevant ist.
- Für die volle AHV-Maximalrente ist ein durchschnittliches Jahreseinkommen von mindestens CHF 90'720 über alle Beitragsjahre nötig. Personen in Niedriglohnbranchen (z.B. Verkauf, Coiffeurgewerbe, Gastronomie) erreichen dieses Einkommen auch bei 100% Arbeitspensum oft nie — das ist vielen Betroffenen nicht bewusst. Weise bei entsprechend tiefem Einkommen (z.B. unter CHF 60'000) explizit und einfühlsam darauf hin, damit die Kundin realistisch einschätzen kann, wo sie steht, statt von der Maximalrente auszugehen.

Antworte NUR mit einem validen JSON-Array, ohne Markdown, ohne Backticks, ohne Text davor oder danach. Das Array soll genau 5 Objekte enthalten mit den Feldern "title" und "body" (body: 3-5 Sätze, konkret und verständlich, Fliesstext):
1. title: "Deine Einschätzung" — kurze persönliche Standortbestimmung, wo die Kundin heute steht.
2. title: "AHV-Rente (1. Säule)" — Einschätzung zur ungefähren Höhe der AHV-Rente basierend auf Einkommen, Pensum und Beitragsjahren, inkl. Hinweis wie sie die genaue Rente erfährt (individueller Kontoauszug bei der Ausgleichskasse). Falls das Einkommen im Niedriglohnbereich liegt, weise auf die CHF-90'720-Schwelle hin und dass die Maximalrente damit realistisch ausser Reichweite liegt.
3. title: "Pensionskasse: Rente oder Kapital?" — konkrete Abwägung Rente vs. Kapitalbezug basierend auf der genannten Präferenz, Alter und Guthaben.
4. title: "Worauf du jetzt achten solltest" — 3-4 wichtige Punkte vor der Pensionierung, angepasst an ihre Situation.
5. title: "Deine nächsten Schritte" — konkrete, umsetzbare nächste Schritte.`;
}
