/* ==========================================================================
   Statistik — die Rechnung, ohne Bildschirm

   Hier steht nur das Rechnen mit den Zählern: Tage bilden, Summen ziehen,
   Anteile ausrechnen. Kein DOM, keine Datenbank — damit es sich ohne Browser
   prüfen lässt (scripts/statistik.test.mjs). Die Ansicht liegt in statistik.js.
   ========================================================================== */

export const ZEITZONE = "Europe/Zurich";

/** Datum in der Schweiz, "2026-08-12" — dieselbe Rechnung wie im Zähler. */
export const tagVon = (d = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: ZEITZONE }).format(d);

/**
 * Der Tag n Tage vor `jetzt`.
 *
 * Gerechnet wird über 12:00 UTC: so kippt die Rechnung nicht an der Zeitumstellung
 * oder kurz vor Mitternacht auf den falschen Tag.
 */
export function tagMinus(n, jetzt = new Date()) {
  const d = new Date(jetzt);
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return tagVon(d);
}

export const zahl = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const formatZahl = (n) => zahl(n).toLocaleString("de-CH");

/** "2026-08-12" → "12.08." */
export const kurz = (tag) => {
  const [, m, t] = String(tag).split("-");
  return t && m ? `${t}.${m}.` : String(tag);
};

/**
 * Die letzten `n` Tage als Reihe, ältester zuerst. Ein Tag ohne Eintrag ist
 * eine Null und keine Lücke — sonst verschiebt sich die Reihe und ein stiller
 * Tag sieht aus wie ein Fehler.
 */
export function reihe(tage, n = 14, jetzt = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const tag = tagMinus(n - 1 - i, jetzt);
    return { tag, aufrufe: zahl(tage?.[tag]?.aufrufe), besuche: zahl(tage?.[tag]?.besuche) };
  });
}

/** Summe eines Feldes über die letzten `n` Tage (heute eingeschlossen). */
export function summe(tage, n, feld = "aufrufe", jetzt = new Date()) {
  let s = 0;
  for (let i = 0; i < n; i++) s += zahl(tage?.[tagMinus(i, jetzt)]?.[feld]);
  return s;
}

/**
 * Eine Verteilung sortiert, mit Anteil in Prozent. Nullen fallen weg: ein
 * Eintrag mit 0 Aufrufen sagt nichts und macht die Liste nur länger.
 */
export function anteile(werte) {
  const paare = Object.entries(werte || {})
    .map(([key, v]) => ({ key, n: zahl(v?.aufrufe ?? v) }))
    .filter((p) => p.n > 0)
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  const gesamt = paare.reduce((s, p) => s + p.n, 0);
  return paare.map((p) => ({ ...p, prozent: gesamt ? Math.round((p.n / gesamt) * 100) : 0 }));
}

/** Der erste Tag, für den es Zahlen gibt — "gezählt wird seit …". */
export const seit = (tage) => Object.keys(tage || {}).sort()[0] || "";
