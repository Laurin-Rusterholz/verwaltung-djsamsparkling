/**
 * Kanäle nachtragen, die auf der Website stehen, in der Verwaltung aber fehlen.
 *
 * Der Befund vom 11.08.2026: die Verwaltung lud links nur „Mixcloud", Vorschau
 * und Website zeigten aber Instagram, Mixcloud, TikTok und Spotify. Der Grund
 * lag nicht in der Verwaltung, sondern im Generator der Website — der legte
 * fehlende Kanäle beim Bauen selbst an und trug zwei Adressen nach. In der
 * Datenbank stand davon nie etwas, also gab es in der Verwaltung auch nichts zu
 * bearbeiten: kein Handle, kein Schalter für das Zeichen im Kopf, kein Löschen.
 *
 * Die Regeln im Generator sind weg — die Website zeigt jetzt genau das, was
 * gespeichert ist. Damit dabei kein Kanal verloren geht, holt diese Stelle die
 * Kanäle des Werks-Stands beim Laden in den Inhalt, sobald sie dort fehlen. Sie
 * erscheinen als normale, bearbeitbare Zeilen, der Stand gilt als geändert, und
 * nach einmal Speichern stehen Verwaltung, Vorschau und Website auf demselben.
 *
 * Was hier NICHT passiert:
 *   - nichts wird überschrieben. Ein Kanal, den es schon gibt, bleibt wie er
 *     ist — mit seiner Adresse, seinem Handle und seinem Schalter.
 *   - nichts wird gelöscht. Ein eigener Kanal, der im Werks-Stand nicht steht,
 *     bleibt stehen.
 *   - nichts wird von allein geschrieben. Gespeichert wird erst, wenn der
 *     Kunde speichert.
 *   - keine geratene Adresse. Nachgetragen wird nur, was im Werks-Stand steht.
 */

/** Erkennt denselben Kanal, auch wenn er anders geschrieben ist. */
const schluessel = (kanal) =>
  String(kanal?.label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Erkennt denselben Kanal auch dann, wenn nur die Adresse übereinstimmt. */
const host = (kanal) => {
  const url = String(kanal?.url || "").trim();
  const m = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
};

/**
 * Ergänzt `content.sections.contact.socials` um die Kanäle aus `defaults`, die
 * dort fehlen. Gibt die Namen der nachgetragenen Kanäle zurück — leer, wenn
 * nichts zu tun war.
 */
export function kanaeleNachtragen(content, defaults) {
  const werk = defaults?.sections?.contact?.socials;
  if (!Array.isArray(werk) || !werk.length) return [];

  const contact = content?.sections?.contact;
  if (!contact) return [];
  if (!Array.isArray(contact.socials)) contact.socials = [];

  const daNamen = new Set(contact.socials.map(schluessel).filter(Boolean));
  const daHosts = new Set(contact.socials.map(host).filter(Boolean));

  const dazu = [];
  for (const [nr, kanal] of werk.entries()) {
    const name = String(kanal?.label || "").trim();
    if (!name) continue;
    if (daNamen.has(schluessel(kanal))) continue;
    const h = host(kanal);
    if (h && daHosts.has(h)) continue;

    /* Eingefügt wird an der Stelle, die der Kanal im Werks-Stand hat — nicht
       einfach hinten angehängt. Sonst stünde auf der Website plötzlich Mixcloud
       vorne und Instagram dahinter, nur weil in der Datenbank zufällig Mixcloud
       gespeichert war. Vorhandene Kanäle behalten dabei ihre Reihenfolge
       untereinander: es wird nur eingefügt, nie umsortiert. */
    const naechster = werk
      .slice(nr + 1)
      .map((k) => contact.socials.findIndex((x) => schluessel(x) === schluessel(k)))
      .find((i) => i >= 0);
    const platz = naechster === undefined ? contact.socials.length : naechster;
    // Eine Kopie, damit der Werks-Stand nicht am Inhalt hängt.
    contact.socials.splice(platz, 0, JSON.parse(JSON.stringify(kanal)));
    daNamen.add(schluessel(kanal));
    if (h) daHosts.add(h);
    dazu.push(name);
  }
  return dazu;
}
