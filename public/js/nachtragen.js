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

/**
 * Das Telefonfeld löschen — überall, bei jedem Laden.
 *
 * Bis zum 12.08.2026 wurde hier nur die eine bekannte Nummer geleert. Das war
 * halb: das Feld stand danach weiter in der Verwaltung und der Schlüssel weiter
 * in den Daten. Der Kunde will es gar nicht mehr haben, also wird
 * `sections.contact.phone` gelöscht — wie beim Fotografen, ohne Marke, weil es
 * das Feld im Modell nicht mehr gibt.
 *
 * Das Telefonfeld IM Booking-Formular bleibt: dort trägt der Besucher seine
 * eigene Nummer ein, das ist etwas anderes.
 */
export function telefonLoeschen(content) {
  let weg = 0;
  const contact = content?.sections?.contact;
  if (contact && contact.phone !== undefined) {
    delete contact.phone;
    weg++;
  }
  for (const wurzel of ["i18n", "i18nHash"]) {
    for (const tabelle of Object.values(content?.[wurzel] || {})) {
      const dort = tabelle?.sections?.contact;
      if (dort && dort.phone !== undefined) {
        delete dort.phone;
        weg++;
      }
    }
  }
  return weg;
}

/**
 * Den Fotografen löschen — überall, bei jedem Laden.
 *
 * Anders als die Nachträge oben hängt das an KEINER Marke. Der Grund: das Feld
 * gibt es im Modell nicht mehr. Es steht in keiner Ansicht, lässt sich nirgends
 * ausfüllen, und ein Wert, der aus einem alten Stand nachkommt, wäre kein
 * Kundenwunsch, sondern ein Rest. Genau so ist „Sarto Photography“ nach dem
 * Ausblenden wieder in der Verwaltung aufgetaucht.
 *
 * Gelöscht wird `site.photoCredit` und jedes `credit` an einem Bild — in den
 * Inhalten wie in den Übersetzungstabellen. Die Bilder selbst bleiben; es fällt
 * nur diese eine Angabe am Eintrag weg.
 */
export function fotografLoeschen(content) {
  if (!content || typeof content !== "object") return 0;
  let weg = 0;
  if (content.site && content.site.photoCredit !== undefined) {
    delete content.site.photoCredit;
    weg++;
  }
  const raeumen = (knoten) => {
    if (Array.isArray(knoten)) return knoten.forEach(raeumen);
    if (!knoten || typeof knoten !== "object") return;
    if (knoten.credit !== undefined) {
      delete knoten.credit;
      weg++;
    }
    for (const wert of Object.values(knoten)) raeumen(wert);
  };
  raeumen(content.sections);
  for (const wurzel of ["i18n", "i18nHash"]) {
    const tabellen = content[wurzel];
    if (!tabellen || typeof tabellen !== "object") continue;
    for (const tabelle of Object.values(tabellen)) {
      if (!tabelle || typeof tabelle !== "object") continue;
      if (tabelle.site && tabelle.site.photoCredit !== undefined) {
        delete tabelle.site.photoCredit;
        weg++;
      }
      raeumen(tabelle.sections);
    }
  }
  return weg;
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

  /* Ohne Marke und ohne Meldung, wie beim Fotografen: das Feld gibt es im
     Modell nicht mehr, und ein Wert aus einem alten Stand waere ein Rest. */
  telefonLoeschen(content);

  /* Ohne Marke: das Feld gibt es nicht mehr, ein Rest darf nie zurueckkommen.

     UND ohne Meldung. Hier stand bis zum 11.08.2026 eine Zeile wie
     "81 Fotocredit(s) geloescht" — die stand dann als sichtbarer Hinweis in der
     Verwaltung und war damit selbst wieder eine Fotografen-Angabe auf dem
     Bildschirm. Der Auftrag lautet "ueberall entfernen", also auch die Meldung
     darueber. Belegt ist das Loeschen durch die Tests (scripts/kanaele.test.mjs),
     nicht durch einen Hinweis, den jemand lesen muss. */
  fotografLoeschen(content);

  return { meldungen, kanaele };
}
