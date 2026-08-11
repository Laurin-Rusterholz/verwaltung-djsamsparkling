#!/usr/bin/env node
/**
 * Upload-Grenzen — geprüft in der Grössenordnung, um die es wirklich geht.
 *
 * ANLASS (Sichtbefund 10.08.2026): beim Hochladen eines 44,3-MB-Videos erschien
 * eine rote Meldung, die wie eine Abweisung aussah („kürzer schneiden oder
 * stärker komprimieren"). Der Upload lief dabei weiter — die Meldung log also
 * über das, was passierte.
 *
 * Festgehalten wird hier zweierlei:
 *   1. Was WIRKLICH abgewiesen wird, entscheidet die Storage-Regel des Projekts
 *      (firebase/storage.rules). Der Client nimmt diese Grenze nur vorweg,
 *      damit ein zu grosser Upload nicht erst nach Minuten am Server scheitert.
 *      Beide Zahlen müssen übereinstimmen.
 *   2. Ein Video in der Grössenordnung des gemeldeten Falls (44,3 MB) läuft
 *      durch — es gibt dafür höchstens einen Hinweis, keine Sperre.
 *
 *   node scripts/upload-grenzen.test.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_UPLOAD_BYTES, VIDEO_WARN_BYTES, ACCEPTED_TYPES } from "../public/js/config.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const MB = 1024 * 1024;

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

/* Genau der Fall aus dem Sichtbefund. */
const DER_FALL = { name: "aftermovie.mp4", size: Math.round(44.3 * MB), type: "video/mp4" };

/** Dieselbe Entscheidung wie in media.js/uploadOne — nur die Grenzen. */
const entscheiden = (datei) => {
  const art = ACCEPTED_TYPES.image.test(datei.type)
    ? "image"
    : ACCEPTED_TYPES.video.test(datei.type)
    ? "video"
    : null;
  if (!art) return { abgewiesen: true, grund: "Dateityp" };
  if (datei.size > MAX_UPLOAD_BYTES) return { abgewiesen: true, grund: "Storage-Regel" };
  return { abgewiesen: false, hinweis: art === "video" && datei.size > VIDEO_WARN_BYTES };
};

console.log(`Der gemeldete Fall (${(DER_FALL.size / MB).toFixed(1)} MB Video):`);

pruefe("wird NICHT abgewiesen", () => {
  const e = entscheiden(DER_FALL);
  assert.equal(e.abgewiesen, false, "abgewiesen wegen: " + e.grund);
});

pruefe("bekommt nur einen Hinweis, keine Sperre", () => {
  assert.equal(entscheiden(DER_FALL).hinweis, true);
});

pruefe("der Hinweistext spricht nur von Dauer, nicht von Komprimieren", async () => {
  const media = await readFile(resolve(HIER, "../public/js/media.js"), "utf8");
  const zeile = media.match(/toast\(`\$\{file\.name\} ist \$\{bytes\(file\.size\)\}[^`]*`\)/);
  assert.ok(zeile, "Hinweis nicht gefunden");
  assert.ok(/länger dauern/.test(zeile[0]), "Hinweis nennt die Dauer nicht: " + zeile[0]);
  for (const wort of ["komprimier", "kürzer", "schneiden"])
    assert.ok(!new RegExp(wort, "i").test(zeile[0]), `Hinweis fordert weiter "${wort}"`);
  // Und er darf nicht als Fehler ausgegeben werden.
  assert.ok(!/`,\s*"err"\)/.test(zeile[0]), "Hinweis wird als Fehler ausgegeben");
});

console.log("\nDie einzige echte Grenze — die Storage-Regel des Projekts:");

pruefe("Client-Grenze und Storage-Regel sagen dasselbe", async () => {
  const rules = await readFile(resolve(HIER, "../firebase/storage.rules"), "utf8");
  const m = rules.match(/request\.resource\.size\s*<\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(m, "keine Grössen-Regel in firebase/storage.rules gefunden");
  const serverMB = Number(m[1]);
  assert.equal(
    MAX_UPLOAD_BYTES,
    serverMB * MB,
    `Client nimmt ${MAX_UPLOAD_BYTES / MB} MB an, der Server ${serverMB} MB`
  );
});

pruefe("knapp unter der Grenze geht durch", () => {
  assert.equal(entscheiden({ name: "x.mp4", size: MAX_UPLOAD_BYTES - 1, type: "video/mp4" }).abgewiesen, false);
});

pruefe("darüber wird abgewiesen — mit der Storage-Regel als Grund", () => {
  const e = entscheiden({ name: "x.mp4", size: MAX_UPLOAD_BYTES + 1, type: "video/mp4" });
  assert.equal(e.abgewiesen, true);
  assert.equal(e.grund, "Storage-Regel");
});

console.log("\nWiederholen nach einem echten Fehler:");

pruefe("media.js bietet Wiederholen und Verwerfen an", async () => {
  const media = await readFile(resolve(HIER, "../public/js/media.js"), "utf8");
  assert.ok(/export function uploadWiederholen/.test(media), "uploadWiederholen fehlt");
  assert.ok(/export function uploadVerwerfen/.test(media), "uploadVerwerfen fehlt");
  // Der Eintrag darf nach einem Fehler nicht verschwinden — sonst gibt es
  // nichts mehr zu wiederholen.
  assert.ok(/u\.error =/.test(media), "der Fehler wird nicht am Eintrag festgehalten");
  assert.ok(/u\.file = file/.test(media), "die Datei wird nicht fuer den zweiten Versuch behalten");
});

pruefe("Fortschritt wird in Prozent geführt", async () => {
  const media = await readFile(resolve(HIER, "../public/js/media.js"), "utf8");
  assert.ok(/bytesTransferred \/ snap\.totalBytes/.test(media), "kein echter Fortschritt");
});

console.log(
  fehler
    ? `\n${fehler} Fehler.`
    : `\nUpload: ${(DER_FALL.size / MB).toFixed(1)} MB gehen durch (nur Hinweis auf die Dauer);\n` +
        `abgewiesen wird erst über ${MAX_UPLOAD_BYTES / MB} MB — dieselbe Zahl wie in der\n` +
        "Storage-Regel. Fortschritt in Prozent, nach echtem Fehler Wiederholen."
);
process.exit(fehler ? 1 : 0);
