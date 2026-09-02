/**
 * Was beim Speichern eines Termins wirklich passiert.
 *
 * Anlass (02.09.2026): "Ich erfasse eine Show, publiziere — und im Frontend
 * steht sie nicht." Der Weg dorthin hat drei Stationen, und keine davon war
 * geprueft: die Verwaltung baut den Eintrag (content.js), pruneForRtdb macht
 * ihn datenbankfertig, und die Realtime Database legt ihn ab — mit ihren
 * eigenen Regeln: leere Zeichenketten und leere Objekte speichert sie NICHT.
 * Beim naechsten Laden muss trotzdem derselbe Termin dastehen.
 *
 * Geprueft wird gegen die echten Funktionen der Verwaltung, nicht gegen
 * Nachbauten. Das Verhalten der Datenbank ist nachgestellt (wieDatenbank).
 *
 * Aufruf:  node --test scripts/*.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { pruneForRtdb, getPath, setPath } from "../public/js/util.js";
import { normalize, istBuildHook } from "../public/js/store.js";
import { PATHS, ROOT } from "../public/js/config.js";

const HIER = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vorgabe = JSON.parse(await readFile(resolve(HIER, "public/defaults/site.json"), "utf8"));
const frisch = () => JSON.parse(JSON.stringify(vorgabe));

/* Genau der Eintrag, den "Termin hinzufuegen" anlegt (siehe renderShows in
   public/js/content.js) — danach fuellt der Kunde Datum und Namen aus. */
const NEUER_TERMIN = {
  date: "2026-10-24",
  name: "Testhalle Regressionsfest",
  venue: "",
  city: "Winterthur",
  country: "CH",
  ticketUrl: "",
  ticketLabel: "Tickets",
  status: "confirmed",
};

/**
 * Die Realtime Database nachgestellt: sie speichert kein null. Was
 * pruneForRtdb auf null setzt (leere Zeichenketten), kommt beim Lesen gar
 * nicht mehr zurueck; eine Liste mit Loechern wird zum Objekt mit
 * Zahlen-Schluesseln.
 */
function wieDatenbank(wert) {
  if (Array.isArray(wert)) {
    const eintraege = wert.map(wieDatenbank);
    const uebrig = eintraege.filter((v) => v !== null && v !== undefined);
    if (!uebrig.length) return null; // leere Liste: gibt es dort nicht
    if (uebrig.length === eintraege.length) return uebrig;
    // Loch in der Liste -> Objekt mit den Original-Positionen
    const raus = {};
    eintraege.forEach((v, i) => {
      if (v !== null && v !== undefined) raus[String(i)] = v;
    });
    return raus;
  }
  if (wert && typeof wert === "object") {
    const raus = {};
    for (const [k, v] of Object.entries(wert)) {
      const w = wieDatenbank(v);
      if (w !== null && w !== undefined) raus[k] = w;
    }
    return Object.keys(raus).length ? raus : null;
  }
  return wert === null || wert === undefined ? null : wert;
}

/** Speichern und wieder laden, so wie die Verwaltung es tut. */
const rundreise = (inhalt) => normalize(wieDatenbank(pruneForRtdb(JSON.parse(JSON.stringify(inhalt)))));

test("der Termin landet im richtigen Pfad und Schema", () => {
  assert.equal(ROOT, "samsparking");
  assert.equal(PATHS.content, "samsparking/content", "Der Website-Build liest genau diesen Knoten");

  const inhalt = frisch();
  setPath(inhalt, "sections.shows.items", [{ ...NEUER_TERMIN }]);
  const zurueck = rundreise(inhalt);
  const items = getPath(zurueck, "sections.shows.items");

  assert.ok(Array.isArray(items), "sections.shows.items ist keine Liste");
  assert.equal(items.length, 1);
  assert.equal(items[0].name, NEUER_TERMIN.name);
  assert.equal(items[0].date, NEUER_TERMIN.date, "Das Datum muss JJJJ-MM-TT bleiben");
  assert.match(items[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(items[0].city, "Winterthur");
  assert.equal(items[0].status, "confirmed");
  /* Leer gelassene Felder bleiben INNERHALB einer Liste als "" stehen — und
     das ist kein Schoenheitsfehler, sondern die Regel, an der die Liste
     haengt (pruneForRtdb, Kennzeichen `imArray`). Wuerden sie wie sonst zu
     null, koennte ein Eintrag, bei dem nur leere Felder ausgefuellt sind, in
     der Datenbank ganz wegfallen — und aus der Liste wuerde ein Objekt mit
     Loechern. */
  assert.equal(items[0].venue, "", "leere Felder muessen in der Liste stehen bleiben");
  assert.equal(items[0].ticketUrl, "");
});

test("ein neuer Termin geht neben bestehenden nicht verloren", () => {
  const inhalt = frisch();
  setPath(inhalt, "sections.shows.items", [
    { date: "2026-09-05", name: "Erste", city: "Chur", country: "CH", status: "confirmed" },
    { date: "2026-09-19", name: "Zweite", city: "Bern", country: "CH", status: "booked" },
    { ...NEUER_TERMIN },
  ]);
  const items = getPath(rundreise(inhalt), "sections.shows.items");
  assert.equal(items.length, 3, "Es sind nicht mehr drei Termine");
  assert.deepEqual(
    items.map((i) => i.name),
    ["Erste", "Zweite", NEUER_TERMIN.name],
    "Die Reihenfolge aus der Verwaltung muss erhalten bleiben"
  );
});

test("eine Liste mit Loch kommt als vollstaendige Liste zurueck", () => {
  /* Die Datenbank speichert eine Liste mit Luecke als Objekt {"0":…,"2":…}.
     Wer den mittleren Termin loescht und speichert, bekommt genau das. Beim
     Laden muessen wieder alle Termine dastehen — und keine Luecke, an der die
     Verwaltung oder der Generator strauchelt. */
  const inhalt = frisch();
  setPath(inhalt, "sections.shows.items", [
    { date: "2026-09-05", name: "Erste", country: "CH", status: "confirmed" },
    {}, // geleerter Eintrag: faellt in der Datenbank weg
    { ...NEUER_TERMIN },
  ]);
  const items = getPath(rundreise(inhalt), "sections.shows.items");
  assert.ok(Array.isArray(items), "Aus dem Objekt mit Zahlen-Schluesseln wurde keine Liste");
  assert.deepEqual(items.map((i) => i.name), ["Erste", NEUER_TERMIN.name]);
});

test("keine Termine bleiben keine Termine — nicht undefined", () => {
  /* Leere Listen speichert die Datenbank nicht. Beim Laden muss trotzdem eine
     (leere) Liste dastehen, sonst faellt die Verwaltung beim Anlegen des
     ersten Termins auf die Nase. */
  const inhalt = frisch();
  setPath(inhalt, "sections.shows.items", []);
  const items = getPath(rundreise(inhalt), "sections.shows.items");
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 0);
});

test("Publizieren erkennt einen brauchbaren Build-Hook", () => {
  /* Der Hook-Aufruf geht per no-cors hinaus, seine Antwort ist nicht lesbar —
     was vorher pruefbar ist, muss darum hier geprueft werden. Sonst meldet die
     Verwaltung "Publiziert" und Netlify hat nie davon gehoert. */
  assert.equal(istBuildHook("https://api.netlify.com/build_hooks/abc123DEF"), true);
  assert.equal(istBuildHook("  https://api.netlify.com/build_hooks/abc123  "), true);
  assert.equal(istBuildHook(""), false);
  assert.equal(istBuildHook(undefined), false);
  assert.equal(istBuildHook("https://api.netlify.com/build_hooks/"), false, "ohne Kennung");
  assert.equal(istBuildHook("http://api.netlify.com/build_hooks/abc"), false, "nur https");
  assert.equal(istBuildHook("https://example.com/build_hooks/abc"), false, "fremde Adresse");
  assert.equal(istBuildHook("https://app.netlify.com/sites/x/settings"), false, "keine Hook-Adresse");
});

test("die einmalige Text-Umstellung gilt als erledigt", () => {
  /* Der Generator holte bis zum 02.09.2026 bei JEDEM Build Texte,
     Uebersetzungen und die Seitenaufteilung aus seiner eingecheckten Vorlage
     zurueck (adoptTexts) — jede Textaenderung in der Verwaltung war damit nach
     dem naechsten Build wieder weg. Die Umstellung ist einmalig und vorbei;
     die Marke dafuer gehoert in den Standard-Inhalt, sonst faengt eine frisch
     aufgesetzte Datenbank wieder von vorne an. */
  assert.equal(vorgabe.migrationen?.texteAusVorlage, true);
});
