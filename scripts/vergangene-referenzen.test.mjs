/*
 * Entfernen muss Entfernen bleiben — und Abwählen muss möglich sein.
 *
 * WUNSCH AUS DEM VIDEO (25.08.2026, Sek. 29–50): Sämi möchte, dass vergangene
 * Auftritte automatisch bei den Referenzen landen. Seit dem 17.09.2026 tut die
 * Website das: sie hängt sie hinten an die gepflegte Liste an (s-mi,
 * `vergangeneAlsReferenz`).
 *
 * Daraus folgen zwei Dinge für die Verwaltung, und beide stehen hier:
 *
 *   1. ES BRAUCHT EINEN AUSSCHALTER. Ein automatischer Eintrag steht in keiner
 *      Liste — man kann ihn nicht entfernen, nur abwählen. Deshalb das Häkchen
 *      „Nicht automatisch als Referenz zeigen" am Termin.
 *
 *   2. LÖSCHEN MUSS WIRKEN. Wer eine Referenz von Hand löscht, die zugleich
 *      ein vergangener Termin ist, hätte sie beim nächsten Bau wieder dastehen
 *      — als automatische. Deshalb setzt das Löschen das Häkchen an den
 *      passenden Terminen. Verglichen wird über Name UND Ort.
 *
 * Geprüft wird an den echten Funktionen: `terminePassendZu` und der
 * `onRemove`-Weg werden aus content.js geschnitten und ausgeführt, und für
 * `objectList` wird nachgesehen, dass es `onRemove` überhaupt ruft.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lies = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");

let checks = 0;
const fehler = [];
const pruefe = (b, t) => { checks++; if (!b) fehler.push(t); };
const gleich = (a, b, t) => pruefe(a === b, `${t} (war: ${JSON.stringify(a)})`);

const CONTENT = lies("public/js/content.js");
const FIELDS = lies("public/js/fields.js");

/* ══ 1. Das Häkchen am Termin ═════════════════════════════════════════════ */
{
  /* `flagField`, NICHT `checkboxField` — beides hat am 17.09.2026 die
     Shows-Maske gekostet (siehe scripts/shows-maske.test.mjs):
     `checkboxField` nimmt den Hinweis als Zeichenkette und ist von Haus aus
     AN. Hier muss es von Haus aus AUS sein. */
  pruefe(/flagField\(\s*`\$\{base\}\.nichtAlsReferenz`/.test(CONTENT),
    "am Termin gibt es kein Häkchen „nicht automatisch als Referenz“");
  pruefe(!/checkboxField\(\s*`\$\{base\}\.nichtAlsReferenz`/.test(CONTENT),
    "das Häkchen hängt wieder an checkboxField — dann ist es voreingestellt AN");
  pruefe(/Nicht automatisch als Referenz zeigen/.test(CONTENT),
    "das Häkchen hat keine verständliche Aufschrift");
  /* Der Hinweis muss sagen, was passiert — und was NICHT passiert. Sonst
     traut sich niemand, es anzuhaken. */
  const i = CONTENT.indexOf("nichtAlsReferenz");
  const block = CONTENT.slice(i, i + 900);
  pruefe(/Der Termin selbst bleibt/.test(block),
    "der Hinweis sagt nicht, dass der Termin stehen bleibt");
}

/* ══ 2. `objectList` ruft beim Entfernen zurück ═══════════════════════════ */
{
  /* Es gibt zwei Entfernen-Knöpfe in der Datei: einen in `stringList` (Zeilen)
     und einen in `objectList` (Karten). Gemeint ist der zweite — nur dort gibt
     es einen Eintrag, zu dem etwas aufzuräumen wäre. */
  const i = FIELDS.indexOf('toolBtn("✕", "Entfernen", async () => {');
  pruefe(i > 0, "es gibt keinen Entfernen-Knopf in objectList mehr");
  const block = FIELDS.slice(i, i + 1400);
  pruefe(/const entfernt = items\[i\];/.test(block),
    "der entfernte Eintrag wird nicht festgehalten");
  pruefe(/opts\.onRemove === "function"/.test(block),
    "objectList meldet das Entfernen nicht zurück");
  pruefe(block.indexOf("items.splice(i, 1)") < block.indexOf("opts.onRemove"),
    "onRemove wird gerufen, bevor der Eintrag weg ist");
  /* Ein Fehler im Aufräumen darf das Löschen nie aufhalten. */
  pruefe(/catch \(e\) \{ \/\* nie den Löschvorgang aufhalten \*\/ \}/.test(block),
    "ein Fehler in onRemove kann das Entfernen verhindern");
}

/* ══ 3. terminePassendZu — die echte Funktion, ausgeführt ═════════════════ */
{
  const i = CONTENT.indexOf("function terminePassendZu(");
  pruefe(i > 0, "terminePassendZu ist nicht zu finden");
  let tiefe = 0, ende = CONTENT.indexOf("{", i);
  for (let k = ende; k < CONTENT.length; k++) {
    if (CONTENT[k] === "{") tiefe++;
    else if (CONTENT[k] === "}") { tiefe--; if (!tiefe) { ende = k + 1; break; } }
  }
  const quelle = CONTENT.slice(i, ende);

  const bauen = (termine) =>
    new Function("S", quelle + "; return terminePassendZu;")({ content: { sections: { shows: { items: termine } } } });

  const termine = [
    { name: "Nox Club", city: "Chur", date: "2026-09-05" },
    { name: "  nox club ", city: "CHUR", date: "2026-01-01" },   // andere Schreibweise
    { name: "Nox Club", city: "Wattwil", date: "2026-02-02" },   // anderer Ort
    { name: "Kugl", city: "St. Gallen", date: "2026-03-03" },
  ];
  const fn = bauen(termine);

  const treffer = fn({ name: "Nox Club", city: "Chur" });
  gleich(treffer.length, 2, "Schreibweise oder Gross/Klein trennen denselben Auftritt");
  pruefe(treffer.every((t) => t.city.trim().toLowerCase() === "chur"),
    "ein Auftritt an einem anderen Ort wurde mitgenommen");

  gleich(fn({ name: "Nox Club", city: "Wattwil" }).length, 1,
    "der Auftritt am anderen Ort wird nicht gefunden");
  gleich(fn({ name: "Gibt es nicht", city: "Nirgends" }).length, 0,
    "es werden Treffer gemeldet, die es nicht gibt");

  /* Eine leere Referenz darf NICHT alles treffen — sonst schaltete ein
     versehentlich angelegter Leereintrag beim Löschen alle Termine ab. */
  gleich(fn({ name: "", city: "" }).length, 0, "eine leere Referenz trifft Termine");
  gleich(fn(undefined).length, 0, "ohne Referenz werden Treffer gemeldet");

  // Ohne Termine passiert nichts, und es kracht auch nicht.
  gleich(bauen(undefined)({ name: "Nox Club", city: "Chur" }).length, 0,
    "ohne Terminliste wird etwas gefunden");
}

/* ══ 4. Löschen einer Referenz wählt die passenden Termine ab ═════════════ */
{
  const i = CONTENT.indexOf("onRemove: (entfernt) => {");
  pruefe(i > 0, "die Referenzliste räumt beim Entfernen nicht auf");
  let tiefe = 0, ende = CONTENT.indexOf("{", i);
  for (let k = ende; k < CONTENT.length; k++) {
    if (CONTENT[k] === "{") tiefe++;
    else if (CONTENT[k] === "}") { tiefe--; if (!tiefe) { ende = k + 1; break; } }
  }
  const quelle = CONTENT.slice(i + "onRemove: ".length, ende);

  const termine = [
    { name: "Nox Club", city: "Chur", date: "2026-09-05" },
    { name: "Nox Club", city: "Chur", date: "2026-01-01" },
    { name: "Kugl", city: "St. Gallen", date: "2026-03-03" },
  ];
  const gemeldet = [];
  const fn = new Function("terminePassendZu", "toast",
    `return (${quelle});`)(
      (ref) => termine.filter((t) =>
        String(t.name).trim().toLowerCase() === String(ref?.name || "").trim().toLowerCase() &&
        String(t.city).trim().toLowerCase() === String(ref?.city || "").trim().toLowerCase()),
      (text, art) => gemeldet.push([text, art])
    );

  fn({ name: "Nox Club", city: "Chur" });

  gleich(termine[0].nichtAlsReferenz, true, "der passende Termin wurde nicht abgewählt");
  gleich(termine[1].nichtAlsReferenz, true, "der zweite passende Termin wurde nicht abgewählt");
  gleich(termine[2].nichtAlsReferenz, undefined, "ein fremder Termin wurde abgewählt");

  /* Und die Daten sonst: kein Datum angefasst, nichts entfernt. */
  gleich(termine.length, 3, "ein Termin wurde entfernt");
  gleich(termine[0].date, "2026-09-05", "ein Termin wurde umdatiert");

  /* Der Mensch erfährt davon — sonst wundert er sich später, warum ein Termin
     abgewählt ist, den er nie angefasst hat. */
  gleich(gemeldet.length, 1, "das Abwählen wird nicht gemeldet");
  pruefe(/2 passende Termine/.test(gemeldet[0][0]), "die Meldung nennt die Zahl nicht");
  pruefe(/Termine selbst bleiben stehen/.test(gemeldet[0][0]),
    "die Meldung sagt nicht, dass die Termine bleiben");
  gleich(gemeldet[0][1], "ok", "die Meldung kommt als Fehler statt als Hinweis");

  // Ohne Treffer wird auch nichts gemeldet.
  gemeldet.length = 0;
  fn({ name: "Gibt es nicht", city: "Nirgends" });
  gleich(gemeldet.length, 0, "es wird gemeldet, obwohl nichts abzuwählen war");
}

/* ══ 5. Was hier NICHT passiert ═══════════════════════════════════════════ */
{
  const i = CONTENT.indexOf("onRemove: (entfernt) => {");
  const block = CONTENT.slice(i, i + 1600);
  for (const w of ["splice", "sort(", "delete "]) {
    pruefe(!block.includes(w), `beim Entfernen einer Referenz wird „${w}“ auf den Terminen benutzt`);
  }
  pruefe(!/\.date\s*=/.test(block), "beim Entfernen einer Referenz wird ein Datum geschrieben");
}

console.log((fehler.length ? "✗ " : "✓ ") + `vergangene Referenzen: ${checks} Prüfungen, ${fehler.length} fehlgeschlagen`);
if (fehler.length) { fehler.forEach((f) => console.log("   ✗ " + f)); process.exit(1); }
