#!/usr/bin/env node
/**
 * Prüft, dass kein Kanal verloren geht — und dass Listen beim Speichern keine
 * Löcher bekommen.
 *
 * Anlass (Sichtbefund 11.08.2026): die Verwaltung lud links nur „Mixcloud",
 * Vorschau und Website zeigten aber Instagram, Mixcloud, TikTok und Spotify.
 * Der Grund lag im Generator der Website: der legte fehlende Kanäle beim Bauen
 * selbst an. In der Datenbank stand davon nie etwas, es gab also auch nichts zu
 * bearbeiten. Die Regeln im Generator sind weg; damit trotzdem kein Kanal
 * verschwindet, holt die Verwaltung sie beim Laden in die Liste.
 *
 *   node scripts/kanaele.test.mjs
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { kanaeleNachtragen } from "../public/js/kanaele-nachtragen.js";
import {
  fotografLoeschen,
  referenzenNachtragen,
  wareNachtragen,
  shopInfoNachtragen,
  telefonRaeumen,
  nachtragenBeimLaden,
} from "../public/js/nachtragen.js";
import { pruneForRtdb, withDefaults, clone } from "../public/js/util.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const werksstand = JSON.parse(await readFile(resolve(HIER, "../public/defaults/site.json"), "utf8"));
const quellen = {
  "content.js": await readFile(resolve(HIER, "../public/js/content.js"), "utf8"),
  "fields.js": await readFile(resolve(HIER, "../public/js/fields.js"), "utf8"),
};

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
const gleich = (ist, soll, was) => {
  const a = JSON.stringify(ist);
  const b = JSON.stringify(soll);
  if (a !== b) throw new Error(`${was}: ${a} statt ${b}`);
};

const namen = (c) => (c.sections.contact.socials || []).map((x) => x.label);
const nurMixcloud = () => ({
  sections: {
    contact: { socials: [{ label: "Mixcloud", url: "https://www.mixcloud.com/samsparking/" }] },
  },
});

/* --------------------------------------------------------- nachtragen */

pruefe("der Werks-Stand führt überhaupt Kanäle", () => {
  const werk = werksstand.sections?.contact?.socials || [];
  if (werk.length < 2) throw new Error(`nur ${werk.length} Kanal/Kanäle im Werks-Stand`);
  for (const k of werk) if (!k.label) throw new Error("ein Kanal ohne Namen im Werks-Stand");
});

pruefe("genau der gemeldete Fall: aus Mixcloud werden alle Kanäle", () => {
  const c = nurMixcloud();
  const dazu = kanaeleNachtragen(c, werksstand);
  const soll = (werksstand.sections.contact.socials || []).map((x) => x.label);
  /* Die Reihenfolge des Werks-Stands kommt heraus — nicht "Mixcloud zuerst,
     Rest hinten dran". Sonst stuende auf der Website ploetzlich Mixcloud vorne,
     nur weil in der Datenbank zufaellig Mixcloud gespeichert war. */
  gleich(namen(c), soll, "Reihenfolge nach dem Nachtragen");
  if (!dazu.length) throw new Error("nichts als nachgetragen gemeldet");
  if (dazu.includes("Mixcloud")) throw new Error("Mixcloud doppelt nachgetragen");
});

pruefe("die eigene Adresse gewinnt — nichts wird überschrieben", () => {
  const c = {
    sections: {
      contact: {
        socials: [
          { label: "Instagram", url: "https://instagram.com/etwas_anderes", handle: "@eigen", inHeader: true },
        ],
      },
    },
  };
  kanaeleNachtragen(c, werksstand);
  const insta = c.sections.contact.socials.find((x) => x.label === "Instagram");
  gleich(insta.url, "https://instagram.com/etwas_anderes", "Instagram-Adresse");
  gleich(insta.handle, "@eigen", "Handle");
  gleich(insta.inHeader, true, "Kopf-Schalter");
  const wieOft = c.sections.contact.socials.filter((x) => /instagram/i.test(x.label)).length;
  if (wieOft !== 1) throw new Error(`Instagram steht ${wieOft}x`);
});

pruefe("auch nur an der Adresse erkannt — kein Doppel bei anderer Schreibweise", () => {
  const c = {
    sections: {
      contact: { socials: [{ label: "Insta", url: "https://www.instagram.com/sam_sparking/" }] },
    },
  };
  kanaeleNachtragen(c, werksstand);
  const instagram = c.sections.contact.socials.filter((x) =>
    /instagram/i.test(String(x.label) + String(x.url || ""))
  );
  if (instagram.length !== 1) throw new Error("Instagram doppelt: " + JSON.stringify(instagram));
});

pruefe("eine eigene Reihenfolge wird nicht umgeworfen", () => {
  /* Nur einfuegen, nie umsortieren: wer die Kanaele selbst geordnet hat, behaelt
     seine Ordnung — die fehlenden kommen an der Stelle dazu, die sie im
     Werks-Stand haben. */
  const c = {
    sections: {
      contact: {
        socials: [
          { label: "Spotify", url: "https://open.spotify.com/artist/318V87QIgd2VmokY52zP6S" },
          { label: "Mixcloud", url: "https://www.mixcloud.com/samsparking/" },
        ],
      },
    },
  };
  kanaeleNachtragen(c, werksstand);
  const liste = namen(c);
  if (liste.indexOf("Spotify") > liste.indexOf("Mixcloud"))
    throw new Error("eigene Reihenfolge umgeworfen: " + liste.join(" | "));
  for (const name of (werksstand.sections.contact.socials || []).map((x) => x.label))
    if (!liste.includes(name)) throw new Error(`Kanal "${name}" fehlt: ` + liste.join(" | "));
});

pruefe("ein eigener Kanal bleibt stehen", () => {
  const c = nurMixcloud();
  c.sections.contact.socials.push({ label: "SoundCloud", url: "https://soundcloud.com/sam" });
  kanaeleNachtragen(c, werksstand);
  if (!namen(c).includes("SoundCloud")) throw new Error("eigener Kanal weg: " + namen(c));
});

pruefe("zweimal aufgerufen ändert nichts mehr", () => {
  const c = nurMixcloud();
  kanaeleNachtragen(c, werksstand);
  const nachher = JSON.stringify(c);
  const dazu = kanaeleNachtragen(c, werksstand);
  if (dazu.length) throw new Error("beim zweiten Mal wieder nachgetragen: " + dazu.join(", "));
  gleich(JSON.parse(nachher), JSON.parse(JSON.stringify(c)), "Inhalt beim zweiten Lauf");
});

pruefe("keine geratene Adresse — jede kommt aus dem Werks-Stand", () => {
  const c = nurMixcloud();
  kanaeleNachtragen(c, werksstand);
  const erlaubt = new Set(
    (werksstand.sections.contact.socials || []).map((x) => String(x.url || "")).filter(Boolean)
  );
  for (const k of c.sections.contact.socials) {
    const url = String(k.url || "");
    if (!url) continue;
    if (!erlaubt.has(url)) throw new Error(`Adresse nicht aus dem Werks-Stand: ${url}`);
  }
});

pruefe("ohne Kanäle im Werks-Stand passiert nichts", () => {
  const c = nurMixcloud();
  const dazu = kanaeleNachtragen(c, { sections: { contact: { socials: [] } } });
  gleich(dazu, [], "nachgetragen");
  gleich(namen(c), ["Mixcloud"], "Kanäle");
});

/* ------------------------------------------------------------ Persistenz */

pruefe("withDefaults füllt eine kürzere Liste NICHT auf — daher das Nachtragen", () => {
  const c = withDefaults(clone(nurMixcloud()), werksstand);
  // Das ist der Ist-Zustand und der Grund für kanaele-nachtragen.js: eine
  // vorhandene Liste bleibt unangetastet, der Werks-Stand mischt sich nicht ein.
  gleich(namen(c), ["Mixcloud"], "Kanäle nach withDefaults");
});

pruefe("ein Listeneintrag ohne Inhalt verliert seinen Platz nicht", () => {
  /* Die Realtime Database speichert ein leeres Objekt gar nicht. Wurde beim
     Speichern jedes leere Feld zu null, blieb von einem frisch angelegten
     Eintrag {} übrig — der Platz fiel weg, alles dahinter rutschte vor, und die
     positionsgebundenen Übersetzungen zeigten auf den falschen Eintrag. */
  const roh = pruneForRtdb({
    sections: {
      contact: {
        socials: [
          { label: "Mixcloud", url: "https://www.mixcloud.com/samsparking/", handle: "" },
          { label: "", handle: "", url: "" },
          { label: "Spotify", url: "https://open.spotify.com/artist/x" },
        ],
      },
    },
  });
  const liste = roh.sections.contact.socials;
  if (liste.length !== 3) throw new Error("Liste ist auf " + liste.length + " Einträge geschrumpft");
  if (Object.keys(liste[1]).length === 0)
    throw new Error("der leere Eintrag wurde zu {} — die Datenbank speichert das nicht");
  for (const [i, e] of liste.entries())
    for (const [feld, wert] of Object.entries(e))
      if (wert === null) throw new Error(`Eintrag ${i}, Feld "${feld}" steht auf null — Loch in der Liste`);
});

pruefe("ausserhalb von Listen bleibt es bei null — leere Felder sollen weg", () => {
  const roh = pruneForRtdb({ sections: { contact: { email: "", phone: "+41 77 509 11 71" } } });
  gleich(roh.sections.contact.email, null, "leeres Feld");
  gleich(roh.sections.contact.phone, "+41 77 509 11 71", "gefülltes Feld");
});

/* ------------------------------------------------------------- Impressum */

pruefe("der Werks-Stand trägt das Impressum", () => {
  const imp = werksstand.imprint || {};
  if (!imp.email) throw new Error("keine E-Mail im Impressum");
  if (!imp.location) throw new Error("kein Standort im Impressum");
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(imp.email))
    throw new Error("die E-Mail sieht nicht wie eine E-Mail aus: " + imp.email);
});

pruefe("das Impressum trägt keine erfundenen Pflichtangaben", () => {
  const alsText = JSON.stringify(werksstand.imprint || {});
  for (const wort of ["Handelsregister", "CHE-", "MwSt", "UID", "Postfach", "strasse", "straße"])
    if (new RegExp(wort, "i").test(alsText))
      throw new Error(`"${wort}" steht im Impressum — nicht bekannt, nicht erfunden`);
  // Und keine Strasse mit Hausnummer.
  if (/\d+\s*[a-z]?\s*,/.test(String(werksstand.imprint?.location || "")))
    throw new Error("der Standort sieht nach einer Strassenadresse aus");
});

/* ------------------------------------------------------- einmalig, nie zweimal */

pruefe("jeder Nachtrag laeuft genau einmal — sonst liesse sich nichts loeschen", () => {
  const c = {
    migrationen: {},
    sections: {
      contact: { socials: [], phone: "+41 77 509 11 71" },
      references: { items: [] },
      shop: { items: [], info: [] },
    },
  };
  const erst = nachtragenBeimLaden(c, werksstand);
  if (!erst.meldungen.length) throw new Error("beim ersten Laden wurde nichts nachgetragen");
  for (const marke of ["kanaele", "referenzen", "ware", "shopInfo", "telefon"])
    if (c.migrationen[marke] !== true) throw new Error(`Marke "${marke}" nicht gesetzt`);

  // Jetzt loescht der Kunde alles wieder — und es bleibt geloescht.
  c.sections.shop.items = [];
  c.sections.references.items = [];
  c.sections.contact.socials = [];
  const zweit = nachtragenBeimLaden(c, werksstand);
  if (zweit.meldungen.length)
    throw new Error("beim zweiten Laden erneut nachgetragen: " + zweit.meldungen.join(" / "));
  if (c.sections.shop.items.length) throw new Error("geloeschte Ware kam zurueck");
  if (c.sections.references.items.length) throw new Error("geloeschte Referenzen kamen zurueck");
  if (c.sections.contact.socials.length) throw new Error("geloeschte Kanaele kamen zurueck");
});

/* ------------------------------------------------------------- Referenzen */

pruefe("fehlende Referenzen werden nachgetragen, bestehende nicht angefasst", () => {
  const c = {
    sections: {
      references: {
        items: [
          { name: "Kugl", city: "St. Gallen", highlight: true },
          { name: "IVY", city: "St. Gallen" },
        ],
      },
    },
  };
  const dazu = referenzenNachtragen(c, werksstand);
  const items = c.sections.references.items;
  // Die bestehenden bleiben vorne, in ihrer Reihenfolge, mit ihrem Zustand.
  if (items[0].name !== "Kugl" || items[0].highlight !== true)
    throw new Error("bestehender Favorit veraendert: " + JSON.stringify(items[0]));
  if (items[1].name !== "IVY") throw new Error("Reihenfolge veraendert: " + items.map((r) => r.name).join(", "));
  // Keine Dubletten.
  const paare = items.map((r) => `${r.name}|${r.city}`);
  const doppelt = paare.filter((x, i) => paare.indexOf(x) !== i);
  if (doppelt.length) throw new Error("Dublette: " + doppelt.join(", "));
  // Alle Referenzen des Werks-Stands sind jetzt da.
  for (const r of werksstand.sections.references.items)
    if (!paare.includes(`${r.name}|${r.city}`)) throw new Error(`"${r.name}" fehlt weiter`);
  // Und nichts Nachgetragenes ist automatisch gross.
  const grossNeu = items.slice(2).filter((r) => r.highlight === true);
  if (grossNeu.length) throw new Error("nachgetragen und gross: " + grossNeu.map((r) => r.name).join(", "));
  if (!dazu.length) throw new Error("nichts als nachgetragen gemeldet");
});

pruefe("die verbindliche Liste ist vollstaendig, IVY inklusive", () => {
  /* Schreibweise "B9": so steht der Eintrag in der Datenbank des Kunden. Mit
     "B9 eventlocation" daneben staende er zweimal da — Dubletten sind
     ausdruecklich ausgeschlossen. */
  const paare = (werksstand.sections.references.items || []).map((r) => `${r.name} — ${r.city}`);
  const muss = [
    "Sektor 11 — Zürich", "Kugl — St. Gallen", "BBC — Gossau", "Maiaiaiparty — Appenzell Ausserrhoden",
    "B9 — St. Gallen", "Amadeusbar — Herisau", "Fasnacht Oberegg — Appenzell Innerrhoden",
    "Party Weekend Sirnach — St. Gallen", "IVY — St. Gallen", "Kantonales Musik fest — Appenzell Ausserrhoden",
    "Jugendopenair — St. Gallen", "Monoevents — St. Gallen", "Ultrawild Festival — St. Gallen",
    "Jublasurium — Aargau", "Dorffest Herisau — Herisau", "Turnunterhaltung Sirnach — Sirnach",
    "Xploration Events — Glarus", "Winterzauber Bazenheid — Bazenheid",
    "Firehouse Party Wittenbach — Wittenbach", "Cyberspace party — St. Gallen", "Talhof — St. Gallen",
    "Volleyballturnier Malters — Luzern", "Metzertor — St. Gallen", "Abschlussball Wittenbach — St. Gallen",
    "The Q — Schaan, FL",
  ];
  for (const eintrag of muss) if (!paare.includes(eintrag)) throw new Error(`"${eintrag}" fehlt`);
  const doppelt = paare.filter((x, i) => paare.indexOf(x) !== i);
  if (doppelt.length) throw new Error("Dublette: " + [...new Set(doppelt)].join(", "));
  // Die vier bisherigen Favoriten stehen als erste vier, in ihrer Reihenfolge.
  if (paare.slice(0, 4).join(" | ") !== "Kugl — St. Gallen | Sektor 11 — Zürich | BBC — Gossau | Ultrawild Festival — St. Gallen")
    throw new Error("die ersten vier stimmen nicht: " + paare.slice(0, 4).join(", "));
});

/* -------------------------------------------------------- Shop und Telefon */

pruefe("die veroeffentlichte Ware kommt zurueck, wenn der Shop leer ist", () => {
  const c = { sections: { shop: { items: [] } } };
  const dazu = wareNachtragen(c, werksstand);
  if (!c.sections.shop.items.length) throw new Error("nichts nachgetragen");
  /* Welcher Artikel das ist, entscheidet die Verwaltung — hier zaehlt nur, dass
     genau der Stand des Werks-Standes zurueckkommt und nichts erfunden wird. */
  const sollNamen = (werksstand.sections.shop.items || []).map((p) => p.name);
  if (dazu.join(" | ") !== sollNamen.join(" | "))
    throw new Error(`zurueckgeholt: ${dazu.join(", ")} — erwartet ${sollNamen.join(", ")}`);
  // Und keine Bezahladresse aus der Vorlage.
  for (const p of c.sections.shop.items)
    if (p.paymentLink) throw new Error(`"${p.name}" traegt eine Bezahladresse aus der Vorlage`);
  // Und ein voller Shop wird nicht angefasst.
  const voll = { sections: { shop: { items: [{ name: "Hoodie", price: "79" }] } } };
  wareNachtragen(voll, werksstand);
  if (voll.sections.shop.items.length !== 1) throw new Error("voller Shop veraendert");
});

pruefe("der Infostreifen wird angelegt und verspricht nichts Unbelegtes", () => {
  const c = { sections: { shop: { items: [], info: [] } } };
  shopInfoNachtragen(c, werksstand);
  const info = c.sections.shop.info || [];
  if (info.length !== 3) throw new Error(`${info.length} Punkte statt drei`);
  for (const i of info) {
    if (!i.title || !i.text) throw new Error("ein Punkt ohne Titel oder Text");
    if (!["zahlung", "versand", "fragen"].includes(i.icon)) throw new Error("unbekanntes Zeichen: " + i.icon);
  }
  const text = JSON.stringify(info);
  for (const wort of ["Stripe", "TWINT", "Apple Pay", "gratis", "kostenlos", "24h", "48h"])
    if (text.includes(wort)) throw new Error(`der Streifen verspricht "${wort}"`);
});

pruefe("die alte Telefonnummer wird geleert, eine neue nicht", () => {
  const c = { sections: { contact: { phone: "+41 77 509 11 71" } } };
  telefonRaeumen(c);
  if (c.sections.contact.phone) throw new Error("nicht geleert: " + c.sections.contact.phone);
  const eigen = { sections: { contact: { phone: "+41 44 000 00 00" } } };
  telefonRaeumen(eigen);
  if (eigen.sections.contact.phone !== "+41 44 000 00 00") throw new Error("eigene Nummer geleert");
  // Und im Werks-Stand steht keine mehr.
  if (String(werksstand.sections?.contact?.phone || "").trim())
    throw new Error("der Werks-Stand traegt wieder eine Telefonnummer");
});

/* --------------------------------------------------------------- Fotograf */

pruefe("der Fotograf ist ueberall geloescht, nicht nur versteckt", () => {
  const c = {
    site: { artist: "Sam Sparking", photoCredit: "Sarto Photography" },
    sections: {
      gallery: { items: [{ src: "a.jpg", alt: "A", credit: "Sarto Photography" }, { src: "b.jpg", alt: "B" }] },
      about: { photo: { src: "p.jpg", credit: "Photo — Sarto Photography" } },
      booking: { photo: { src: "q.jpg", credit: "Sarto Photography" } },
    },
    i18n: { de: { site: { photoCredit: "Sarto Photography" }, sections: { gallery: { items: { 0: { credit: "Sarto" } } } } } },
    i18nHash: { de: { site: { photoCredit: "abc123" } } },
  };
  const weg = fotografLoeschen(c);
  if (!weg) throw new Error("nichts geloescht");
  const roh = JSON.stringify(c);
  if (roh.includes("Sarto")) throw new Error("Sarto steht noch drin: " + roh);
  if (roh.includes("photoCredit")) throw new Error("photoCredit steht noch drin");
  if (roh.includes('"credit"')) throw new Error("ein credit-Feld steht noch drin");
  // Die Bilder selbst bleiben.
  if (c.sections.gallery.items.length !== 2) throw new Error("ein Medium ist verschwunden");
  if (c.sections.gallery.items[0].src !== "a.jpg" || c.sections.gallery.items[0].alt !== "A")
    throw new Error("das Medium wurde veraendert: " + JSON.stringify(c.sections.gallery.items[0]));
  if (c.sections.about.photo.src !== "p.jpg") throw new Error("das Portrait wurde veraendert");
  // Zweimal aufgerufen: nichts mehr zu tun, nichts kaputt.
  if (fotografLoeschen(c) !== 0) throw new Error("beim zweiten Lauf erneut geloescht");
});

pruefe("im Werks-Stand steht kein Fotograf mehr", () => {
  const roh = JSON.stringify(werksstand);
  for (const wort of ["Sarto", "photoCredit", '"credit"'])
    if (roh.includes(wort)) throw new Error(`"${wort}" steht wieder im Werks-Stand`);
});

pruefe("kein Editor bietet den Fotografen wieder an", () => {
  // Am Quelltext geprueft — die Ansicht selbst prueft die Browser-Abnahme.
  for (const datei of ["content.js", "fields.js"]) {
    /* Kommentare zaehlen nicht — sie erklaeren, warum es das Feld nicht mehr
       gibt. Geprueft wird der Code. */
    const quelle = quellen[datei]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const zeilen = quelle
      .split("\n")
      .filter((z) => /photoCredit|\.credit`|"Bildnachweis"|Fotograf/.test(z));
    if (zeilen.length)
      throw new Error(`${datei} bietet es wieder an: ${zeilen[0].trim().slice(0, 90)}`);
  }
});

/* ----------------------------------------------------------------- Release */

pruefe("die Release-Sperre steht im Werks-Stand", () => {
  const r = werksstand.release || {};
  if (r.enabled !== true) throw new Error("nicht eingeschaltet");
  if (r.date !== "2026-08-12" || r.time !== "18:00")
    throw new Error(`steht auf ${r.date} ${r.time}`);
  if (r.zone !== "Europe/Zurich") throw new Error("Zeitzone: " + r.zone);
  if (!r.headline) throw new Error("keine Ueberschrift fuer den Countdown");
});

/* ---------------------------------------------- frueher: Referenzen (alt) */

pruefe("der Werks-Stand trägt die Referenzen der Verwaltung, mit IVY", () => {
  const items = werksstand.sections?.references?.items || [];
  const paare = items.map((r) => `${r.name} — ${r.city}`);
  if (!paare.includes("IVY — St. Gallen"))
    throw new Error("IVY fehlt: " + (paare.join(", ") || "keine Referenzen"));
  if (paare.some((p) => p.startsWith("Club Eden")))
    throw new Error("Club Eden steht wieder da — das war die Ersatzliste");
});

pruefe("höchstens vier Referenzen stehen gross", () => {
  const gross = (werksstand.sections?.references?.items || []).filter((r) => r.highlight === true);
  if (gross.length > 4) throw new Error(`${gross.length} Referenzen gross: ` + gross.map((r) => r.name).join(", "));
});

pruefe("keine Ortsübersetzung nach Platz", () => {
  for (const root of ["i18n", "i18nHash"])
    for (const lang of Object.keys(werksstand[root] || {})) {
      const ref = werksstand[root][lang]?.sections?.references;
      if (ref && ref.items !== undefined)
        throw new Error(`${root}.${lang}.sections.references.items steht wieder da`);
    }
});

console.log(
  fehler
    ? `\n${fehler} Fehler.`
    : "\nAlles in Ordnung.\n" +
        "kanaele-nachtragen: was gespeichert ist, gewinnt; was fehlt, kommt dazu — als\n" +
        "                    bearbeitbare Zeile, ohne geratene Adresse, ohne zu loeschen.\n" +
        "persistenz:         ein Listeneintrag ohne Inhalt behaelt seinen Platz, sonst\n" +
        "                    rutschen die Uebersetzungen auf den falschen Eintrag.\n" +
        "impressum:          E-Mail und Standort da, keine erfundenen Pflichtangaben.\n" +
        "referenzen:         die Liste der Verwaltung mit IVY, hoechstens vier gross."
);
process.exit(fehler ? 1 : 0);
