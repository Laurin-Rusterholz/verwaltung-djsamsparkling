/* ==========================================================================
   Abschnitts-Modell — was die Ansicht „Abschnitte“ zeigt, ohne DOM

   Bewusst eine eigene Datei ohne Firebase und ohne document: so lässt sich das
   Modell prüfen (scripts/ui-modell.test.mjs), statt es nur im Browser zu sehen.
   ========================================================================== */

/**
 * Welche Abschnitte der Website-Generator überhaupt bauen kann — dieselbe Liste
 * wie `BAUBAR` in s-mi/scripts/build.mjs. Steht sie hier falsch, zeigt die
 * Verwaltung einen Schalter für etwas, das auf der Website gar nicht erscheint.
 * Genau das war bis zum 10.08.2026 der Fall: „Sound & Genres“ und „Erlebnis“
 * liessen sich einschalten, auf der Seite kam nie etwas an.
 */
export const BAUBAR = [
  "about",
  "shows",
  "references",
  "gallery",
  "booking",
  "shop",
  "contact",
];

/** Abschnitte, die eine eigene Seite haben — nicht Teil der Startseite. */
export const EIGENE_SEITE = ["booking", "shop"];

/** Auf welcher Seite ein Abschnitt steht (oder null, wenn nirgends). */
export function seiteFuerAbschnitt(content, key) {
  return (content.pages || []).find((p) => (p.sections || []).includes(key)) || null;
}

export const seitenName = (p) =>
  p ? p.navLabel || (p.slug ? "/" + p.slug + "/" : "Startseite") : null;

/**
 * Das Modell hinter der Ansicht „Abschnitte“.
 *
 * Zwei Gruppen, weil es zwei verschiedene Dinge sind:
 *   aufDerWebsite  baubare Abschnitte, je mit der Seite, auf der sie stehen
 *   stillgelegt    Abschnitte, die im Inhalt liegen, die der Generator aber
 *                  nicht mehr baut — dort gibt es nichts zu schalten
 *
 * `einseiter` meldet, dass der geladene Stand noch das alte Ein-Seiten-Modell
 * ist. Der Generator ersetzt es beim Bauen; die Verwaltung zeigte davon nichts
 * und behauptete damit, Booking und Shop seien Abschnitte der Startseite.
 */
export function abschnittsModell(content) {
  const layout = Array.isArray(content.layout) ? content.layout : [];
  const sections = content.sections || {};
  const alle = layout.concat(Object.keys(sections).filter((k) => !layout.includes(k)));

  const aufDerWebsite = [];
  const stillgelegt = [];
  for (const key of alle) {
    const sec = sections[key] || {};
    const eintrag = { key, navLabel: sec.navLabel || key, enabled: sec.enabled !== false };
    if (!BAUBAR.includes(key)) {
      stillgelegt.push({ ...eintrag, grund: "Der Generator baut diesen Abschnitt nicht mehr." });
      continue;
    }
    const seite = seiteFuerAbschnitt(content, key);
    aufDerWebsite.push({
      ...eintrag,
      seite: seitenName(seite),
      seiteSlug: seite ? seite.slug : null,
      eigeneSeite: EIGENE_SEITE.includes(key),
    });
  }

  // Nummeriert wird je Seite — genauso rechnet der Generator.
  for (const eintrag of aufDerWebsite) {
    const seite = (content.pages || []).find((p) => (p.sections || []).includes(eintrag.key));
    if (!seite || !eintrag.enabled) {
      eintrag.nummer = null;
      continue;
    }
    // Genau wie der Generator: nicht baubare Abschnitte zaehlen nicht mit,
    // sonst zeigte die Verwaltung 01, 03, 04 … und die Website 01, 02, 03.
    const drauf = (seite.sections || []).filter(
      (k) => sections[k] && sections[k].enabled !== false && BAUBAR.includes(k)
    );
    eintrag.nummer = drauf.indexOf(eintrag.key) + 1;
  }

  return {
    aufDerWebsite,
    stillgelegt,
    einseiter: (content.pages || []).length <= 1,
    ohneSeite: aufDerWebsite.filter((e) => e.enabled && !e.seite).map((e) => e.key),
  };
}

/**
 * Den geladenen Stand auf das beschlossene Mehrseiten-Modell umstellen:
 * Startseite, /booking/ und /shop/. Die Vorlage (`defaults/site.json`) ist die
 * Quelle — dort steht der beschlossene Stand, damit er nicht an zwei Stellen
 * gepflegt werden muss.
 *
 * Angefasst werden nur `pages`, `layout` und die Seiten-Beschriftungen der
 * Übersetzungen. Die Inhalte der Abschnitte bleiben unberührt.
 */
export function aufMehrseitigStellen(content, defaults) {
  const seiten = defaults?.pages;
  if (!Array.isArray(seiten) || seiten.length < 2) return false;
  content.pages = JSON.parse(JSON.stringify(seiten));
  if (Array.isArray(defaults.layout)) content.layout = defaults.layout.slice();
  for (const sprache of Object.keys(content.i18n || {})) {
    const vorlage = defaults.i18n?.[sprache]?.pages;
    if (vorlage) content.i18n[sprache].pages = JSON.parse(JSON.stringify(vorlage));
  }
  return true;
}

/* ==========================================================================
   Die Startseite und ihre Auftritte

   BEFUND (Kunde, 13.09.2026): Auf der Website ging es von „Über mich" direkt
   zum Shop — Shows und Referenzen fehlten. Nichts war gelöscht: beide standen
   mit allen Einträgen auf /shows/, und auf der Startseite standen sie nicht
   mehr. Bis zum 02.09.2026 hatte der Generator die Seitenaufteilung bei JEDEM
   Bauen aus seiner eingecheckten Vorlage überschrieben und damit die Startseite
   immer wieder mit Shows und Referenzen bestückt; seit s-mi #29 gilt — richtig
   so — was hier in der Verwaltung steht. Damit wurde sichtbar, was hier
   gespeichert war.

   Diese Verwaltung ist die massgebliche Quelle. Deshalb wird die Lage hier
   gemeldet und hier korrigiert: ein Klick trägt die Abschnitte auf der
   Startseite nach, gespeichert und publiziert wie jede andere Änderung. Der
   Generator erzwingt nichts — sonst wäre der Schalter wieder eine Attrappe.
   ========================================================================== */

/** Was auf der Startseite stehen soll, solange nichts anderes entschieden ist. */
export const STARTSEITEN_AUFTRITTE = ["shows", "references"];

/** Die Startseite ist die Seite ohne Adresszusatz. */
export function startseiteVon(content) {
  return (content.pages || []).find((p) => String(p?.slug || "") === "") || null;
}

const hatInhalt = (content, key) => {
  const sec = (content.sections || {})[key];
  if (!sec) return false;
  if (!Array.isArray(sec.items)) return true;   // Abschnitte ohne Liste zählen als vorhanden
  return sec.items.some((i) => String((i && i.name) || "").trim());
};

/**
 * Welche Auftritts-Abschnitte auf der Startseite fehlen — baubar, eingeschaltet
 * und mit Inhalt, aber nicht auf der Startseite. Dass sie zusätzlich auf einer
 * eigenen Seite stehen, ist kein Grund: auf der Startseite sollen sie ebenfalls
 * erscheinen.
 */
export function fehlendeStartseitenAuftritte(content) {
  const start = startseiteVon(content);
  if (!start) return [];
  const drauf = new Set(start.sections || []);
  const sections = content.sections || {};
  return STARTSEITEN_AUFTRITTE.filter(
    (key) =>
      BAUBAR.includes(key) &&
      sections[key] &&
      sections[key].enabled !== false &&
      hatInhalt(content, key) &&
      !drauf.has(key)
  );
}

/**
 * Abschnitte, die auf einer Seite stehen, die der Generator aber nicht baut.
 * Genau das verdeckte den Befund: auf der Startseite stand „sound" — in der
 * Liste sah sie nach drei Abschnitten aus, gebaut wurden zwei.
 */
export function nichtBaubarAufSeiten(content) {
  const aus = [];
  for (const p of content.pages || []) {
    for (const key of p.sections || []) {
      if (!BAUBAR.includes(key)) aus.push({ key, seite: seitenName(p), seiteSlug: p.slug });
    }
  }
  return aus;
}

/**
 * Die Abschnitte auf der Startseite nachtragen — ERGÄNZEN, NIE ERSETZEN.
 * Eingefügt wird direkt hinter „about" (dort standen sie bis zum 02.09.2026);
 * gibt es kein „about", kommen sie ans Ende. Andere Seiten, die Reihenfolge der
 * übrigen Abschnitte und jeder Inhalt bleiben unangetastet.
 * Rückgabe: die tatsächlich nachgetragenen Schlüssel.
 */
export function aufStartseiteHolen(content, keys = null) {
  const start = startseiteVon(content);
  if (!start) return [];
  const fehlend = (keys || fehlendeStartseitenAuftritte(content)).filter(
    (k) => !(start.sections || []).includes(k)
  );
  if (!fehlend.length) return [];
  if (!Array.isArray(start.sections)) start.sections = [];
  /* Eingefügt wird hinter „about" — und hinter dem, was von den Auftritten
     schon dasteht. Sonst rutschte ein nachgetragenes „references" vor ein
     bereits vorhandenes „shows". */
  const inOrdnung = STARTSEITEN_AUFTRITTE.filter((k) => fehlend.includes(k));
  for (const key of inOrdnung) {
    const anker = ["about"].concat(STARTSEITEN_AUFTRITTE.slice(0, STARTSEITEN_AUFTRITTE.indexOf(key)));
    const letzter = anker.reduce((max, a) => Math.max(max, start.sections.indexOf(a)), -1);
    start.sections.splice(letzter >= 0 ? letzter + 1 : start.sections.length, 0, key);
  }
  /* Im Layout muss jeder Abschnitt vorkommen, sonst zählt die Verwaltung ihn
     nicht mit. Angehängt wird nur, was fehlt — die Reihenfolge bleibt sonst. */
  if (!Array.isArray(content.layout)) content.layout = [];
  for (const k of inOrdnung) if (!content.layout.includes(k)) content.layout.push(k);
  return inOrdnung;
}

/**
 * Wohin ein wieder eingeschalteter Abschnitt gehört: auf SEINE Seite, wenn er
 * eine hat (Booking auf /booking/, Shop auf /shop/), sonst auf die Startseite.
 * Früher landete alles auf der Startseite — damit stand der Shop plötzlich
 * wieder mitten auf der Startseite.
 */
export function zielSeiteFuer(content, key) {
  const pages = content.pages || [];
  const schon = pages.find((p) => (p.sections || []).includes(key));
  if (schon) return schon;
  return pages.find((p) => p.slug === key) || pages[0] || null;
}
