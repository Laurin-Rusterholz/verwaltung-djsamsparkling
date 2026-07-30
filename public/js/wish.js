/* ==========================================================================
   Website-Vorschau mit Wunsch-Modus
   --------------------------------------------------------------------------
   Zeigt die veröffentlichte Website in einem Rahmen. Im Wunsch-Modus lässt
   sich dort auf eine Stelle tippen; danach fragt die Verwaltung nach einem
   Text und legt daraus über den Aufgaben-Eingang eine Quantus-Aufgabe an.

   Weg der Aufgabe:

     Verwaltung  ──push──▶  RTDB /quantus_task_inbox
                                     │  child_added
                                     ▼
                             Quantus (ai-sync)  ──▶  createEntity("task", …)
                                     │
                                     └── entfernt den Eintrag wieder

   Der Eintrag verschwindet also, sobald Quantus einmal offen war — genau das
   nutzt die Liste unten als Rückmeldung („in Quantus angelegt“).
   ========================================================================== */

import { DEFAULT_SITE_URL, QUANTUS_INBOX, QUANTUS_PROJECT } from "./config.js";
import { el, toast, promptDialog } from "./util.js";
import { S, getDb } from "./store.js";
import { languages, LANG_LABEL } from "./i18n.js";

const NS = "samsparking-wunsch";

/** Was in dieser Sitzung schon abgeschickt wurde (die RTDB räumt selbst auf). */
const gesendet = [];

let armed = false;
let frame = null;

/* --------------------------------------------------------------- adressen */

function basisUrl() {
  return String(S.config.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** Die Hauptsprache liegt auf „/“, alle weiteren unter „/<code>/“. */
function seitenUrl(lang) {
  const master = String(S.content?.site?.lang || "de");
  const pfad = !lang || lang === master ? "/" : `/${lang}/`;
  return `${basisUrl()}${pfad}?wunsch=1`;
}

/** Adresse ohne den Wunsch-Schalter — die kommt in die Aufgabe. */
const ohneSchalter = (url) => String(url).replace(/[?&]wunsch=1(&|$)/, "").replace(/[?&]$/, "");

/** Lesbarer Name der Stelle: Überschrift des Abschnitts, ohne Schlusspunkt. */
const titelVon = (d) =>
  String(d.sectionTitle || d.section || "Website").replace(/[.!?…]+$/, "").trim() || "Website";

/* ------------------------------------------------------------ aufgabe bauen */

/**
 * Aufgabe in den Quantus-Eingang legen.
 * Die Feldnamen entsprechen dem Importer in ai-sync/public/index.html.
 */
export async function sendeWunsch({ text, section, sectionTitle, label, url, lang }) {
  const db = getDb();
  if (!db) throw new Error("Keine Verbindung zur Datenbank");

  const stelle = titelVon({ sectionTitle, section });
  const titel = `Website-Wunsch: ${stelle}`.slice(0, 200);

  const zeilen = [text.trim(), ""];
  zeilen.push("— Anpassungswunsch von der Website Sam Sparkling —");
  if (stelle) zeilen.push(`Abschnitt: ${stelle}${section ? ` (#${section})` : ""}`);
  // Bei einer angetippten Überschrift wäre das dieselbe Angabe zweimal
  if (label && label.replace(/[.!?…]+$/, "") !== stelle) zeilen.push(`Angetippt: ${label}`);
  if (lang) zeilen.push(`Sprache: ${LANG_LABEL[lang] || lang}`);
  if (url) zeilen.push(`Seite: ${ohneSchalter(url)}${section ? `#${section}` : ""}`);
  zeilen.push("Bearbeiten in der Verwaltung: Abschnitt " + (section || "—"));

  const eintrag = {
    title: titel,
    description: zeilen.join("\n"),
    status: "todo",
    priority: 3,
    source: "samsparking-website",
    type: "anpassungswunsch",
    tags: ["Website", "Sam Sparkling"],
    createdAt: new Date().toISOString(),
    createdBy: S.user?.email || "Verwaltung",
  };
  if (QUANTUS_PROJECT) eintrag.projectExternalId = QUANTUS_PROJECT;

  const ref = await db.ref(QUANTUS_INBOX).push(eintrag);
  return { key: ref.key, ref, titel, text: text.trim(), stelle };
}

/* ------------------------------------------------------------------- liste */

const listenHost = el("div", { class: "wunsch-liste" });

function zeichneListe() {
  listenHost.textContent = "";
  if (!gesendet.length) {
    listenHost.appendChild(
      el(
        "p",
        { class: "muted" },
        "Noch nichts abgeschickt. Wunsch-Modus einschalten und in der Vorschau auf die Stelle tippen, die geändert werden soll."
      )
    );
    return;
  }
  gesendet.forEach((g) => {
    listenHost.appendChild(
      el("div", { class: "wunsch-item" }, [
        el("div", { class: "wunsch-item-head" }, [
          el("strong", {}, g.stelle),
          el(
            "span",
            { class: "wunsch-state " + (g.abgeholt ? "ok" : "wait") },
            g.abgeholt ? "in Quantus angelegt" : "wartet auf Quantus"
          ),
        ]),
        el("p", {}, g.text),
      ])
    );
  });
}

/**
 * Sobald Quantus den Eintrag verarbeitet hat, entfernt es ihn aus der Queue.
 * Genau darauf hören wir — dann ist die Aufgabe nachweislich angekommen.
 */
function beobachte(g) {
  try {
    g.ref.on("value", (snap) => {
      if (!snap.exists()) {
        g.abgeholt = true;
        g.ref.off();
        zeichneListe();
      }
    });
  } catch (e) {
    /* ohne Rückmeldung leben wir auch */
  }
}

/* ------------------------------------------------------------ wunsch-modus */

function anFrame(nachricht) {
  try {
    frame?.contentWindow?.postMessage({ ns: NS, ...nachricht }, "*");
  } catch (e) {
    /* Rahmen noch nicht geladen */
  }
}

function setArmed(an, knopf) {
  armed = !!an;
  anFrame({ type: armed ? "arm" : "disarm" });
  if (knopf) {
    knopf.classList.toggle("solid", armed);
    knopf.textContent = armed ? "Wunsch-Modus aus" : "Wunsch-Modus an";
  }
  document.querySelectorAll(".wunsch-fahne").forEach((n) => (n.hidden = !armed));
}

async function aufAuswahl(daten) {
  const stelle = titelVon(daten);
  const text = await promptDialog(
    "Anpassungswunsch",
    `Abschnitt „${stelle}“${daten.label ? ` — angetippt: „${daten.label}“` : ""}`,
    {
      placeholder: "Was soll hier geändert werden?",
      okLabel: "Aufgabe in Quantus anlegen",
      hint: "Daraus wird eine Aufgabe in Quantus (ai-sync). Strg/Cmd + Enter schickt ab.",
    }
  );
  anFrame({ type: "clear" });
  if (!text) return;

  try {
    const g = await sendeWunsch({ ...daten, text });
    gesendet.unshift(g);
    zeichneListe();
    beobachte(g);
    toast("Aufgabe an Quantus geschickt");
  } catch (e) {
    toast("Konnte die Aufgabe nicht anlegen: " + e.message, "err");
  }
}

/* Nachrichten aus dem Rahmen. Angenommen wird nur, was wirklich von unserer
   Vorschau kommt — gleiche Herkunft wie die eingestellte Website-Adresse. */
window.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || d.ns !== NS) return;
  if (!frame || e.source !== frame.contentWindow) return;
  let erlaubt = "";
  try {
    erlaubt = new URL(basisUrl() || "/", location.href).origin;
  } catch (err) {
    return;
  }
  if (e.origin !== erlaubt) return;

  if (d.type === "ready" && armed) anFrame({ type: "arm" });
  else if (d.type === "pick") aufAuswahl(d);
});

/* ------------------------------------------------------------------ ansicht */

export function renderPreview() {
  const master = String(S.content?.site?.lang || "de");
  const alleSprachen = [master, ...languages()];
  let lang = master;
  let breit = true;

  frame = el("iframe", {
    class: "vorschau-frame",
    src: seitenUrl(lang),
    title: "Vorschau der Website",
    loading: "lazy",
  });

  const buehne = el("div", { class: "vorschau-buehne desktop" }, [frame]);

  const neuLaden = () => {
    armed = false;
    frame.src = seitenUrl(lang) + "&t=" + Date.now();
    setArmed(false, wunschKnopf);
  };

  const wunschKnopf = el(
    "button",
    { class: "btn", onclick: () => setArmed(!armed, wunschKnopf) },
    "Wunsch-Modus an"
  );

  const sprachWahl = el(
    "select",
    {
      onchange: (e) => {
        lang = e.target.value;
        neuLaden();
      },
    },
    alleSprachen.map((l) =>
      el("option", { value: l, selected: l === lang }, LANG_LABEL[l] || l.toUpperCase())
    )
  );

  const geraetKnopf = el(
    "button",
    {
      class: "btn ghost",
      onclick: () => {
        breit = !breit;
        buehne.className = "vorschau-buehne " + (breit ? "desktop" : "mobil");
        geraetKnopf.textContent = breit ? "Handy-Ansicht" : "Desktop-Ansicht";
      },
    },
    "Handy-Ansicht"
  );

  zeichneListe();

  return el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h2", {}, "Website & Wünsche"),
        el(
          "p",
          { class: "muted" },
          "Die veröffentlichte Website — so, wie sie gerade online ist. Im Wunsch-Modus auf eine Stelle tippen, den Wunsch eintippen: daraus entsteht sofort eine Aufgabe in Quantus."
        ),
      ]),
    ]),
    el("div", { class: "group" }, [
      el("div", { class: "quick" }, [
        wunschKnopf,
        geraetKnopf,
        sprachWahl,
        el("button", { class: "btn ghost", onclick: neuLaden }, "Neu laden"),
        el(
          "a",
          { class: "btn ghost", href: basisUrl(), target: "_blank", rel: "noopener" },
          "In neuem Tab öffnen"
        ),
      ]),
      el(
        "p",
        { class: "field-hint wunsch-fahne", hidden: true },
        "Wunsch-Modus ist an: In der Vorschau wird nicht navigiert — ein Klick meldet die Stelle."
      ),
      buehne,
      el(
        "p",
        { class: "field-hint" },
        "Zeigt den zuletzt veröffentlichten Stand. Änderungen aus der Verwaltung erscheinen hier erst nach dem Publizieren."
      ),
    ]),
    el("div", { class: "group" }, [
      el("h3", { class: "group-title" }, "Abgeschickt in dieser Sitzung"),
      listenHost,
    ]),
  ]);
}
