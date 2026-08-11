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
  // Videos haben seit August 2026 eine eigene Seite (/videos/) — zusaetzlich zu
  // den Videos, die in der Bilderwand stehen duerfen.
  "videos",
  "booking",
  "shop",
  "contact",
];

/** Abschnitte, die eine eigene Seite haben — nicht Teil der Startseite. */
export const EIGENE_SEITE = ["videos", "booking", "shop"];

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
