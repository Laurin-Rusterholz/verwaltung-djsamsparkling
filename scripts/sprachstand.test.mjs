/**
 * Was die Website anders zeigt als die Verwaltung — geprüft am Modell.
 *
 * ANLASS (Sämi, 15.09.2026): „Änderungen und Fotos aus der Verwaltung
 * erscheinen nicht zuverlässig." Nachgemessen am veröffentlichten Stand waren
 * es zwei verschiedene Dinge, und beide geschahen stumm:
 *   · 39 Texte stehen seit dem Sprachwechsel vom 07.09.2026 noch englisch auf
 *     der deutschen Seite, während die deutsche Fassung ungenutzt daneben liegt;
 *   · 5 von 42 Galerie-Einträgen haben keine Bilddatei und erscheinen nicht.
 * Dazu die dritte Rückmeldung: auf dem Handy zeigt die Website nur die ersten
 * vier Referenzen — wer hier ordnet, muss sehen, welche vier das sind.
 *
 * Aufruf:  node --test scripts/sprachstand.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sprachBefund,
  eigeneSpracheUebernehmen,
  bilderOhneDatei,
  handyVorschau,
} from "../public/js/sprachstand.js";

/* Nachgebaut aus dem veröffentlichten Stand — mit Beispieltexten, keine
   Kundendaten. Entscheidend ist die Form: Grundtext englisch, deutsche Fassung
   unter i18n.de, englische Übersetzung identisch mit dem Grundtext. */
const STAND = () => ({
  site: { lang: "de" },
  pages: [
    { slug: "", navLabel: "Home", sections: ["about", "shows", "references", "shop"] },
    { slug: "shows", navLabel: "Shows", sections: ["shows", "references"] },
  ],
  hero: { tagline: "Turning energy into euphoria.", kicker: "Schon deutsch" },
  sections: {
    about: { title: "About", photo: { src: "https://beispiel.invalid/a.jpg" } },
    shows: {
      items: [
        // vorbei: darf die gepflegte Referenz NICHT mehr aus der Liste nehmen
        { name: "Beispielclub", city: "Beispielstadt", date: "2020-09-05" },
        // kommend: steht schon als Termin auf der Seite
        { name: "Kommender Club", city: "Beispielstadt", date: "2999-01-01" },
      ],
    },
    references: {
      items: [
        { name: "Erste Referenz", city: "Beispielstadt" },
        { name: "Beispielclub", city: "Beispielstadt" },      // vergangener Termin — bleibt
        { name: "Zweite Referenz", city: "Beispielstadt" },
        { name: "Dritte Referenz", city: "Beispielstadt" },
        { name: "Kommender Club", city: "Beispielstadt" },    // kommender Termin — nicht doppelt
        { name: "Vierte Referenz", city: "Beispielstadt" },
        { name: "Erste Referenz", city: "Beispielstadt" },    // echte Dublette — einmal
        { name: "Fuenfte Referenz", city: "Beispielstadt" },
      ],
    },
    gallery: {
      items: [
        { src: "https://beispiel.invalid/1.jpg", alt: "Eins" },
        { src: "", alt: "Zweites ohne Datei" },
        { src: "   " },
      ],
    },
  },
  i18n: {
    de: { hero: { tagline: "Aus Energie wird Euphorie.", kicker: "Etwas anderes" }, sections: { about: { title: "Über" } } },
    en: { hero: { tagline: "Turning energy into euphoria." }, sections: { about: { title: "About" } } },
  },
});

test("belegte Fälle werden gefunden, fragliche getrennt gezählt", () => {
  const b = sprachBefund(STAND());
  assert.equal(b.master, "de");
  assert.deepEqual(b.sicher.map((e) => e.pfad).sort(), ["hero.tagline", "sections.about.title"]);
  // hero.kicker weicht ab, ist aber NICHT belegt (keine englische Entsprechung)
  assert.deepEqual(b.fraglich.map((e) => e.pfad), ["hero.kicker"]);
  assert.equal(b.sicher.find((e) => e.pfad === "hero.tagline").fassung, "Aus Energie wird Euphorie.");
});

test("übernommen wird nur das Belegte — und nur einmal", () => {
  const c = STAND();
  const geaendert = eigeneSpracheUebernehmen(c);
  assert.deepEqual(geaendert.sort(), ["hero.tagline", "sections.about.title"]);
  assert.equal(c.hero.tagline, "Aus Energie wird Euphorie.");
  assert.equal(c.sections.about.title, "Über");
  // Das Fragliche bleibt stehen: es könnte eine veraltete Übersetzung sein.
  assert.equal(c.hero.kicker, "Schon deutsch");
  // Die Übersetzungstabelle wird nicht angefasst.
  assert.equal(c.i18n.de.hero.tagline, "Aus Energie wird Euphorie.");
  // Zweiter Durchgang ändert nichts mehr.
  assert.deepEqual(eigeneSpracheUebernehmen(c), []);
});

test("nur ausgewählte Stellen übernehmen", () => {
  const c = STAND();
  assert.deepEqual(eigeneSpracheUebernehmen(c, ["hero.tagline"]), ["hero.tagline"]);
  assert.equal(c.sections.about.title, "About", "eine nicht ausgewählte Stelle wurde geändert");
  // Ein Pfad, der nicht belegt ist, wird auch auf Zuruf nicht angefasst.
  assert.deepEqual(eigeneSpracheUebernehmen(c, ["hero.kicker"]), []);
  assert.equal(c.hero.kicker, "Schon deutsch");
});

test("ohne alte Hauptsprache gibt es nichts zu übernehmen", () => {
  const c = STAND();
  c.hero.tagline = "Aus Energie wird Euphorie.";
  c.sections.about.title = "Über";
  const b = sprachBefund(c);
  assert.equal(b.sicher.length, 0);
});

test("Bilder ohne Datei werden benannt", () => {
  const luecken = bilderOhneDatei(STAND());
  assert.deepEqual(luecken.map((l) => l.nummer), [2, 3]);
  assert.equal(luecken[0].alt, "Zweites ohne Datei");
  // Ein Bildfeld mit Datei taucht nicht auf.
  assert.ok(!luecken.some((l) => l.wo === "about"));
});

test("die Handy-Vorschau nennt genau die vier, die das Handy zeigt", () => {
  const h = handyVorschau(STAND());
  /* KUNDENBEFUND 15.09.2026: „Beispielclub" ist eine gepflegte Referenz an
     zweiter Stelle. Dass derselbe Abend im Rueckblick steht, darf ihn nicht aus
     der Liste nehmen — sonst rutscht ein anderer Club auf seinen Platz, und
     genau das verletzt „die wichtige Referenz muss unter den ersten vier
     stehen". */
  assert.deepEqual(h.vorschau.map((r) => r.name), [
    "Erste Referenz", "Beispielclub", "Zweite Referenz", "Dritte Referenz",
  ]);
  assert.deepEqual(h.rest.map((r) => r.name), ["Vierte Referenz", "Fuenfte Referenz"]);
  /* Weggelassen wird nur, was schon als KOMMENDER Termin auf der Seite steht —
     der kuendigte sich sonst zweimal an. */
  assert.deepEqual(h.weggelassen.map((r) => r.name), ["Kommender Club"]);
});

test("eine echte Dublette in der Liste erscheint einmal", () => {
  const h = handyVorschau(STAND(), { grenze: 10 });
  const namen = h.vorschau.map((r) => r.name);
  assert.equal(namen.filter((n) => n === "Erste Referenz").length, 1, "dieselbe Referenz steht zweimal da");
  // Der erste Platz gilt — die Reihenfolge der Verwaltung bleibt.
  assert.deepEqual(namen, [
    "Erste Referenz", "Beispielclub", "Zweite Referenz", "Dritte Referenz", "Vierte Referenz", "Fuenfte Referenz",
  ]);
});

test("ohne Shows auf derselben Seite wird nichts weggelassen", () => {
  const c = STAND();
  c.pages[0].sections = ["about", "references", "shop"];   // Startseite ohne Shows
  c.pages[1].sections = ["shows"];                          // und /shows/ ohne Referenzen
  const h = handyVorschau(c);
  assert.deepEqual(h.weggelassen, []);
  assert.deepEqual(h.vorschau.map((r) => r.name), [
    "Erste Referenz", "Beispielclub", "Zweite Referenz", "Dritte Referenz",
  ]);
});
