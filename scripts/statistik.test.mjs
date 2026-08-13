#!/usr/bin/env node
/**
 * Prueft die Statistik — die Rechnung und die Zusagen.
 *
 * Zwei Sorten Pruefung stehen hier, und die zweite ist die wichtigere:
 *
 *   RECHNUNG  Tage, Summen und Anteile. Ein fehlender Tag ist eine Null und
 *             keine Luecke; die Reihe darf nicht verrutschen.
 *
 *   ZUSAGE    Die Ansicht sagt dem Kunden: nur Summen, keine IP, kein Cookie,
 *             keine Kennung. Das ist eine Aussage ueber die Daten — sie muss im
 *             Code auch stimmen. Der Test liest darum den Zaehl-Endpunkt und die
 *             Ansicht und verlangt, dass dort nichts Persoenliches auftaucht.
 *             Ohne diese Pruefung waere die Zusage nur ein Satz im Text.
 *
 *   node scripts/statistik.test.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  tagVon,
  tagMinus,
  reihe,
  summe,
  anteile,
  seit,
  kurz,
  zahl,
} from "../public/js/statistik-zahlen.js";

const HIER = dirname(fileURLToPath(import.meta.url));

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

console.log("Rechnung:");

/* Ein fester Zeitpunkt, damit der Test nicht am Kalender haengt: 12.08.2026,
   19:30 in der Schweiz (= 17:30 UTC). */
const JETZT = new Date("2026-08-12T17:30:00Z");

pruefe("der Tag wird in der Schweiz gerechnet", () => {
  assert.equal(tagVon(JETZT), "2026-08-12");
  /* 23:30 UTC ist in der Schweiz schon der naechste Tag (Sommerzeit +2). Genau
     hier ginge eine Rechnung in UTC daneben. */
  assert.equal(tagVon(new Date("2026-08-12T23:30:00Z")), "2026-08-13");
  // Und im Winter (+1) genauso.
  assert.equal(tagVon(new Date("2026-01-31T23:30:00Z")), "2026-02-01");
});

pruefe("tagMinus zaehlt Tage zurueck, auch ueber Monatsgrenzen", () => {
  assert.equal(tagMinus(0, JETZT), "2026-08-12");
  assert.equal(tagMinus(1, JETZT), "2026-08-11");
  assert.equal(tagMinus(13, JETZT), "2026-07-30");
  assert.equal(tagMinus(30, JETZT), "2026-07-13");
});

const TAGE = {
  "2026-08-06": { aufrufe: 5, besuche: 4 },
  "2026-08-10": { aufrufe: 12, besuche: 9 },
  "2026-08-12": { aufrufe: 3, besuche: 2 },
  "2026-07-20": { aufrufe: 100, besuche: 60 },
};

pruefe("die Reihe hat 14 Tage, aelteste zuerst, Luecken als Null", () => {
  const r = reihe(TAGE, 14, JETZT);
  assert.equal(r.length, 14);
  assert.equal(r[0].tag, "2026-07-30");
  assert.equal(r[13].tag, "2026-08-12");
  assert.equal(r[13].aufrufe, 3);
  // 11.08. hat keinen Eintrag — das muss eine Null sein, keine Luecke.
  const elfter = r.find((x) => x.tag === "2026-08-11");
  assert.equal(elfter.aufrufe, 0);
  assert.equal(elfter.besuche, 0);
  // Und die Reihenfolge ist wirklich chronologisch.
  assert.deepEqual([...r].map((x) => x.tag).sort(), r.map((x) => x.tag));
});

pruefe("Summen: 7 Tage, 30 Tage, Aufrufe und Besuche getrennt", () => {
  assert.equal(summe(TAGE, 7, "aufrufe", JETZT), 5 + 12 + 3);
  assert.equal(summe(TAGE, 7, "besuche", JETZT), 4 + 9 + 2);
  // Der 20.07. liegt 23 Tage zurueck: in 30 drin, in 7 nicht.
  assert.equal(summe(TAGE, 30, "aufrufe", JETZT), 5 + 12 + 3 + 100);
  assert.equal(summe(TAGE, 1, "aufrufe", JETZT), 3, "ein Tag heisst: nur heute");
  assert.equal(summe({}, 7, "aufrufe", JETZT), 0, "ohne Zahlen ist die Summe 0");
});

pruefe("Anteile: sortiert, ohne Nullen, Prozente aus der Summe", () => {
  const a = anteile({ start: { aufrufe: 30 }, shop: { aufrufe: 10 }, booking: { aufrufe: 0 } });
  assert.deepEqual(a.map((x) => x.key), ["start", "shop"], "Nullen fallen weg, absteigend");
  assert.equal(a[0].prozent, 75);
  assert.equal(a[1].prozent, 25);
  assert.deepEqual(anteile(null), [], "ohne Werte eine leere Liste");
  // Auch die kurze Form (nur eine Zahl statt {aufrufe:n}) wird verstanden.
  assert.equal(anteile({ de: 4, en: 4 }).length, 2);
});

pruefe("Kleinigkeiten: seit(), kurz(), zahl()", () => {
  assert.equal(seit(TAGE), "2026-07-20", "der erste Tag mit Zahlen");
  assert.equal(seit({}), "");
  assert.equal(kurz("2026-08-12"), "12.08.");
  assert.equal(kurz("krumm"), "krumm");
  assert.equal(zahl("7"), 7);
  assert.equal(zahl(undefined), 0);
  assert.equal(zahl("viele"), 0, "Unsinn zaehlt als 0, nicht als NaN");
});

console.log("\nZusagen an den Kunden:");

/* Der Zaehl-Endpunkt liegt im Website-Repo. Steht er nicht daneben, wird die
   Pruefung uebersprungen statt fehlzuschlagen — die Repos lassen sich einzeln
   auschecken. */
const ZAEHLER = resolve(HIER, "../../s-mi/netlify/functions/zaehler.mjs");
const SITEJS = resolve(HIER, "../../s-mi/assets/site.js");

if (!existsSync(ZAEHLER)) {
  console.log("  --   Website-Repo nicht daneben — Endpunkt nicht geprueft");
} else {
  const quelle = await readFile(ZAEHLER, "utf8");
  const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  pruefe("der Endpunkt legt nur Zaehler an", () => {
    assert.ok(code.includes('".sv"') && code.includes("increment"), "hochgezaehlt wird mit dem Server-Wert");
    for (const verboten of ["x-forwarded-for", "user-agent", "referer", "req.headers.get", "cookie"]) {
      assert.ok(
        !code.toLowerCase().includes(verboten),
        `der Endpunkt liest "${verboten}" — daraus wuerden Personendaten`
      );
    }
  });

  pruefe("nur die vier bekannten Angaben werden gelesen", () => {
    const felder = [...code.matchAll(/body\.([a-zA-Z]+)/g)].map((m) => m[1]);
    const erlaubt = new Set(["pfad", "sprache", "geraet", "neu"]);
    for (const f of new Set(felder))
      assert.ok(erlaubt.has(f), `der Endpunkt liest body.${f} — nicht vorgesehen`);
  });

  const seiteJs = readFileSync(SITEJS, "utf8");
  pruefe("die Seite meldet nichts Persoenliches", () => {
    const stelle = seiteJs.indexOf("/api/zaehler");
    const block = seiteJs.slice(Math.max(0, stelle - 2000), stelle + 500);
    for (const verboten of ["localStorage", "document.cookie", "navigator.userAgent", "referrer"]) {
      assert.ok(!block.includes(verboten), `die Seite schickt "${verboten}" mit`);
    }
    assert.ok(block.includes("doNotTrack"), '"Do Not Track" wird beachtet');
    assert.ok(block.includes("sessionStorage"), "der Besuch haengt an sessionStorage, nicht an einer Kennung");
  });
}

const AnsichtQuelle = await readFile(resolve(HIER, "../public/js/statistik.js"), "utf8");

pruefe("die Ansicht liest nur den Zaehl-Knoten", () => {
  const refs = [...AnsichtQuelle.matchAll(/db\.ref\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(refs, ["samsparking/stats"], "gelesen wird genau ein Zweig: " + refs.join(", "));
  assert.ok(!/db\.ref\([^)]*\)\.(set|update|push|remove)/.test(AnsichtQuelle), "die Ansicht schreibt nichts");
});

pruefe("die Ansicht sagt, was sie nicht weiss", () => {
  for (const satz of ["Do Not Track", "rückwirkend", "Summen"]) {
    assert.ok(AnsichtQuelle.includes(satz), `der Hinweis "${satz}" fehlt`);
  }
});

console.log(
  fehler
    ? `\n${fehler} Fehler.`
    : "\nStatistik: Tage in Europe/Zurich, Luecken als Null, Summen und Anteile stimmen;\n           der Zaehler legt nur Summen an und liest nichts Persoenliches."
);
process.exit(fehler ? 1 : 0);
