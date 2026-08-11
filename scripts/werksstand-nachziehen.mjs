#!/usr/bin/env node
/**
 * Werks-Stand aus dem Stand der Website nachziehen.
 *
 * WOZU: `public/defaults/site.json` ist der Auslieferungs-Inhalt — er greift,
 * wenn in der Datenbank noch nichts steht ("Standard-Inhalt laden"). Er soll
 * dasselbe zeigen wie die ausgelieferte Website, sonst startet ein frisch
 * aufgesetztes Projekt in einem alten Stand. Genau das war am 10.08.2026 der
 * Fall: der Werks-Stand war noch der Einseiter vom 27.07., ohne eigene Seiten
 * fuer /booking/ und /shop/.
 *
 * Von Hand ist das nicht zu halten — es sind ueber hundert Stellen. Dieses
 * Skript zieht den Stand aus `../s-mi/content/site.json` nach und laesst dabei
 * genau die Stellen aus, die im Werks-Stand bewusst anders sind. Jede Ausnahme
 * steht unten mit Begruendung.
 *
 *   node scripts/werksstand-nachziehen.mjs --pruefen   nur melden
 *   node scripts/werksstand-nachziehen.mjs             uebernehmen
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const QUELLE = resolve(HIER, "../../s-mi/content/site.json");
const ZIEL = resolve(HIER, "../public/defaults/site.json");
const NUR_PRUEFEN = process.argv.includes("--pruefen");

/* ---------------------------------------------------------------- Ausnahmen */

/**
 * Tote Oberflaechentexte. Die Website liest keinen dieser Schluessel mehr; im
 * Werks-Stand wuerden sie bei jedem frisch aufgesetzten Projekt in die
 * Datenbank geschrieben und sahen dann aus, als sei TWINT eingerichtet.
 * Entfernt am 10.08.2026 — die ehrlichen Ersatztexte stehen im Generator.
 */
const TOTE_UI_TEXTE = [
  "payBank",
  "payBankName",
  "payHolder",
  "payNote",
  "payQrCaption",
  "payQrMissing",
  "payPending",
];

/**
 * Stellen, die aus dem bisherigen Werks-Stand uebernommen werden statt aus der
 * Website. Beides sind Felder, die die Verwaltung bearbeitet, der Generator
 * aber nicht liest (`follow` steht nicht in BAUBAR, `moreLabel` wird nirgends
 * ausgegeben). Im Stand der Website fehlen sie deshalb — wuerden sie hier
 * einfach wegfallen, stuenden die Editoren leer.
 */
const AUS_DEM_WERKSSTAND = [["sections", "follow"], ["sections", "references", "moreLabel"]];

const lies = async (p) => JSON.parse(await readFile(p, "utf8"));
const kopie = (v) => JSON.parse(JSON.stringify(v));
const hole = (o, pfad) => pfad.reduce((a, k) => (a == null ? a : a[k]), o);
function setze(o, pfad, wert) {
  if (wert === undefined) return;
  let cur = o;
  for (const k of pfad.slice(0, -1)) cur = cur[k] || (cur[k] = {});
  cur[pfad.at(-1)] = wert;
}

/**
 * Eine Liste um die stillgelegten Eintraege kuerzen — und die Uebersetzungen
 * mitziehen. Uebersetzungen haengen am PLATZ in der Liste
 * (i18n.de.hero.stats["1"] gehoert zu hero.stats[1]); wer nur die Liste kuerzt,
 * verschiebt jede Uebersetzung dahinter um einen Platz. Auf der Website bleibt
 * die Kennzahl deshalb markiert stehen und wird erst beim Rendern weggelassen;
 * im Werks-Stand soll sie gar nicht erst dabei sein, also wird hier wirklich
 * gekuerzt und die Tabelle neu durchnummeriert.
 */
function ohneStillgelegte(inhalt, listenPfad) {
  const liste = hole(inhalt, listenPfad);
  if (!Array.isArray(liste)) return 0;
  const behalten = [];
  liste.forEach((e, i) => {
    if (!e || e.entfernt !== true) behalten.push(i);
  });
  if (behalten.length === liste.length) return 0;

  setze(
    inhalt,
    listenPfad,
    behalten.map((i) => {
      const e = kopie(liste[i]);
      delete e.entfernt;
      return e;
    })
  );

  // Dieselbe Umnummerierung fuer jede Uebersetzungs- und Pruefsummen-Tabelle.
  for (const wurzel of ["i18n", "i18nHash"]) {
    for (const sprache of Object.keys(inhalt[wurzel] || {})) {
      const tabPfad = [wurzel, sprache, ...listenPfad];
      const tab = hole(inhalt, tabPfad);
      if (!tab || typeof tab !== "object") continue;
      const neu = {};
      behalten.forEach((alt, neuIdx) => {
        if (tab[String(alt)] !== undefined) neu[String(neuIdx)] = tab[String(alt)];
      });
      setze(inhalt, tabPfad, neu);
    }
  }
  return liste.length - behalten.length;
}

/* -------------------------------------------------------------------- Werk */

const website = await lies(QUELLE);
const alt = await lies(ZIEL);
const neu = kopie(website);
const getan = [];

// 1) Die Vorlage traegt keine Revisionsnummer — die zaehlt nur die Datenbank.
if (neu.contentRevision !== undefined) {
  delete neu.contentRevision;
  getan.push("contentRevision entfernt");
}

// 2) Tote Zahlungs-Texte in allen Sprachen und Pruefsummen.
let toteWeg = 0;
for (const feld of TOTE_UI_TEXTE) {
  for (const pfad of [
    ["ui", feld],
    ["i18n", "de", "ui", feld],
    ["i18n", "fr", "ui", feld],
    ["i18nHash", "de", "ui", feld],
    ["i18nHash", "fr", "ui", feld],
  ]) {
    const eltern = hole(neu, pfad.slice(0, -1));
    if (eltern && eltern[pfad.at(-1)] !== undefined) {
      delete eltern[pfad.at(-1)];
      toteWeg++;
    }
  }
}
if (toteWeg) getan.push(`${toteWeg} tote Zahlungs-Texte entfernt`);

// 3) Der technische Rider ist seit August 2026 von der Seite genommen.
if (neu.sections?.booking?.rider !== undefined) {
  delete neu.sections.booking.rider;
  getan.push("Rider entfernt");
}

/* 4) Termine gehoeren nicht in eine Vorlage. Der Eintrag der Website zeigt mit
      `inquiryId` auf eine Booking-Anfrage in der Datenbank (Personendaten) und
      traegt ein Datum, das irgendwann in der Vergangenheit liegt. Der Abschnitt
      erscheint ohne kommenden Termin von selbst nicht — und der Menuepunkt
      dazu auch nicht. */
if (Array.isArray(neu.sections?.shows?.items) && neu.sections.shows.items.length) {
  getan.push(`${neu.sections.shows.items.length} Termin(e) aus der Vorlage genommen`);
  neu.sections.shows.items = [];
}

// 5) Stillgelegte Kennzahlen ("First set 2021") gar nicht erst mitnehmen.
const wegHero = ohneStillgelegte(neu, ["hero", "stats"]);
const wegFakten = ohneStillgelegte(neu, ["sections", "about", "facts"]);
if (wegHero || wegFakten)
  getan.push(`${wegHero + wegFakten} stillgelegte Kennzahl(en) gekuerzt, Uebersetzungen mitgezogen`);

// 6) Felder, die nur die Verwaltung kennt, aus dem bisherigen Stand behalten.
for (const pfad of AUS_DEM_WERKSSTAND) {
  const wert = hole(alt, pfad);
  if (wert !== undefined && hole(neu, pfad) === undefined) {
    setze(neu, pfad, kopie(wert));
    getan.push(`${pfad.join(".")} aus dem Werks-Stand behalten`);
  }
}

/* ------------------------------------------------------- Sicherheitsregeln */

/* Ohne echte Ware und ohne gueltigen Zahlungslink darf im Werks-Stand nichts
   Kaufbares stehen. Der Generator baut ohne Ware von selbst kein
   Bestellformular und keine Bezahl-Angaben — aber die Vorlage darf ihm auch
   keine Ware und keine Adresse unterschieben. */
const fehler = [];
if (!Array.isArray(neu.sections?.shop?.items) || neu.sections.shop.items.length)
  fehler.push("Der Werks-Stand traegt Ware im Shop — ohne verifizierte Artikeldaten darf dort nichts stehen.");
if (neu.sections?.shop?.enabled !== true)
  fehler.push("Der Shop-Abschnitt muss eingeschaltet sein, sonst gibt es /shop/ gar nicht (404 statt 200).");
/* Keine Zahlungsadresse im Werks-Stand. Die Payment Links der Artikel sind
   davon ausgenommen — sie gehoeren zu echter Ware und sind oeffentliche
   Adressen. Weil der Werks-Stand ohnehin ohne Ware ausgeliefert wird, darf hier
   trotzdem keine stehen; geprueft wird alles AUSSER den paymentLink-Feldern,
   damit die Regel nicht ploetzlich zuschlaegt, sobald es echte Ware gibt. */
const ohnePaymentLinks = JSON.parse(JSON.stringify(neu));
for (const ware of ohnePaymentLinks.sections?.shop?.items || []) delete ware.paymentLink;
const alsText = JSON.stringify(ohnePaymentLinks);
for (const muster of [/stripe\.com/i, /link\.com/i, /\bpaymentUrl\b/, /buy\.stripe/i]) {
  if (muster.test(alsText)) fehler.push(`Zahlungsadresse im Werks-Stand gefunden: ${muster}`);
}
if (neu.site?.lang !== "en")
  fehler.push(`Hauptsprache ist "${neu.site?.lang}" — die Grundwerte muessen die Hauptsprache sein.`);
for (const [sprache, wort] of [["de", "Kaufen"], ["fr", "Acheter"]]) {
  if (hole(neu, ["i18n", sprache, "sections", "shop", "buyLabel"]) !== wort)
    fehler.push(`Shop-Uebersetzung fehlt: i18n.${sprache}.sections.shop.buyLabel`);
}
// Die eigenen Seiten muessen wirklich da sein, sonst bleibt es ein Einseiter.
const slugs = (neu.pages || []).map((p) => p.slug);
for (const soll of ["", "booking", "shop"])
  if (!slugs.includes(soll))
    fehler.push(`Seite "${soll || "/"}" fehlt in pages — der Werks-Stand waere wieder ein Einseiter.`);

if (fehler.length) {
  console.error("Werks-Stand NICHT geschrieben — Sicherheitsregel verletzt:");
  for (const f of fehler) console.error("  " + f);
  process.exit(1);
}

/* ------------------------------------------------------------------ Ausgabe */

const raus = JSON.stringify(neu, null, 2) + "\n";
const vorher = JSON.stringify(alt, null, 2) + "\n";

if (raus === vorher) {
  console.log("Werks-Stand ist schon auf dem Stand der Website.");
  process.exit(0);
}

// Was sich aendert, zaehlbar melden — nicht die ganze Datei ausschuetten.
const pfade = [];
(function vergleich(a, b, p) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const oa = a && typeof a === "object" && !Array.isArray(a);
  const ob = b && typeof b === "object" && !Array.isArray(b);
  if (oa && ob) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      vergleich(a[k], b[k], p ? `${p}.${k}` : k);
    return;
  }
  pfade.push(p);
})(alt, neu, "");

console.log(`${pfade.length} Stelle(n) weichen ab.`);
for (const s of getan) console.log("  Ausnahme: " + s);
const gruppen = {};
for (const p of pfade) {
  const k = p.replace(/^i18nHash\./, "i18n.").split(".").slice(0, 2).join(".");
  gruppen[k] = (gruppen[k] || 0) + 1;
}
for (const [k, v] of Object.entries(gruppen).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(v).padStart(3)}  ${k}`);

if (NUR_PRUEFEN) {
  console.log("\nNur geprueft — nichts geschrieben.");
  process.exit(1);
}
await writeFile(ZIEL, raus);
console.log("\npublic/defaults/site.json geschrieben.");
