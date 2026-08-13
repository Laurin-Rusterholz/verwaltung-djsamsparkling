/* ==========================================================================
   Statistik — wie oft wird die Website aufgerufen?

   Woher die Zahlen kommen: jede öffentliche Seite meldet ihren Aufruf an
   /api/zaehler (im Website-Repo, netlify/functions/zaehler.mjs). Der Endpunkt
   zählt in der Datenbank unter `samsparking/stats` hoch — ausschliesslich
   Summen. Es gibt keine IP-Adresse, kein Cookie, keine Kennung und damit auch
   keine Auswertung „wer hat was getan“: die Daten dafür sind gar nicht
   vorhanden.

   Zwei Dinge sagt diese Ansicht darum offen:

     1. Gezählt wird ERST SEIT dem Einbau. Was vorher war, ist nicht bekannt und
        lässt sich nicht rekonstruieren — es wurde nie erhoben.
     2. „Besuche“ ist die Zahl der Besuche (erster Aufruf je Browser-Tab),
        „Aufrufe“ die Zahl aller Seitenaufrufe. Beides sind Summen; einzelne
        Besucher lassen sich daraus nicht ableiten. Wer im Browser „Do Not
        Track“ gesetzt hat, wird nicht gezählt.
   ========================================================================== */

import { el, toast } from "./util.js";
import { getDb } from "./store.js";
/* Das Rechnen steht in statistik-zahlen.js — ohne DOM und ohne Datenbank,
   damit es sich ohne Browser prüfen lässt (scripts/statistik.test.mjs). */
import { tagVon, tagMinus, zahl, formatZahl, kurz, reihe, summe, anteile, seit } from "./statistik-zahlen.js";

const SEITEN_NAMEN = {
  start: "Startseite",
  booking: "Booking",
  shop: "Shop",
  impressum: "Impressum",
  legal: "Rechtliches",
  rechtliches: "Rechtliches",
  "mentions-legales": "Rechtliches (FR)",
  presskit: "Presskit",
  andere: "Andere",
};
const SPRACH_NAMEN = { en: "Englisch", de: "Deutsch", fr: "Französisch", andere: "Andere" };
const GERAET_NAMEN = { handy: "Handy", rechner: "Rechner" };

function statKarte(label, wert, note) {
  return el("div", { class: "stat" }, [
    el("span", { class: "stat-label" }, label),
    el("strong", { class: "stat-value" }, wert),
    note ? el("span", { class: "stat-note" }, note) : null,
  ]);
}

/**
 * Ein Balken je Tag, 14 Tage. Kein Diagramm-Werkzeug, keine fremde Datei —
 * <div>s mit Höhe in Prozent. Der höchste Tag ist 100 %; ein Tag ohne Aufrufe
 * bleibt als flacher Strich sichtbar, sonst sähe die Reihe lückenhaft aus.
 */
function balken(tage) {
  const hoch = Math.max(1, ...tage.map((t) => t.aufrufe));
  return el(
    "div",
    { class: "stat-balken" },
    tage.map((t) =>
      el(
        "div",
        {
          class: "stat-balken-tag",
          title: `${kurz(t.tag)}: ${formatZahl(t.aufrufe)} Aufruf${t.aufrufe === 1 ? "" : "e"}${
            t.besuche ? `, ${formatZahl(t.besuche)} Besuch${t.besuche === 1 ? "" : "e"}` : ""
          }`,
        },
        [
          el("span", { class: "stat-balken-zahl" }, t.aufrufe ? formatZahl(t.aufrufe) : ""),
          el("span", {
            class: "stat-balken-stab" + (t.aufrufe ? "" : " leer"),
            style: `height:${t.aufrufe ? Math.max(4, Math.round((t.aufrufe / hoch) * 100)) : 2}%`,
          }),
          el("span", { class: "stat-balken-tagname" }, kurz(t.tag)),
        ]
      )
    )
  );
}

/** Eine Verteilung als Liste mit Anteil — Seiten, Sprachen, Geräte. */
function verteilung(titel, werte, namen) {
  const paare = anteile(werte);
  return el("div", { class: "group" }, [
    el("h3", { class: "group-title" }, titel),
    paare.length
      ? el(
          "ul",
          { class: "stat-liste" },
          paare.map((p) =>
            el("li", {}, [
              el("span", { class: "stat-liste-name" }, (namen && namen[p.key]) || p.key),
              el("span", { class: "stat-liste-bar" }, [el("i", { style: `width:${p.prozent}%` })]),
              el("span", { class: "stat-liste-zahl" }, `${formatZahl(p.n)} · ${p.prozent}%`),
            ])
          )
        )
      : el("p", { class: "empty" }, "Noch keine Aufrufe."),
  ]);
}

/** Die Zahlen einmal aus der Datenbank holen. */
async function ladeStats() {
  const db = getDb();
  if (!db) return null;
  const snap = await db.ref("samsparking/stats").get();
  return snap.exists() ? snap.val() : {};
}

export function renderStatistik() {
  const host = el("div", { class: "view-body" }, [el("p", { class: "muted" }, "Zahlen werden geladen …")]);

  const zeichnen = (stats) => {
    host.innerHTML = "";
    const tageRoh = stats?.tage || {};
    const alleTage = Object.keys(tageRoh).sort();
    const gesamtAufrufe = zahl(stats?.gesamt?.aufrufe);
    const gesamtBesuche = zahl(stats?.gesamt?.besuche);

    if (!alleTage.length && !gesamtAufrufe) {
      host.appendChild(
        el("div", { class: "group" }, [
          el("h3", { class: "group-title" }, "Noch keine Zahlen"),
          el("p", { class: "field-hint" }, [
            "Gezählt wird, sobald die Website mit dem neuen Stand ausgeliefert ist — ",
            "jeder Aufruf meldet sich dann selbst. Bis dahin steht hier nichts, und ",
            el("strong", {}, "rückwirkend gibt es keine Zahlen: "),
            "vorher wurde nichts erhoben, das lässt sich nicht nachholen.",
          ]),
        ])
      );
      return;
    }

    const heute = tagVon();
    const tage14 = reihe(tageRoh, 14);

    host.appendChild(
      el("div", { class: "stats" }, [
        statKarte("Aufrufe insgesamt", formatZahl(gesamtAufrufe), `seit dem ${kurz(seit(tageRoh) || heute)}`),
        statKarte("Besuche insgesamt", formatZahl(gesamtBesuche), "erster Aufruf je Besuch"),
        statKarte("Heute", formatZahl(tageRoh[heute]?.aufrufe), `${formatZahl(tageRoh[heute]?.besuche)} Besuche`),
        statKarte("Letzte 7 Tage", formatZahl(summe(tageRoh, 7)), `${formatZahl(summe(tageRoh, 7, "besuche"))} Besuche`),
        statKarte("Letzte 30 Tage", formatZahl(summe(tageRoh, 30)), `${formatZahl(summe(tageRoh, 30, "besuche"))} Besuche`),
      ])
    );

    host.appendChild(
      el("div", { class: "group" }, [
        el("h3", { class: "group-title" }, "Die letzten 14 Tage"),
        balken(tage14),
        el("p", { class: "field-hint" }, "Ein Balken je Tag, Zeitzone Europe/Zurich. Zahl über dem Balken: Aufrufe an diesem Tag."),
      ])
    );

    host.appendChild(verteilung("Welche Seiten", stats?.seiten, SEITEN_NAMEN));
    host.appendChild(verteilung("Welche Sprache", stats?.sprachen, SPRACH_NAMEN));
    host.appendChild(verteilung("Handy oder Rechner", stats?.geraete, GERAET_NAMEN));

    host.appendChild(
      el("div", { class: "group" }, [
        el("h3", { class: "group-title" }, "Was hier nicht steht — und warum"),
        el("ul", { class: "field-hint" }, [
          el("li", {}, "Keine einzelnen Besucher: gespeichert werden nur Summen, ohne IP-Adresse, ohne Cookie, ohne Kennung. Wer wie oft da war, ist daraus nicht ableitbar — die Daten gibt es nicht."),
          el("li", {}, "Keine Herkunft und keine Suchbegriffe: dafür bräuchte es den Verweis-Kopf jedes Aufrufs, und der wird nicht gespeichert."),
          el("li", {}, "Wer im Browser „Do Not Track“ gesetzt hat, wird nicht gezählt — die echten Zahlen liegen also leicht höher."),
          el("li", {}, "Zwischenspeicher zählen mit: lädt jemand dieselbe Seite neu, ist das ein weiterer Aufruf, aber kein weiterer Besuch."),
          el("li", {}, `Gezählt wird ab dem ${kurz(seit(tageRoh) || heute)}. Alles davor ist unbekannt.`),
        ]),
      ])
    );
  };

  const laden = async (still = false) => {
    try {
      const stats = await ladeStats();
      zeichnen(stats || {});
      if (!still) toast("Zahlen aktualisiert");
    } catch (e) {
      host.innerHTML = "";
      host.appendChild(
        el("p", { class: "warn-box" }, "Zahlen nicht ladbar: " + (e?.message || e))
      );
    }
  };

  laden(true);

  return el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h2", {}, "Statistik"),
        el("p", { class: "muted" }, "Wie oft die öffentliche Website aufgerufen wird — nur Summen, ohne Tracking."),
      ]),
      el("div", { class: "quick" }, [
        el("button", { class: "btn ghost", onclick: () => laden() }, "Neu laden"),
      ]),
    ]),
    host,
  ]);
}
