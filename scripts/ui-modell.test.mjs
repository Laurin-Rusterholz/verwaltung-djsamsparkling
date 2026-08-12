#!/usr/bin/env node
/**
 * Prüft das Modell hinter der Ansicht „Abschnitte“ — ohne Browser.
 *
 * Anlass (Sichtbefund 10.08.2026): die Verwaltung zeigte dort noch den alten
 * Einseiter — About, Sound, Shows, References, Gallery, Booking, Contact, Shop
 * (aus), Experience. Booking und Shop sind aber eigene Seiten, und Sound und
 * Experience baut der Generator gar nicht mehr.
 *
 *   node scripts/ui-modell.test.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAUBAR,
  abschnittsModell,
  aufMehrseitigStellen,
  zielSeiteFuer,
} from "../public/js/abschnitte.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const werksstand = JSON.parse(await readFile(resolve(HIER, "../public/defaults/site.json"), "utf8"));

let fehler = 0;
const pruefe = (name, fn) => {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (e) {
    fehler++;
    console.error("  FEHL " + name + "\n       " + e.message.split("\n")[0]);
  }
};

/* Der Stand, den die Verwaltung am 10.08.2026 wirklich zeigte: ein Einseiter,
   auf dem Booking und Shop Abschnitte der Startseite waren. */
const ALTER_EINSEITER = {
  layout: ["about", "sound", "shows", "references", "gallery", "booking", "contact", "shop", "experience"],
  pages: [
    {
      slug: "",
      navLabel: "Home",
      sections: ["about", "sound", "shows", "references", "gallery", "booking", "contact", "shop", "experience"],
    },
  ],
  sections: {
    about: { navLabel: "About" },
    sound: { navLabel: "Sound" },
    shows: { navLabel: "Shows" },
    references: { navLabel: "Referenzen" },
    gallery: { navLabel: "Galerie" },
    booking: { navLabel: "Booking" },
    contact: { navLabel: "Kontakt" },
    shop: { navLabel: "Shop", enabled: false },
    experience: { navLabel: "Erlebnis" },
  },
  i18n: { de: { pages: { 0: { navLabel: "Start" } } } },
};

console.log("Ansicht „Abschnitte“ — alter Einseiter erkannt:");

pruefe("meldet den Einseiter", () => {
  assert.equal(abschnittsModell(ALTER_EINSEITER).einseiter, true);
});

pruefe("Sound und Erlebnis stehen nicht mehr zwischen den echten Abschnitten", () => {
  const m = abschnittsModell(ALTER_EINSEITER);
  const keys = m.aufDerWebsite.map((e) => e.key);
  assert.ok(!keys.includes("sound"), "sound steht noch bei den baubaren: " + keys.join(", "));
  assert.ok(!keys.includes("experience"), "experience steht noch bei den baubaren");
  const still = m.stillgelegt.map((e) => e.key);
  assert.deepEqual(still.sort(), ["experience", "sound"]);
});

pruefe("kein Abschnitt fällt aus beiden Gruppen heraus", () => {
  const m = abschnittsModell(ALTER_EINSEITER);
  const gesehen = [...m.aufDerWebsite, ...m.stillgelegt].map((e) => e.key).sort();
  assert.deepEqual(gesehen, Object.keys(ALTER_EINSEITER.sections).sort());
});

console.log("\nUmstellung auf das Mehrseiten-Modell:");

const umgestellt = JSON.parse(JSON.stringify(ALTER_EINSEITER));
pruefe("greift und nimmt die Seiten aus dem Werks-Stand", () => {
  assert.equal(aufMehrseitigStellen(umgestellt, werksstand), true);
  // Erwartet wird der Werks-Stand selbst — so bleibt der Test richtig, wenn
  // eine Seite dazukommt (die Video-Seite kam am 10.08.2026 dazu).
  assert.deepEqual(
    umgestellt.pages.map((p) => p.slug),
    werksstand.pages.map((p) => p.slug)
  );
});

/* Booking hat eine eigene Seite. Der Shop hatte bis zum 12.08.2026 auch eine —
   er steht seither auf der Startseite, direkt unter der Galerie. Anlass: ein
   veroeffentlichter Artikel war "nicht zu sehen", weil er nur ueber das Menue
   erreichbar war. */
pruefe("Booking auf eigener Seite, Shop auf /shop/ UND als Einladung vorne", () => {
  const start = umgestellt.pages.find((p) => p.slug === "");
  assert.ok(!start.sections.includes("booking"), "booking steht weiter auf der Startseite");
  assert.ok(start.sections.includes("shop"), "die Shop-Einladung fehlt auf der Startseite");
  assert.equal(
    start.sections.indexOf("shop"),
    start.sections.indexOf("gallery") + 1,
    `die Einladung steht nicht direkt unter der Galerie: ${start.sections.join(", ")}`
  );
  assert.ok(
    umgestellt.pages.some((p) => p.slug === "shop" && (p.sections || []).includes("shop")),
    "die Shop-Seite mit dem Katalog fehlt"
  );
  const m = abschnittsModell(umgestellt);
  assert.equal(m.aufDerWebsite.find((e) => e.key === "booking").seiteSlug, "booking");
});

pruefe("danach ist es kein Einseiter mehr und nichts steht ohne Seite da", () => {
  const m = abschnittsModell(umgestellt);
  assert.equal(m.einseiter, false);
  assert.deepEqual(m.ohneSeite, []);
});

pruefe("Übersetzung der Seitennamen mitgezogen", () => {
  assert.equal(umgestellt.i18n.de.pages["1"].navLabel, werksstand.i18n.de.pages["1"].navLabel);
});

pruefe("Abschnitts-Inhalte bleiben unberührt", () => {
  assert.equal(umgestellt.sections.about.navLabel, "About");
  assert.equal(umgestellt.sections.shop.enabled, false);
});

console.log("\nWieder-Einschalten landet auf der richtigen Seite:");

/* Wieder eingeschaltet gehoert der Shop auf seine eigene Seite: dort steht der
   Katalog. Die Einladung auf der Startseite ist die zweite Ansicht desselben
   Abschnitts, keine eigene Heimat. */
pruefe("Shop kommt auf /shop/", () => {
  const c = JSON.parse(JSON.stringify(umgestellt));
  c.pages = c.pages.map((p) => ({ ...p, sections: p.sections.filter((k) => k !== "shop") }));
  assert.equal(zielSeiteFuer(c, "shop").slug, "shop");
});

pruefe("Booking kommt auf /booking/", () => {
  const c = JSON.parse(JSON.stringify(umgestellt));
  c.pages = c.pages.map((p) => ({ ...p, sections: p.sections.filter((k) => k !== "booking") }));
  assert.equal(zielSeiteFuer(c, "booking").slug, "booking");
});

pruefe("ein Startseiten-Abschnitt kommt auf die Startseite", () => {
  const c = JSON.parse(JSON.stringify(umgestellt));
  c.pages = c.pages.map((p) => ({ ...p, sections: p.sections.filter((k) => k !== "gallery") }));
  assert.equal(zielSeiteFuer(c, "gallery").slug, "");
});

console.log("\nWerks-Stand selbst:");

pruefe("ist das Mehrseiten-Modell", () => {
  const m = abschnittsModell(werksstand);
  assert.equal(m.einseiter, false);
  /* Eigene Seiten fuer Booking und Shop — plus die Startseite. Die Video-Seite
     ist am 11.08.2026 zurueckgenommen worden und darf nicht wiederkommen.

     Der Shop steht seit dem 12.08.2026 an zwei Plaetzen: der Katalog auf /shop/,
     die Einladung (heller Block) auf der Startseite. Beides ist derselbe
     Abschnitt; welche Ansicht eine Seite zeigt, entscheidet der Generator. */
  const slugs = werksstand.pages.map((p) => p.slug);
  assert.ok(slugs.includes(""), "Startseite fehlt");
  for (const eigen of ["booking", "shop"])
    assert.ok(slugs.includes(eigen), `Seite /${eigen}/ fehlt: ${slugs.join(", ")}`);
  assert.ok(
    (werksstand.pages[0].sections || []).includes("shop"),
    "Die Startseite traegt die Shop-Einladung nicht: " + (werksstand.pages[0].sections || []).join(", ")
  );
  assert.ok(!slugs.includes("videos"), "Die Video-Seite ist wieder da: " + slugs.join(", "));
  assert.equal(werksstand.sections.videos, undefined, "Der Video-Abschnitt ist wieder da");
});

pruefe("jeder eingeschaltete baubare Abschnitt steht auf einer Seite", () => {
  assert.deepEqual(abschnittsModell(werksstand).ohneSeite, []);
});

pruefe("Werks-Stand traegt die veroeffentlichte Ware, aber keine Zahlungsadresse", () => {
  /* Bis zum 11.08.2026 stand hier: die Vorlage bringt KEINE Ware mit. Das hat
     sich gedreht. Der Generator holte den Artikel frueher selbst zurueck, wenn
     die Warenliste leer war — diese Regel ist weg, denn sie machte das Loeschen
     des letzten Artikels unmoeglich. Damit der veroeffentlichte Artikel
     trotzdem nicht verloren geht, traegt ihn jetzt der Werks-Stand, und die
     Verwaltung holt ihn EINMALIG in den Inhalt (public/js/nachtragen.js). */
  const ware = werksstand.sections.shop.items || [];
  assert.ok(ware.length >= 1, "der Werks-Stand traegt keine Ware mehr");
  for (const p of ware) {
    assert.ok(String(p.name || "").trim(), "ein Artikel ohne Namen");
    assert.ok(!p.paymentLink, `Artikel "${p.name}" traegt eine Bezahladresse`);
  }
  assert.equal(werksstand.sections.shop.enabled, true);
  assert.ok(!/stripe\.com|link\.com/i.test(JSON.stringify(werksstand)));
});

pruefe("BAUBAR deckt sich mit den Abschnitten des Werks-Stands", () => {
  const drauf = new Set(werksstand.pages.flatMap((p) => p.sections || []));
  for (const k of drauf) assert.ok(BAUBAR.includes(k), `${k} steht auf einer Seite, ist aber nicht baubar`);
});

console.log(
  fehler
    ? `\n${fehler} Fehler.`
    : "\nAbschnitte: Mehrseiten-Modell, eigene Seiten fuer Booking und Shop,\n" +
        "stillgelegte Altabschnitte getrennt ausgewiesen, Werks-Stand ohne Ware."
);
process.exit(fehler ? 1 : 0);
