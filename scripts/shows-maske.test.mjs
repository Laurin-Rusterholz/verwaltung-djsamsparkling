#!/usr/bin/env node
/**
 * Die Masken werden WIRKLICH gezeichnet — nicht nach Textmustern durchsucht.
 *
 * ANLASS (17.09.2026, unmittelbar nach dem Merge von PR #33): die Shows-Maske
 * blieb nach einem harten Neuladen leer. In der Browser-Konsole stand:
 *
 *     Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.
 *
 * Die Stelle: `checkboxField(pfad, aufschrift, hinweis)` nimmt den Hinweis als
 * ZEICHENKETTE, bekam aber ein Objekt `{ hint: … }`. `el()` reicht Objekte
 * ungeprueft an `appendChild` weiter — der Browser bricht ab, und die ganze
 * Ansicht faellt aus. Ein Termin liess sich nicht mehr bearbeiten.
 *
 * Warum kein Test das gesehen hat: die bisherigen Pruefungen lesen den
 * Quelltext. Dort stand nichts Auffaelliges — der Aufruf sah aus wie jeder
 * andere. Sichtbar wird so etwas erst beim Zeichnen.
 *
 * Deshalb hier: ein kleines, strenges DOM (scripts/mini-dom.mjs), und dann
 * werden alle Ansichten aufgerufen. Was der Browser abgelehnt haette, wird
 * auch hier abgelehnt.
 *
 *   node scripts/shows-maske.test.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Knoten, weltAufbauen } from "./mini-dom.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const JS = resolve(HIER, "../public/js") + "/";

/* Die Umgebung MUSS vor den Modulen stehen — daher `await import`. */
weltAufbauen();

const { S } = await import(JS + "store.js");
const { el } = await import(JS + "util.js");
const { checkboxField, flagField } = await import(JS + "fields.js");
const content = await import(JS + "content.js");

const WERKSSTAND = JSON.parse(await readFile(resolve(HIER, "../public/defaults/site.json"), "utf8"));

let fehler = 0;
const pruefe = (name, fn) => {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (e) {
    fehler++;
    console.error("  FEHL " + name + "\n       " + String(e.message).split("\n")[0]);
  }
};

/** Ein Inhalt zum Zeichnen: Werksstand plus die Termine, um die es geht. */
function standSetzen(termine) {
  S.content = JSON.parse(JSON.stringify(WERKSSTAND));
  S.defaults = JSON.parse(JSON.stringify(WERKSSTAND));
  if (termine) S.content.sections.shows.items = termine;
  return S.content;
}

/** Alle Ankreuzfelder eines gezeichneten Baums, mit ihrer Aufschrift. */
function haekchen(baum) {
  return baum
    .querySelectorAll("input")
    .filter((i) => i.attributes.type === "checkbox")
    .map((i) => ({ box: i, aufschrift: i.parentNode ? i.parentNode.textContent.trim() : "" }));
}

/* ══ 0. Zuerst: taugt das Pruefwerkzeug ueberhaupt etwas? ══════════════════
   Ein Test, der nichts ablehnt, beweist nichts. Also erst zeigen, dass dieses
   DOM den Fehler von heute wirklich meldet. */
pruefe("das Mini-DOM lehnt ab, was auch der Browser ablehnt", () => {
  let gemeldet = "";
  try {
    el("p", {}, [{ hint: "ich bin kein Knoten" }]);
  } catch (e) {
    gemeldet = String(e.message);
  }
  assert.match(gemeldet, /appendChild.*not of type 'Node'/,
    "das Mini-DOM meldet etwas anderes als der Browser — dann beweist dieser Test nichts");

  // Und was ein Knoten ist, geht durch.
  assert.ok(el("p", {}, [el("span", {}, "gut")]) instanceof Knoten, "ein gueltiger Baum wird abgelehnt");
});

pruefe("GEGENPROBE: der Aufruf von gestern wirft — genau hier lag der Fehler", () => {
  standSetzen([{ date: "2026-08-01", name: "Lange her", city: "Luzern" }]);
  /* So stand es bis zum Merge von PR #33 in content.js: ein Objekt als
     dritter Parameter. Faellt das je wieder durch, faellt dieser Fall. */
  assert.throws(
    () => checkboxField("sections.shows.items.0.nichtAlsReferenz", "Nicht automatisch als Referenz zeigen",
      { hint: "ein Objekt, wo eine Zeichenkette hingehoert" }),
    /appendChild.*not of type 'Node'/,
    "ein Objekt als Hinweis geht durch — dann faellt der Fehler erst im Browser auf"
  );
  // Mit einer Zeichenkette ist derselbe Aufruf in Ordnung.
  assert.ok(checkboxField("sections.shows.items.0.nichtAlsReferenz", "Aufschrift", "ein Hinweis") instanceof Knoten);
});

/* ══ 1. Die Shows-Maske zeichnet ══════════════════════════════════════════ */
pruefe("die Shows-Maske zeichnet — mit Terminen", () => {
  standSetzen([
    { date: "2026-08-01", name: "Lange her", city: "Luzern", country: "CH", status: "confirmed" },
    { date: "2026-12-24", name: "Kommt noch", city: "Chur", country: "CH", status: "booked",
      nichtAlsReferenz: true },
  ]);
  const baum = content.renderShows();
  assert.ok(baum instanceof Knoten, "die Maske liefert gar keinen Knoten");
  assert.ok(baum.alleKnoten().length > 100, "die Maske ist verdaechtig leer");
  /* Beide Termine sind wirklich da — nicht nur der Rahmen. */
  const text = baum.textContent;
  assert.ok(text.includes("Lange her"), "der vergangene Termin fehlt in der Maske");
  assert.ok(text.includes("Kommt noch"), "der kommende Termin fehlt in der Maske");
});

pruefe("die Shows-Maske zeichnet auch OHNE Termine", () => {
  standSetzen([]);
  assert.ok(content.renderShows() instanceof Knoten, "die leere Shows-Maske faellt aus");
});

/* ══ 2. Das Haekchen ist AUS, solange nichts gespeichert ist ══════════════ */
pruefe("„Nicht automatisch als Referenz zeigen“ ist normal AUS", () => {
  standSetzen([
    { date: "2026-08-01", name: "Ohne Angabe", city: "Luzern" },           // nichts gespeichert
    { date: "2026-08-02", name: "Abgewaehlt", city: "Chur", nichtAlsReferenz: true },
    { date: "2026-08-03", name: "Ausdruecklich an", city: "Uzwil", nichtAlsReferenz: false },
  ]);
  const gefunden = haekchen(content.renderShows())
    .filter((h) => h.aufschrift.includes("Nicht automatisch als Referenz zeigen"));
  assert.equal(gefunden.length, 3, "nicht jeder Termin hat das Haekchen");

  /* DAS ist der zweite Teil des Befunds: `checkboxField` liest
     `read(path) !== false` — ein Termin ohne die Angabe waere damit
     ANGEHAKT, also von den Referenzen ausgeschlossen. Genau verkehrt herum.
     `flagField` liest `=== true`. */
  assert.equal(gefunden[0].box.checked, false,
    "ein Termin ohne die Angabe ist angehakt — er fiele bei den Referenzen aus");
  assert.equal(gefunden[1].box.checked, true, "ein abgewaehlter Termin ist nicht angehakt");
  assert.equal(gefunden[2].box.checked, false, "ein ausdruecklich erlaubter Termin ist angehakt");
});

pruefe("das Haekchen schreibt an die richtige Stelle — und nur dorthin", () => {
  const stand = standSetzen([
    { date: "2026-08-01", name: "Ohne Angabe", city: "Luzern" },
    { date: "2026-08-02", name: "Nachbar", city: "Chur" },
  ]);
  const gefunden = haekchen(content.renderShows())
    .filter((h) => h.aufschrift.includes("Nicht automatisch als Referenz zeigen"));

  gefunden[0].box.checked = true;
  gefunden[0].box.dispatchEvent({ type: "change", target: gefunden[0].box });
  assert.equal(stand.sections.shows.items[0].nichtAlsReferenz, true, "das Haekchen schreibt nichts");
  assert.equal(stand.sections.shows.items[1].nichtAlsReferenz, undefined, "es schreibt am Nachbarn mit");

  // Und wieder aus.
  gefunden[0].box.checked = false;
  gefunden[0].box.dispatchEvent({ type: "change", target: gefunden[0].box });
  assert.equal(stand.sections.shows.items[0].nichtAlsReferenz, false, "das Haekchen laesst sich nicht loesen");

  /* Nur Anzeige und dieses eine Feld: Datum, Name und Ort unangetastet. */
  assert.equal(stand.sections.shows.items[0].date, "2026-08-01", "ein Datum wurde angefasst");
  assert.equal(stand.sections.shows.items[0].name, "Ohne Angabe", "ein Name wurde angefasst");
  assert.equal(stand.sections.shows.items.length, 2, "ein Termin ist verschwunden");
});

/* ══ 3. Und alle uebrigen Masken gleich mit ═══════════════════════════════
   Derselbe Fehler kann jede Ansicht treffen. Einmal alles zeichnen kostet
   nichts und faengt die naechste Verwechslung, bevor sie jemand sieht. */
pruefe("alle Ansichten zeichnen", () => {
  /* MIT einem Termin: bei leerer Liste zeichnet `objectList` gar keine Felder
     — der Fehler von heute waere so unentdeckt geblieben. */
  standSetzen([{ date: "2026-08-01", name: "Lange her", city: "Luzern", country: "CH", status: "confirmed" }]);
  const ausgefallen = [];
  let gezeichnet = 0;
  for (const [name, fn] of Object.entries(content)) {
    if (!/^render/.test(name) || typeof fn !== "function") continue;
    gezeichnet++;
    try {
      assert.ok(fn() instanceof Knoten, "liefert keinen Knoten");
    } catch (e) {
      ausgefallen.push(`${name}: ${String(e.message).split("\n")[0]}`);
    }
  }
  assert.ok(gezeichnet >= 15, `es wurden nur ${gezeichnet} Ansichten gefunden — zeichnet der Test noch?`);
  assert.deepEqual(ausgefallen, [], "Ansichten fallen aus");
});

/* ══ 4. Wo dieselbe Verwechslung sonst noch lauert ════════════════════════
   `checkboxField` und `colorField` nehmen den Hinweis als Zeichenkette,
   `textField` und Verwandte dagegen ein Objekt `{ hint }`. Beides nebeneinander
   laedt zur Verwechslung ein — deshalb einmal quer durch alle Aufrufe. */
pruefe("kein Aufruf gibt ein Objekt, wo eine Zeichenkette hingehoert", () => {
  const quelle = readFileSync(resolve(JS, "content.js"), "utf8");
  const schlimm = [];
  for (const name of ["checkboxField", "colorField"]) {
    let i = quelle.indexOf(name + "(");
    while (i >= 0) {
      // Die Parameter dieses Aufrufs bis zur schliessenden Klammer einsammeln.
      let tiefe = 0, k = i + name.length, arg = 0, drittesZeichen = "";
      let inText = null;
      for (; k < quelle.length; k++) {
        const c = quelle[k];
        if (inText) { if (c === inText && quelle[k - 1] !== "\\") inText = null; continue; }
        if (c === '"' || c === "'" || c === "`") { inText = c; if (tiefe === 1 && arg === 2 && !drittesZeichen) drittesZeichen = c; continue; }
        if ("([{".includes(c)) { if (tiefe === 1 && arg === 2 && !drittesZeichen) drittesZeichen = c; tiefe++; continue; }
        if (")]}".includes(c)) { tiefe--; if (!tiefe) break; continue; }
        if (c === "," && tiefe === 1) { arg++; continue; }
        if (tiefe === 1 && arg === 2 && !drittesZeichen && !/\s/.test(c)) drittesZeichen = c;
      }
      if (drittesZeichen === "{") {
        schlimm.push(`${name} in Zeile ${quelle.slice(0, i).split("\n").length}`);
      }
      i = quelle.indexOf(name + "(", i + 1);
    }
  }
  assert.deepEqual(schlimm, [], "ein Hinweis wird als Objekt uebergeben — das wirft im Browser");
});

console.log(fehler ? `\n✗ ${fehler} Pruefung(en) fehlgeschlagen` : "\n✓ Shows-Maske: alle Pruefungen bestanden");
process.exit(fehler ? 1 : 0);
