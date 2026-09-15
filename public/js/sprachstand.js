/* ==========================================================================
   Was die Website anders zeigt als die Verwaltung

   BEFUND (Kunde, 15.09.2026): „Änderungen und Fotos aus der Verwaltung
   erscheinen nicht zuverlässig." Am veröffentlichten Stand nachgemessen waren
   es zwei verschiedene Dinge — und beide geschahen stumm:

   1. TEXTE IN DER ALTEN HAUPTSPRACHE. Bis zum 07.09.2026 war Englisch die
      gepflegte Sprache und Deutsch die Übersetzung; seitdem ist Deutsch die
      gepflegte Sprache. Der Generator setzt für die Hauptsprache nichts mehr
      ein — sie IST der Grundtext. Was damals nicht übertragen wurde, steht bis
      heute englisch auf der deutschen Seite, während die deutsche Fassung
      ungenutzt unter i18n.de liegt (39 Stellen, u. a. „Turning energy into
      euphoria." statt „Aus Energie wird Euphorie.").

   2. BILDER OHNE DATEI. Ein Galerie-Eintrag ohne Bilddatei steht hier in der
      Liste und erscheint auf der Website nicht (5 von 42).

   Beides wird hier nur BENANNT und auf Klick übernommen — nichts geschieht von
   selbst, und gelöscht wird gar nichts. Rein und ohne DOM, damit es prüfbar
   ist (scripts/sprachstand.test.mjs).
   ========================================================================== */

import { collectStrings, NO_TRANSLATE_PATH } from "./i18n.js";

const text = (v) => String(v == null ? "" : v);
const getPfad = (o, pfad) => String(pfad).split(".").reduce((a, k) => (a == null ? a : a[k]), o);

/** Übersetzungstabelle flach machen — dieselbe Form wie im Generator. */
export function flachmachen(node, prefix = "", out = {}) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) flachmachen(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => flachmachen(v, `${prefix}.${i}`, out));
    return out;
  }
  if (typeof node === "string") out[prefix] = node;
  return out;
}

/**
 * Stellen, an denen der Grundtext noch WÖRTLICH die alte Hauptsprache trägt,
 * obwohl eine Fassung in der heutigen Hauptsprache danebenliegt.
 *
 * Bewusst eng: nur wenn der Grundtext Zeichen für Zeichen mit der englischen
 * Übersetzung übereinstimmt, ist bewiesen, dass er nie gewechselt hat. Alles
 * andere kommt als „fraglich" zurück — das kann auch eine veraltete
 * Übersetzung sein, und der Grundtext gehört der Verwaltung.
 */
export function sprachBefund(content, { alteSprache = "en" } = {}) {
  const master = text(content?.site?.lang) || "de";
  const eigen = flachmachen((content?.i18n && content.i18n[master]) || {});
  const alt = flachmachen((content?.i18n && content.i18n[alteSprache]) || {});
  const sicher = [];
  const fraglich = [];
  for (const [pfad, fassung] of Object.entries(eigen)) {
    if (NO_TRANSLATE_PATH.test(pfad)) continue;
    const jetzt = getPfad(content, pfad);
    if (typeof jetzt !== "string" || !jetzt.trim()) continue;
    if (typeof fassung !== "string" || !fassung.trim()) continue;
    if (jetzt.trim() === fassung.trim()) continue;
    const eintrag = { pfad, aufDerWebsite: jetzt, fassung };
    if (text(alt[pfad]).trim() && text(alt[pfad]).trim() === jetzt.trim()) sicher.push(eintrag);
    else fraglich.push(eintrag);
  }
  return { master, sicher, fraglich };
}

/**
 * Die belegten Stellen übernehmen: der Grundtext bekommt die Fassung aus der
 * eigenen Sprache. ERGÄNZEN, NIE ERSETZEN im Sinne von: angefasst wird nur,
 * was nachweislich noch in der alten Sprache steht — und nur das.
 * Rückgabe: die Pfade, die wirklich geändert wurden.
 */
export function eigeneSpracheUebernehmen(content, pfade = null) {
  const befund = sprachBefund(content);
  const erlaubt = new Set(befund.sicher.map((e) => e.pfad));
  const ziel = (pfade || [...erlaubt]).filter((p) => erlaubt.has(p));
  const geaendert = [];
  for (const pfad of ziel) {
    const eintrag = befund.sicher.find((e) => e.pfad === pfad);
    if (!eintrag) continue;
    const teile = pfad.split(".");
    let cur = content;
    for (let i = 0; i < teile.length - 1; i++) {
      if (cur == null || typeof cur !== "object") { cur = null; break; }
      cur = cur[teile[i]];
    }
    if (!cur || typeof cur !== "object") continue;
    cur[teile[teile.length - 1]] = eintrag.fassung;
    geaendert.push(pfad);
  }
  return geaendert;
}

/**
 * Bilder, die hier stehen und auf der Website fehlen. Ein Eintrag ohne
 * Bilddatei wird vom Generator übersprungen — hier soll man sehen, welcher.
 */
export function bilderOhneDatei(content) {
  const luecken = [];
  const items = (content?.sections?.gallery?.items) || [];
  (Array.isArray(items) ? items : Object.values(items)).forEach((bild, i) => {
    if (!text(bild?.src).trim()) luecken.push({ wo: "gallery", nummer: i + 1, alt: text(bild?.alt) });
  });
  for (const [wo, feld, name] of [
    ["about", content?.sections?.about?.photo, "Über mich"],
    ["booking", content?.sections?.booking?.photo, "Booking"],
    ["hero", content?.hero?.media, "Hero"],
  ]) {
    if (feld && Object.keys(feld).length && !text(feld.src).trim()) luecken.push({ wo, nummer: null, name });
  }
  return luecken;
}

/**
 * Welche Referenzen auf dem HANDY zuerst stehen.
 *
 * Die Website zeigt dort die obersten vier, der Rest kommt über einen Knopf
 * (Kundenwunsch 12.08.2026). Wer hier ordnet, soll sehen, welche vier das sind.
 *
 * Gegen die Termine wird dabei NICHTS gefiltert (Kundenentscheid 15.09.2026):
 * die Referenzliste ist eine gepflegte Auswahl, und auch ein erneuter kommender
 * Auftritt im selben Club darf die Referenz nicht entfernen. Die Vorschau zeigt
 * deshalb genau das, was auf der Website steht — bis auf echte Dubletten IN
 * dieser Liste, die dort einmal erscheinen.
 */
export const HANDY_VORSCHAU = 4;

export function handyVorschau(content, { grenze = HANDY_VORSCHAU } = {}) {
  const refs = (content?.sections?.references?.items) || [];
  const liste = (Array.isArray(refs) ? refs : Object.values(refs)).filter((r) => text(r?.name).trim());
  const schluessel = (name, city) =>
    (text(name).trim().toLowerCase().replace(/[\s-]+/g, " ") + "|" +
      text(city).trim().toLowerCase().replace(/[\s-]+/g, " ")).trim();
  /* Eine echte Dublette IN dieser Liste erscheint auf der Website einmal —
     der erste Platz gilt. Gelöscht wird hier nichts.

     Was hier NICHT mehr steht: bis zum 15.09.2026 nahm diese Vorschau jeden
     Auftritt heraus, der auf derselben Seite auch als Termin gepflegt ist.
     Genau dadurch fiel „Nox Club" weg, obwohl er in der Liste an dritter
     Stelle steht — und auf dem Handy rutschte ein anderer Club auf seinen
     Platz. Die Website filtert ebenfalls nicht mehr. */
  const gesehen = new Set();
  const dubletten = [];
  const sichtbar = liste.filter((r) => {
    const key = schluessel(r.name, r.city);
    if (gesehen.has(key)) {
      dubletten.push(r);
      return false;
    }
    gesehen.add(key);
    return true;
  });
  return {
    vorschau: sichtbar.slice(0, grenze),
    rest: sichtbar.slice(grenze),
    dubletten,
    grenze,
  };
}

export default { sprachBefund, eigeneSpracheUebernehmen, bilderOhneDatei, handyVorschau, HANDY_VORSCHAU };
