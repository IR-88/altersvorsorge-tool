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

    // E-Mail-Versand ist bewusst "best effort": schlägt er fehl, bekommt die
    // Nutzerin ihre Auswertung trotzdem sofort auf der Seite angezeigt.
    await sendResultEmails(answers, parsed).catch(() => {});

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

Antworte NUR mit einem validen JSON-Array, ohne Markdown, ohne Backticks, ohne Text davor oder danach. Das Array soll genau 5 Objekte enthalten mit den Feldern "title" und "body" (body: 3-5 Sätze, konkret und verständlich, Fliesstext):
1. title: "Deine Einschätzung" — kurze persönliche Standortbestimmung, wo die Kundin heute steht.
2. title: "AHV-Rente (1. Säule)" — Einschätzung zur ungefähren Höhe der AHV-Rente basierend auf Einkommen, Pensum und Beitragsjahren, inkl. Hinweis wie sie die genaue Rente erfährt (individueller Kontoauszug bei der Ausgleichskasse).
3. title: "Pensionskasse: Rente oder Kapital?" — konkrete Abwägung Rente vs. Kapitalbezug basierend auf der genannten Präferenz, Alter und Guthaben.
4. title: "Worauf du jetzt achten solltest" — 3-4 wichtige Punkte vor der Pensionierung, angepasst an ihre Situation.
5. title: "Deine nächsten Schritte" — konkrete, umsetzbare nächste Schritte.`;
}

// Verschickt die Auswertung an die Nutzerin und (falls konfiguriert) eine
// kurze Lead-Benachrichtigung an die Betreiberin. Beide E-Mails laufen über
// Resend. Fehlt einer der env vars, wird der jeweilige Versand übersprungen,
// statt die ganze Anfrage scheitern zu lassen.
async function sendResultEmails(answers, cards) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!resendKey || !fromEmail) return;

  const userEmail = (answers.email || "").trim();
  const sendable = [];

  if (userEmail) {
    sendable.push({
      from: fromEmail,
      to: [userEmail],
      subject: "Deine persönliche Vorsorge-Auswertung",
      html: buildResultHtml(cards)
    });
  }

  const notifyEmail = process.env.LEAD_NOTIFY_EMAIL;
  if (notifyEmail) {
    sendable.push({
      from: fromEmail,
      to: [notifyEmail],
      subject: `Neuer Vorsorge-Check Lead: ${userEmail || "ohne E-Mail"}`,
      html: buildLeadNotificationHtml(answers)
    });
  }

  await Promise.all(
    sendable.map((email) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`
        },
        body: JSON.stringify(email)
      })
    )
  );
}

function buildResultHtml(cards) {
  const cardsHtml = (cards || [])
    .map(
      (c) => `
        <tr>
          <td style="padding:0 0 20px;">
            <div style="background:#fbeef1;border-radius:14px;padding:20px 22px;">
              <h3 style="margin:0 0 8px;font-family:Georgia,serif;color:#950032;font-size:18px;">${escapeHtml(c.title || "")}</h3>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3a0014;">${escapeHtml(c.body || "")}</p>
            </div>
          </td>
        </tr>`
    )
    .join("");

  return `
  <div style="background:#f2b7c2;padding:32px 16px;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="padding-bottom:24px;text-align:center;">
          <h1 style="margin:0;font-family:Georgia,serif;color:#950032;font-size:26px;">Deine Vorsorge-Auswertung</h1>
        </td>
      </tr>
      ${cardsHtml}
      <tr>
        <td style="padding-top:12px;text-align:center;font-size:12px;color:#5a0020;line-height:1.5;">
          Diese Einschätzung dient der ersten Orientierung und ersetzt keine persönliche Vorsorgeberatung.<br>
          Klarblick Vorsorge
        </td>
      </tr>
    </table>
  </div>`;
}

function buildLeadNotificationHtml(answers) {
  const rows = Object.entries(answers)
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:4px 10px;font-weight:bold;color:#3a0014;">${escapeHtml(key)}</td>
          <td style="padding:4px 10px;color:#3a0014;">${escapeHtml(String(value))}</td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;padding:20px;">
    <h2 style="color:#950032;">Neuer Vorsorge-Check Lead</h2>
    <table role="presentation" style="border-collapse:collapse;">${rows}</table>
  </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
