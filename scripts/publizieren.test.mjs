/**
 * Publizieren: speichern, Schnappschuss, Build anstossen — in dieser Reihenfolge.
 *
 * ANLASS (13.09.2026): „Direktes Publizieren aus der Verwaltung ist kaputt —
 * es speichert nur." Nachgesehen: der Weg selbst ist in Ordnung, es fehlte der
 * Build-Hook in den Einstellungen (`config.buildHook`). Damit das nachweisbar
 * bleibt und nicht beim naechsten Umbau verrutscht, steht die Zusage hier als
 * Pruefung:
 *
 *   1. Gespeichert wird ZUERST. Ein Build ohne gespeicherten Stand baut den
 *      alten Inhalt — schlimmer als gar kein Build.
 *   2. Ohne Hook wird nichts behauptet: publish() meldet built:false samt Grund,
 *      und die Oberflaeche sagt, was zu tun ist.
 *   3. Eine vertippte oder fremde Adresse faellt VOR dem Abschicken auf. Der
 *      Aufruf geht per no-cors hinaus, seine Antwort ist nicht lesbar — danach
 *      merkt es niemand mehr.
 *   4. Der Hook steht in `config`, nicht im Website-Inhalt: er ist kein
 *      Geheimnis im engeren Sinn, aber wer ihn kennt, kann Builds ausloesen.
 *      `content` ist oeffentlich lesbar, `config` nicht.
 *   5. Gemerkt wird erst, was wirklich in der Datenbank steht.
 *
 * Aufruf:  node --test scripts/publizieren.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { istBuildHook } from "../public/js/store.js";
import { PATHS } from "../public/js/config.js";

const HIER = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFile(resolve(HIER, rel), "utf8");

/* Der Quelltext selbst ist hier der Pruefgegenstand: `publish()` haengt an
   Firebase und laesst sich ohne Browser nicht ausfuehren. Geprueft wird
   deshalb, was im Code steht — an genau den Stellen, an denen ein Umbau die
   Zusagen oben brechen wuerde. */
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("eine echte Netlify-Adresse wird erkannt", () => {
  assert.ok(istBuildHook("https://api.netlify.com/build_hooks/abc123DEF456"));
  assert.ok(istBuildHook("  https://api.netlify.com/build_hooks/abc123DEF456  "), "Leerzeichen stoeren");
  assert.ok(istBuildHook("https://api.netlify.com/build_hooks/abc-123_DEF?trigger_branch=main"));
});

test("alles andere wird abgelehnt — bevor es abgeschickt wird", () => {
  for (const falsch of [
    "",
    "   ",
    undefined,
    null,
    "http://api.netlify.com/build_hooks/abc123",           // ohne TLS
    "https://api.netlifyy.com/build_hooks/abc123",         // vertippt
    "https://api.netlify.com/build_hook/abc123",           // falscher Pfad
    "https://api.netlify.com/build_hooks/",                // ohne Kennung
    "https://example.invalid/build_hooks/abc123",          // fremder Host
    "https://api.netlify.com.evil.invalid/build_hooks/x",  // untergeschobener Host
    "api.netlify.com/build_hooks/abc123",                  // ohne Schema
  ]) {
    assert.equal(istBuildHook(falsch), false, `durchgelassen: ${String(falsch)}`);
  }
});

test("publish(): erst speichern, dann Schnappschuss, dann Build", async () => {
  const q = ohneKommentare(await lies("public/js/store.js"));
  const start = q.indexOf("export async function publish()");
  assert.ok(start > 0, "publish() gibt es nicht mehr");
  const block = q.slice(start, q.indexOf("\n}", start));

  const speichern = block.indexOf("await saveContent()");
  const schnappschuss = block.indexOf("PATHS.versions");
  const pruefen = block.indexOf("istBuildHook(");
  const abschicken = block.indexOf("fetch(hook");

  assert.ok(speichern >= 0, "publish() speichert den Stand nicht mehr");
  assert.ok(abschicken > speichern, "der Build wird angestossen, BEVOR gespeichert ist");
  assert.ok(schnappschuss > speichern, "der Schnappschuss entsteht vor dem Speichern");
  assert.ok(pruefen > 0 && pruefen < abschicken, "die Adresse wird nicht geprueft, bevor sie gerufen wird");
});

test("publish(): ohne Hook wird kein Build behauptet", async () => {
  const q = ohneKommentare(await lies("public/js/store.js"));
  const start = q.indexOf("export async function publish()");
  const block = q.slice(start, q.indexOf("\n}", start));
  assert.match(block, /built:\s*false,\s*reason:\s*"kein Build-Hook hinterlegt"/,
    "der Fall „kein Hook“ meldet keinen Grund");
  assert.match(block, /lastPublishHook:\s*false/, "der Fehlschlag wird nicht vermerkt");
  assert.match(block, /mode:\s*"no-cors"/, "der Hook wird nicht mehr per no-cors gerufen");
  // Und die Oberflaeche sagt, was zu tun ist.
  const app = await lies("public/js/app.js");
  assert.match(app, /kein Build-Hook hinterlegt|es ist kein Build-Hook hinterlegt/,
    "die Oberflaeche erklaert den Fall nicht");
  assert.match(app, /Build-Hook unter Einstellungen eintragen/, "die Oberflaeche nennt den Weg nicht");
});

test("die Einstellungen pruefen die Adresse beim Eintragen", async () => {
  const app = ohneKommentare(await lies("public/js/app.js"));
  assert.match(app, /istBuildHook\(hook\)/, "beim Speichern wird die Adresse nicht geprueft");
  const stelle = app.indexOf("istBuildHook(hook)");
  const speichern = app.indexOf("saveConfig({", stelle);
  assert.ok(speichern > stelle, "geprueft wird erst nach dem Speichern");
});

test("der Build-Hook liegt nicht im Website-Inhalt", async () => {
  assert.notEqual(PATHS.config, PATHS.content, "Hook und Website-Inhalt liegen am selben Ort");
  assert.ok(!PATHS.config.startsWith(PATHS.content + "/"), "der Hook liegt UNTER dem Website-Inhalt");

  /* Der Website-Build liest `content` ohne Anmeldung. Stuende der Hook dort,
     koennte jede/r Builds ausloesen. */
  const regeln = JSON.parse(await lies("firebase/database.rules.json"));
  const knoten = regeln.rules.samsparking;
  assert.equal(knoten.content[".read"], true, "der Website-Inhalt ist nicht mehr oeffentlich lesbar");
  assert.notEqual(knoten.config[".read"], true, "die Einstellungen sind oeffentlich lesbar geworden");
  assert.match(String(knoten.config[".read"]), /session/, "der Lesezugriff auf die Einstellungen haengt nicht an der Sitzung");

  /* Und er steht in keinem ausgelieferten Inhalt. */
  for (const datei of ["public/defaults/site.json", "public/index.html"]) {
    assert.ok(!/build_hooks/.test(await lies(datei)), `${datei} enthaelt eine Build-Hook-Adresse`);
  }
});

test("gemerkt wird erst, was wirklich gespeichert ist", async () => {
  const q = ohneKommentare(await lies("public/js/store.js"));
  const start = q.indexOf("export async function saveConfig(");
  assert.ok(start > 0, "saveConfig() gibt es nicht mehr");
  const block = q.slice(start, q.indexOf("\n}", start));
  const schreiben = block.indexOf("update(pruneForRtdb(patch))");
  const merken = block.lastIndexOf("Object.assign(S.config, patch)");
  assert.ok(schreiben >= 0 && merken >= 0, "saveConfig schreibt oder merkt nicht mehr");
  assert.ok(
    merken > schreiben,
    "der Zustand im Browser uebernimmt den Wert, BEVOR die Datenbank ihn hat — " +
      "bei einem Fehlschlag stuende dann ein Hook in der Pruefliste, den es nicht gibt"
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   „Publiziert" war eine Behauptung — jetzt wird nachgesehen

   Der Build-Hook geht per no-cors hinaus; seine Antwort ist im Browser nicht
   lesbar. Angestossen heisst nicht gebaut, und gebaut heisst nicht MIT DIESEM
   Inhalt. Die Website legt seit 15.09.2026 /stand.json ab (Zeitstempel des
   Inhalts, aus dem gebaut wurde); pruefeLive() liest sie und vergleicht.
   ══════════════════════════════════════════════════════════════════════════ */
test("pruefeLive bestaetigt erst, wenn der eigene Stand oben ist", async () => {
  const { pruefeLive, S } = await import("../public/js/store.js");
  const echt = globalThis.fetch;
  S.config = { siteUrl: "https://beispiel.invalid" };
  try {
    let n = 0;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ inhaltVon: ++n >= 3 ? "2026-09-15T08:30:00.000Z" : "2026-09-14T10:00:00.000Z" }),
    });
    const r = await pruefeLive("2026-09-15T08:30:00.000Z", { versuche: 5, abstandMs: 0, warten: async () => {} });
    assert.equal(r.ok, true, "der eigene Stand wurde nicht als live erkannt");
    assert.equal(n, 3, "es wurde nicht geduldig nachgesehen");
  } finally {
    globalThis.fetch = echt;
  }
});

test("kommt der Stand nicht, wird nichts behauptet", async () => {
  const { pruefeLive, S } = await import("../public/js/store.js");
  const echt = globalThis.fetch;
  S.config = { siteUrl: "https://beispiel.invalid" };
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ inhaltVon: "2026-09-14T10:00:00.000Z" }) });
    const r = await pruefeLive("2026-09-15T08:30:00.000Z", { versuche: 2, abstandMs: 0, warten: async () => {} });
    assert.equal(r.ok, false);
    assert.equal(r.grund, "noch-nicht", "der offene Ausgang wird nicht als solcher benannt");

    // Netzfehler heisst „unbekannt", nicht „falsch".
    globalThis.fetch = async () => { throw new Error("Netz weg"); };
    const r2 = await pruefeLive("2026-09-15T08:30:00.000Z", { versuche: 2, abstandMs: 0, warten: async () => {} });
    assert.equal(r2.ok, false);
    assert.equal(r2.grund, "noch-nicht");

    // Eine Website ohne Stand-Datei: ehrlich sagen, dass sich nichts pruefen laesst.
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const r3 = await pruefeLive("2026-09-15T08:30:00.000Z", { versuche: 3, abstandMs: 0, warten: async () => {} });
    assert.equal(r3.grund, "keine-standdatei", "eine fehlende Stand-Datei wird nicht benannt");
  } finally {
    globalThis.fetch = echt;
  }
});

test("die Oberflaeche behauptet kein „live“, bevor sie nachgesehen hat", async () => {
  const app = ohneKommentare(await lies("public/js/app.js"));
  assert.match(app, /Build angestossen/, "die Meldung verspricht weiterhin mehr, als der Aufruf weiss");
  assert.ok(!/toast\("Publiziert —/.test(app), "es steht weiterhin „Publiziert“ da, ohne Nachweis");
  assert.match(app, /pruefeLive\(/, "es wird gar nicht nachgesehen");
  assert.match(app, /Live bestätigt/, "der bestaetigte Fall wird nicht benannt");
  assert.match(app, /noch nicht oben/, "der unbestaetigte Fall wird nicht benannt");
});
