/* ==========================================================================
   KI-Übersetzung — Claude (Anthropic Messages API)

   Der Aufruf geht direkt aus dem Browser an api.anthropic.com. Das ist hier
   bewusst so: die Verwaltung ist eine rein statische Seite ohne Server, und
   ein Netlify-Function-Umweg würde bei ~180 Texten in die 10-Sekunden-Grenze
   laufen. Rohes fetch statt SDK, weil die Verwaltung ohne Build-Schritt und
   ohne Abhängigkeiten auskommt.

   Der API-Key liegt in samsparking/config (Realtime Database) und ist nur mit
   gültiger Sitzung lesbar — also nur für Geräte, die das Passwort kennen.
   Wer das Passwort hat, kann den Key auslesen und auf Sams Rechnung
   übersetzen; bei Verdacht den Key in console.anthropic.com neu erzeugen.
   ========================================================================== */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5";

/** Wie viele Texte pro Anfrage. Klein genug für kurze Antwortzeiten. */
export const BATCH_SIZE = 40;

const LANG_NAMES = {
  en: "Englisch (internationales Presskit-Englisch)",
  fr: "Französisch (fr-CH, Schweizer Sprachgebrauch)",
};

/** Antwortformat erzwingen — kein Nachparsen von Fliesstext. */
const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
        },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

function systemPrompt(target, brief) {
  return [
    "Du übersetzt die Website des Schweizer DJs Sam Sparking aus dem Deutschen ins " +
      (LANG_NAMES[target] || target) +
      ".",
    "",
    "Die Texte stammen aus einem Presskit: kurz, laut, selbstbewusst, ohne Werbefloskeln.",
    "Halte diesen Ton. Übersetze Sinn und Wirkung, nicht Wort für Wort.",
    "",
    "Regeln:",
    "- Eigennamen bleiben: Sam Sparking, Ortsnamen, Club- und Festivalnamen, Genre-Namen (Techno, Tech House, Afro House, Melodic House).",
    "- Typografie übernehmen: Endpunkte wie „SHOWS.“, Grossschreibung, Pfeile (↓ → ·), Auslassungspunkte.",
    "- Platzhalter in geschweiften Klammern ({n}, {total}) unverändert stehen lassen.",
    "- Knopf- und Menütexte bleiben ähnlich kurz wie das Original (Platz auf dem Handy).",
    "- Keine URLs, E-Mail-Adressen, Dateinamen oder Zahlenwerte übersetzen.",
    "- Schweizer Bezug beibehalten (CH-Städte, „Schweiz“ → Switzerland / Suisse).",
    "- Keine Anführungszeichen oder Erklärungen hinzufügen; nur den übersetzten Text liefern.",
    "",
    "Der Schlüssel (id) verrät den Ort auf der Website — z. B. sections.booking.title ist eine",
    "Überschrift, ui.menu ein Menü-Knopf. Nutze das, um Länge und Ton zu treffen.",
    brief ? "\nKurzprofil des Künstlers (Kontext, nicht übersetzen):\n" + brief : "",
    "",
    "Gib zu jeder id genau eine Übersetzung zurück — keine id auslassen, keine erfinden.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Einen Stapel übersetzen.
 * @param {{apiKey:string, target:string, entries:{id:string,text:string}[], brief?:string, signal?:AbortSignal}} opts
 * @returns {Promise<Record<string,string>>} id → Übersetzung
 */
export async function translateBatch({ apiKey, target, entries, brief, signal }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Erlaubt den Aufruf direkt aus dem Browser (CORS).
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: systemPrompt(target, brief),
      messages: [
        {
          role: "user",
          content:
            "Übersetze diese Texte ins " +
            (LANG_NAMES[target] || target) +
            ":\n\n" +
            JSON.stringify({ items: entries }, null, 1),
        },
      ],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message || "";
    } catch (e) {
      /* keine JSON-Antwort */
    }
    if (res.status === 401) throw new Error("API-Key nicht akzeptiert (401). Key in den Einstellungen prüfen.");
    if (res.status === 429) throw new Error("Zu viele Anfragen (429) — kurz warten und nochmals versuchen.");
    if (res.status === 400 && /credit|balance/i.test(detail))
      throw new Error("Kein Guthaben auf dem Anthropic-Konto.");
    throw new Error(`Anthropic ${res.status}${detail ? ": " + detail : ""}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("Antwort nicht lesbar — nochmals versuchen.");
  }
  const out = {};
  (parsed.translations || []).forEach((t) => {
    if (t && typeof t.id === "string" && typeof t.text === "string") out[t.id] = t.text;
  });
  return out;
}

/** Kurztest, ob der Key funktioniert — eine winzige Anfrage. */
export async function checkKey(apiKey) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Antworte nur mit: ok" }],
    }),
  });
  if (res.ok) return true;
  const err = await res.json().catch(() => ({}));
  throw new Error(err?.error?.message || `HTTP ${res.status}`);
}
