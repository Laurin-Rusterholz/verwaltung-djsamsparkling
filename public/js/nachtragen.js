/**
 * Einmalige Nachträge beim Laden.
 *
 * Warum es das gibt: der Website-Generator hat lange Lücken im gespeicherten
 * Stand von sich aus gefüllt — fehlende Kanäle angelegt, Texte gesetzt, einen
 * Artikel zurückgeholt. Das sah gut aus, war aber falsch: in der Datenbank
 * stand davon nichts, in der Verwaltung gab es also nichts zu bearbeiten, und
 * nach dem Publizieren kam Gelöschtes wieder. Die Regeln im Generator sind
 * weg; die Website zeigt jetzt genau, was gespeichert ist.
 *
 * Damit dabei nichts verloren geht, holt die Verwaltung das Fehlende einmalig
 * in den Inhalt — als normale, bearbeitbare Einträge. Der Stand gilt danach
 * als geändert; ein Hinweis bittet um einmal Speichern.
 *
 * EINMALIG heisst wirklich einmalig. Jeder Nachtrag setzt beim Speichern eine
 * Marke unter `migrationen`. Ist sie gesetzt, läuft er nie wieder — sonst
 * liesse sich das Nachgetragene nie löschen: es käme beim nächsten Laden
 * zurück, und genau das war der Fehler, den wir beheben.
 */

import { kanaeleNachtragen } from "./kanaele-nachtragen.js";

/** Vergleichbar machen: Gross/Klein, Leerzeichen und Bindestriche zählen nicht. */
const schluessel = (name, city) =>
  `${String(name ?? "").trim().toLowerCase()}|${String(city ?? "").trim().toLowerCase()}`
    .replace(/[\s–—-]+/g, " ")
    .replace(/\s+/g, " ");

const kopie = (v) => JSON.parse(JSON.stringify(v));

/**
 * Referenzen aus dem Werks-Stand ergänzen, die im gespeicherten Stand fehlen.
 *
 * Angehängt wird hinten, in der Reihenfolge des Werks-Stands. Bestehende
 * Einträge werden nicht angefasst — weder Schreibweise noch Reihenfolge noch
 * „Gross zeigen“. Nachgetragene sind nie automatisch gross.
 */
export function referenzenNachtragen(content, defaults) {
  const werk = defaults?.sections?.references?.items;
  if (!Array.isArray(werk) || !werk.length) return [];
  const ziel = content?.sections?.references;
  if (!ziel) return [];
  if (!Array.isArray(ziel.items)) ziel.items = [];

  const da = new Set(ziel.items.map((r) => schluessel(r?.name, r?.city)));
  const dazu = [];
  for (const r of werk) {
    const name = String(r?.name || "").trim();
    if (!name) continue;
    const key = schluessel(name, r?.city);
    if (da.has(key)) continue;
    const neu = kopie(r);
    // Nie automatisch gross — was hervorsticht, entscheidet der Kunde.
    delete neu.highlight;
    ziel.items.push(neu);
    da.add(key);
    dazu.push(r.city ? `${name} — ${r.city}` : name);
  }
  return dazu;
}

/**
 * Die veröffentlichte Ware zurückholen, falls die Liste leer ist.
 *
 * Ein früherer Eingriff im Generator hatte den Artikel „Beispiel“ allein wegen
 * seines Namens gelöscht; die Verwaltung schrieb den bereinigten Stand danach
 * in die Datenbank. Seither war der Shop leer. Einmalig — wer den Artikel
 * danach löscht, hat ihn gelöscht.
 */
export function wareNachtragen(content, defaults) {
  const werk = defaults?.sections?.shop?.items;
  if (!Array.isArray(werk) || !werk.length) return [];
  const shop = content?.sections?.shop;
  if (!shop) return [];
  if (!Array.isArray(shop.items)) shop.items = [];
  if (shop.items.length) return [];
  shop.items = kopie(werk);
  return shop.items.map((p) => String(p.name || "").trim()).filter(Boolean);
}

/**
 * Den Informationsstreifen des Shops anlegen, falls er fehlt.
 * Drei Punkte mit Zeichen, Titel und Text — alle drei bearbeitbar.
 */
export function shopInfoNachtragen(content, defaults) {
  const werk = defaults?.sections?.shop?.info;
  if (!Array.isArray(werk) || !werk.length) return [];
  const shop = content?.sections?.shop;
  if (!shop) return [];
  if (Array.isArray(shop.info) && shop.info.length) return [];
  shop.info = kopie(werk);
  return shop.info.map((i) => String(i.title || "").trim()).filter(Boolean);
}

/** Die eine bekannte Telefonnummer räumen — sie gehört nicht mehr auf die Website. */
const ALTE_NUMMERN = ["+41775091171", "0775091171"];
export function telefonRaeumen(content) {
  const contact = content?.sections?.contact;
  if (!contact) return [];
  const ist = String(contact.phone || "").replace(/[\s/.-]+/g, "");
  if (!ist) return [];
  if (!ALTE_NUMMERN.includes(ist)) return []; // eine neue Nummer bleibt stehen
  contact.phone = "";
  return ["Telefonnummer"];
}

/** Alle Nachträge in einem Durchgang. Gibt lesbare Meldungen zurück. */
export function nachtragenBeimLaden(content, defaults) {
  if (!content || !defaults) return { meldungen: [], kanaele: [] };
  const marken = content.migrationen || (content.migrationen = {});
  const meldungen = [];

  const einmal = (name, fn) => {
    if (marken[name] === true) return [];
    const dazu = fn();
    // Die Marke wird IMMER gesetzt, auch wenn nichts zu tun war: der Nachtrag
    // ist damit erledigt und mischt sich nie wieder ein.
    marken[name] = true;
    return dazu;
  };

  const kanaele = einmal("kanaele", () => kanaeleNachtragen(content, defaults));
  if (kanaele.length) meldungen.push(`Kanäle: ${kanaele.join(", ")}`);

  const refs = einmal("referenzen", () => referenzenNachtragen(content, defaults));
  if (refs.length)
    meldungen.push(
      refs.length > 6
        ? `Referenzen: ${refs.length} Einträge (${refs.slice(0, 4).join(", ")} …)`
        : `Referenzen: ${refs.join(", ")}`
    );

  const ware = einmal("ware", () => wareNachtragen(content, defaults));
  if (ware.length) meldungen.push(`Shop: ${ware.join(", ")}`);

  const info = einmal("shopInfo", () => shopInfoNachtragen(content, defaults));
  if (info.length) meldungen.push(`Shop-Infostreifen: ${info.join(", ")}`);

  const tel = einmal("telefon", () => telefonRaeumen(content));
  if (tel.length) meldungen.push("Telefonnummer geleert — sie steht nicht mehr auf der Website");

  return { meldungen, kanaele };
}
