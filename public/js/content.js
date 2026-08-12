/* ==========================================================================
   Inhalts-Editoren — je Website-Abschnitt eine Ansicht
   ========================================================================== */

import { el, getPath, setPath, toast, looksLikeVideo } from "./util.js";
import { pickMany } from "./media.js";
import { S, markDirty } from "./store.js";
import {
  abschnittsModell,
  aufMehrseitigStellen,
  zielSeiteFuer,
} from "./abschnitte.js";
import {
  textField,
  textArea,
  checkboxField,
  flagField,
  colorField,
  selectField,
  imageField,
  stringList,
  objectList,
  group,
} from "./fields.js";

/** Kopf einer Ansicht mit Titel und Erklärung. */
function head(title, sub) {
  return el("div", { class: "view-head" }, [
    el("div", {}, [el("h2", {}, title), sub ? el("p", { class: "muted" }, sub) : null]),
  ]);
}

const view = (children) => el("div", { class: "view" }, children.filter(Boolean));

/* ------------------------------------------------------------ Start & Design */

export function renderDesign() {
  return view([
    head("Start & Design", "Name, Farben und der erste Bildschirm der Website."),
    group("Grunddaten", [
      textField("site.artist", "Künstlername", { hint: "Erscheint in Titel, Footer und strukturierten Daten." }),
      textField("site.logoText", "Logo-Text (oben links)"),
      textField("site.claim", "Claim im Footer"),
      /* Das Feld "Fotograf/in" gab es hier bis zum 11.08.2026. Es ist ganz weg,
         samt altem Wert — der Kunde will den Fotografen ueberall los, nicht nur
         auf der Website unsichtbar. Geloescht wird der Wert beim Laden
         (nachtragen.js) und bei jedem Build der Website. */
      selectField("site.lang", "Hauptsprache", [
        ["de", "Deutsch"],
        ["en", "Englisch"],
        ["fr", "Französisch"],
      ], { hint: "Die gepflegte Sprache. Weitere Sprachen unter „Sprachen“." }),
    ], { cols: 2 }),
    group("Farben", [
      colorField("site.themeColor", "Hintergrund / Grundton", "Sehr dunkel wählen — die Seite ist als Dark Design gebaut."),
      colorField("site.accentColor", "Akzentfarbe", "Für Zahlen, Links, Buttons und die Hälfte jeder Überschrift."),
    ], { cols: 2 }),
    group("Hero (erster Bildschirm)", [
      textField("hero.kicker", "Kleine Zeile oben", { placeholder: "DJ & Producer — St. Gallen, Switzerland" }),
      textField("hero.nameSpaced", "Name, gesperrt (kleine Zeile)", { placeholder: "S A M" }),
      textField("hero.nameMain", "Name, gross", { placeholder: "Sparking" }),
      textField("hero.tagline", "Slogan"),
      textField("hero.meta", "Genre-Zeile"),
      textField("hero.ctaLabel", "Button-Text"),
      textField("hero.ctaHref", "Button-Ziel", { mono: true, hint: "#booking, #contact oder eine ganze URL." }),
    ], { cols: 2 }),
    group("Kennzahlen im Hero", [
      objectList("hero.stats", null, {
        addLabel: "Zahl hinzufügen",
        newItem: { value: "", label: "" },
        titleOf: (i) => [i.value, i.label].filter(Boolean).join(" — ") || "(leer)",
        emptyText: "Keine Zahlen — die Leiste im Hero wird dann nicht angezeigt.",
        fields: (base) => [
          textField(`${base}.value`, "Zahl / Wert", { placeholder: "7+" }),
          textField(`${base}.label`, "Beschriftung", { placeholder: "Clubs & Festivals" }),
        ],
      }),
    ], {
      hint:
        "Stehen unter dem Namen auf dem ersten Bildschirm. Die Zahl zählt beim " +
        "Erscheinen in zwei Sekunden von 1 auf ihren Wert hoch. Zusätze wie „+“ " +
        "oder „ab“ bleiben stehen — hochgezählt wird nur der Zahlenteil.",
    }),
    heroBackground(),
    group("Hintergrundbild der Seite", [
      imageField("site.backgroundImage", "Bild hinter allem", {
        asObject: false,
        kind: "image",
        hint:
          "Liegt fix hinter der ganzen Seite, stark abgedunkelt — die Inhalte stehen frei darauf. " +
          "Leer lassen für einen ruhigen, einfarbigen Hintergrund.",
      }),
    ]),
    group("Lauftext-Ticker", [
      checkboxField("ticker.enabled", "Ticker anzeigen"),
      objectList("ticker.items", "Wörter", {
        addLabel: "Wortpaar hinzufügen",
        newItem: { text: "", accent: "" },
        titleOf: (i) => [i.text, i.accent].filter(Boolean).join(" ") || "(leer)",
        emptyText: "Keine Ticker-Wörter.",
        fields: (base) => [
          textField(`${base}.text`, "Wort 1 (weiss)"),
          textField(`${base}.accent`, "Wort 2 (Akzentfarbe)"),
        ],
      }),
    ]),
  ]);
}

/**
 * Zuschnitt eines Videos. Die Datei bleibt unverändert — die Website spielt
 * nur den gewählten Ausschnitt und wiederholt ihn. Beide Felder leer lassen
 * heisst: ganzes Video.
 */
function videoZuschnitt(base) {
  return [
    textField(`${base}.clipStart`, "Abspielen ab Sekunde", {
      type: "number",
      placeholder: "0",
      hint: "Leer oder 0 = von Anfang an.",
    }),
    textField(`${base}.clipEnd`, "Abspielen bis Sekunde", {
      type: "number",
      placeholder: "",
      hint:
        "Leer = bis zum Ende. Beispiel: 4 und 12 zeigt die Sekunden 4 bis 12 " +
        "und springt danach zurück auf Sekunde 4.",
    }),
  ];
}

/**
 * Hero-Hintergrund. Wird beim Auswählen eines Videos automatisch auf „Video“
 * gestellt (und umgekehrt) — die Art von Hand nachzuziehen ist die häufigste
 * Stolperfalle.
 */
function heroBackground() {
  const box = el("div", { class: "group-body" });

  const build = () => {
    const isVideo = getPath(S.content, "hero.media.type") === "video";
    box.innerHTML = "";
    box.append(
      selectField(
        "hero.media.type",
        "Art",
        [
          ["image", "Bild"],
          ["video", "Video (läuft automatisch, stumm, in Dauerschleife)"],
        ],
        { onChange: build }
      ),
      isVideo
        ? el(
            "p",
            { class: "field-hint" },
            "MP4 (H.264) verwenden — .mov/HEVC vom iPhone spielt auf Android und Windows oft nicht ab. Klein halten (unter 12 MB), sonst wartet das Handy aufs Video."
          )
        : document.createDocumentFragment(),
      selectField(
        "hero.media.fit",
        isVideo ? "Anzeige des Videos" : "Anzeige des Bildes",
        [
          ["fill", "Bildschirm füllen — Ränder werden abgeschnitten"],
          ["full", "ganzes " + (isVideo ? "Video" : "Bild") + " zeigen — mit Rand"],
        ],
        {
          onChange: build,
          hint:
            "„Bildschirm füllen“ sieht satter aus, schneidet auf dem Handy aber viel weg (Video ist quer, der Bildschirm hoch). " +
            "„Ganzes Video zeigen“ lässt nichts weg, dafür bleiben oben und unten dunkle Ränder.",
        }
      ),
      getPath(S.content, "hero.media.fit") === "full"
        ? document.createDocumentFragment()
        : selectField("hero.media.focus", "Sichtbarer Ausschnitt", [
            ["center", "Mitte"],
            ["top", "oben"],
            ["bottom", "unten"],
            ["left", "links"],
            ["right", "rechts"],
          ], { hint: "Welcher Teil sichtbar bleibt, wenn Ränder abgeschnitten werden." }),
      imageField("hero.media", isVideo ? "Video-Datei" : "Bild", {
        kind: isVideo ? "video" : "image",
        emptyText: isVideo ? "Video wählen" : "Bild wählen",
        alt: true,
        afterPick: (item) => {
          const nowVideo = item.kind === "video" || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(item.url || "");
          if (nowVideo !== isVideo) {
            setPathAndRender("hero.media.type", nowVideo ? "video" : "image");
          }
        },
        hint: isVideo
          ? "Ton wird nicht abgespielt — Browser erlauben Autoplay nur stumm. Kurzer Loop (5–15 s) wirkt am besten."
          : null,
      }),
      ...(isVideo
        ? [
            imageField("hero.media.poster", "Vorschaubild (Poster)", {
              asObject: false,
              kind: "image",
              hint:
                "Wird sofort angezeigt, während das Video lädt, und ersetzt es bei „Bewegung reduzieren“. Ohne Poster bleibt der Hero kurz schwarz.",
            }),
            ...videoZuschnitt("hero.media"),
          ]
        : [])
    );
  };

  const setPathAndRender = (path, value) => {
    setPath(S.content, path, value);
    markDirty();
    build();
  };

  build();
  return el("section", { class: "group" }, [
    el("h3", { class: "group-title" }, "Hero-Hintergrund"),
    box,
  ]);
}

/* ------------------------------------------------------------------- SEO */

export function renderSeo() {
  return view([
    head("SEO & Teilen", "Was Google und Social-Media-Vorschauen anzeigen."),
    group("Google", [
      textField("site.domain", "Domain der Website", {
        mono: true,
        hint: "Mit https:// und ohne Schrägstrich am Ende. Steuert Canonical, sitemap.xml und robots.txt.",
      }),
      textField("site.title", "Seitentitel", {
        maxlength: 70,
        hint: "Ideal 50–60 Zeichen. Name + Genre + Ort wirkt am besten.",
      }),
      textArea("site.description", "Meta-Description", {
        rows: 3,
        maxlength: 300,
        hint: "Ideal 140–160 Zeichen. Das ist der Text unter dem Suchergebnis.",
      }),
      stringList("site.keywords", "Keywords", {
        addLabel: "Keyword hinzufügen",
        placeholder: "Hardstyle DJ Schweiz",
        hint: "Nur noch schwach gewichtet — 5 bis 10 treffende Begriffe genügen.",
      }),
    ]),
    group("Vorschau beim Teilen (WhatsApp, Instagram, Facebook)", [
      textField("site.ogTitle", "Titel", { maxlength: 120 }),
      textArea("site.ogDescription", "Text", { rows: 2, maxlength: 300 }),
      imageField("site.ogImage", "Vorschaubild", {
        asObject: false,
        kind: "image",
        hint: "Querformat, ideal 1200×630 px. Videos gehen hier nicht.",
      }),
    ]),
    group("Booking-Formular", [
      textField("site.bookingApi", "Ziel der Anfragen", {
        mono: true,
        hint:
          "Die Datenbank-Adresse, an die das Formular schreibt. Leer lassen = Formular ausblenden, dann steht nur die E-Mail-Adresse auf der Seite.",
      }),
    ]),
    liveCounters(),
  ]);
}

/** Kleine Live-Auswertung der Textlängen. */
function liveCounters() {
  const box = el("div", { class: "counters" });
  const render = () => {
    const t = (getPath(S.content, "site.title") || "").length;
    const d = (getPath(S.content, "site.description") || "").length;
    box.innerHTML = "";
    box.append(
      counter("Titel", t, 50, 60),
      counter("Description", d, 140, 160)
    );
  };
  render();
  const onInput = () => {
    if (!box.isConnected) return document.removeEventListener("input", onInput);
    render();
  };
  document.addEventListener("input", onInput);
  return group("Längen-Check", [box]);
}

function counter(label, value, min, max) {
  const state = value < min ? "low" : value > max ? "high" : "ok";
  const text = state === "ok" ? "gut" : state === "low" ? "eher kurz" : "wird abgeschnitten";
  return el("div", { class: "counter " + state }, [
    el("span", { class: "counter-label" }, label),
    el("strong", {}, `${value} Zeichen`),
    el("span", { class: "counter-note" }, `${text} (${min}–${max})`),
  ]);
}

/* ------------------------------------------------------- Abschnitt: About */

export function renderAbout() {
  return view([
    head("About", "Der Text über Sam."),
    sectionBasics("about"),
    group("Bild", [imageField("sections.about.photo", "Portrait", { kind: "image" })]),
    group("Text", [
      textArea("sections.about.lede", "Einstieg (gross gesetzt)", { rows: 3 }),
      stringList("sections.about.paragraphs", "Absätze", {
        multiline: true,
        rows: 5,
        addLabel: "Absatz hinzufügen",
        hint: "**doppelte Sternchen** machen fett, [Text](https://…) macht einen Link.",
      }),
      stringList("sections.about.words", "Stichworte (Kacheln)", { addLabel: "Stichwort hinzufügen" }),
    ]),
    group("Fakten-Leiste", [
      objectList("sections.about.facts", null, {
        addLabel: "Fakt hinzufügen",
        newItem: { value: "", label: "" },
        titleOf: (i) => [i.value, i.label].filter(Boolean).join(" — ") || "(leer)",
        emptyText: "Keine Fakten — die Leiste wird dann nicht angezeigt.",
        fields: (base) => [
          textField(`${base}.value`, "Zahl / Wert", { placeholder: "7+" }),
          textField(`${base}.label`, "Beschriftung", { placeholder: "Clubs & Festivals" }),
        ],
      }),
    ]),
  ]);
}

/* ------------------------------------------------------- Abschnitt: Shows */

/** Monatsübersicht der Termine — dieselbe Ansicht wie auf der Website. */
function showsCalendar() {
  const host = el("div", { class: "cal" });
  const monthLabel = el("strong", { class: "cal-month" });
  const grid = el("div", { class: "cal-grid" });

  const items = () => getPath(S.content, "sections.shows.items") || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const first = items()
    .filter((i) => i.date && i.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const startAt = new Date((first?.date || todayStr) + "T12:00:00Z");
  let year = startAt.getUTCFullYear();
  let month = startAt.getUTCMonth();

  const draw = () => {
    const byDate = {};
    items().forEach((s) => {
      if (s.date) (byDate[s.date] = byDate[s.date] || []).push(s);
    });
    const firstDay = new Date(Date.UTC(year, month, 1));
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lead = (firstDay.getUTCDay() + 6) % 7;
    monthLabel.textContent = firstDay.toLocaleDateString("de-CH", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    grid.innerHTML = "";
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach((d) =>
      grid.appendChild(el("span", { class: "cal-wd" }, d))
    );
    for (let i = 0; i < lead; i++) grid.appendChild(el("span", { class: "cal-day empty" }));

    for (let day = 1; day <= days; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const shows = byDate[iso];
      const cls =
        "cal-day" +
        (iso === todayStr ? " today" : "") +
        (iso < todayStr ? " past" : "") +
        (shows ? " has-show" : "") +
        (shows && shows.some((s) => s.status === "booked") ? " booked" : "") +
        (shows && shows.every((s) => s.status === "soldout") ? " soldout" : "");
      grid.appendChild(
        el(
          "span",
          {
            class: cls,
            title: shows
              ? shows
                  .map((s) =>
                    [s.name, s.city].filter(Boolean).join(", ") + (s.status === "booked" ? " · gebucht" : "")
                  )
                  .join(" · ")
              : "",
          },
          [
            el("b", {}, String(day)),
            shows ? el("span", { class: "cal-dot" }) : null,
            shows
              ? el("span", { class: "cal-tip" }, shows[0].name || "Termin")
              : null,
          ]
        )
      );
    }
  };
  draw();

  const step = (delta) => {
    month += delta;
    if (month > 11) { month = 0; year++; }
    if (month < 0) { month = 11; year--; }
    draw();
  };

  const jumpToNext = () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const next = (getPath(S.content, "sections.shows.items") || [])
      .filter((i) => i.date && i.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const target = new Date((next?.date || todayIso) + "T12:00:00Z");
    year = target.getUTCFullYear();
    month = target.getUTCMonth();
    draw();
  };

  host.append(
    el("div", { class: "cal-head" }, [
      el("button", { class: "cal-nav", type: "button", "aria-label": "Vorheriger Monat", onclick: () => step(-1) }, "‹"),
      monthLabel,
      el("div", { class: "cal-head-right" }, [
        el("button", { class: "btn ghost sm", type: "button", onclick: jumpToNext }, "Nächster Termin"),
        el("button", { class: "cal-nav", type: "button", "aria-label": "Nächster Monat", onclick: () => step(1) }, "›"),
      ]),
    ]),
    grid
  );
  host._redraw = draw;
  return host;
}

export function renderShows() {
  const today = new Date().toISOString().slice(0, 10);
  const items = getPath(S.content, "sections.shows.items") || [];
  const upcoming = items.filter((i) => !i.date || i.date >= today).length;
  const cal = showsCalendar();

  return view([
    head(
      "Shows",
      `Auftritts-Termine. ${upcoming} kommende${upcoming === 1 ? "r" : ""} Termin${
        upcoming === 1 ? "" : "e"
      } — ohne hinterlegten Termin verschwindet der komplette Shows-Abschnitt automatisch von der Website.`
    ),
    sectionBasics("shows"),
    group("Übersicht", [cal], {
      hint: "Klick auf die Pfeile blättert durch die Monate. Punkte sind Termine.",
    }),
    group("Termine", [
      objectList("sections.shows.items", null, {
        addLabel: "Termin hinzufügen",
        newItem: {
          date: "",
          time: "",
          name: "",
          venue: "",
          city: "",
          country: "CH",
          ticketUrl: "",
          ticketLabel: "Tickets",
          status: "confirmed",
        },
        titleOf: (i) => [i.date, i.name].filter(Boolean).join("  ·  ") || "(neuer Termin)",
        emptyText: "Noch keine Termine — der Shows-Abschnitt und sein Menüpunkt bleiben dann vollständig verborgen.",
        hint:
          "Die Reihenfolge hier spielt keine Rolle: auf der Website stehen die " +
          "kommenden Termine immer chronologisch, bei gleichem Datum nach Uhrzeit.",
        onChange: () => cal._redraw(),
        fields: (base) => [
          textField(`${base}.date`, "Datum", { type: "date" }),
          /* Die Uhrzeit entscheidet nur die Reihenfolge, wenn zwei Termine auf
             denselben Tag fallen. Auf der Website steht sie nicht — dort zaehlt
             das Datum. Leer lassen ist normal. */
          textField(`${base}.time`, "Uhrzeit (optional)", {
            type: "time",
            hint: "Nur für die Reihenfolge bei zwei Terminen am selben Tag.",
          }),
          textField(`${base}.name`, "Event / Club", { placeholder: "Ultrawild Festival" }),
          textField(`${base}.venue`, "Location", { placeholder: "Olma Halle" }),
          textField(`${base}.city`, "Stadt"),
          textField(`${base}.country`, "Land (Kürzel)", { placeholder: "CH", maxlength: 3 }),
          selectField(`${base}.status`, "Status", [
            ["confirmed", "bestätigt"],
            ["booked", "gebucht"],
            ["soldout", "ausverkauft"],
            ["cancelled", "abgesagt"],
          ], {
            hint: "„gebucht“ färbt den Tag im Website-Kalender und blendet den Ticket-Knopf aus.",
            onChange: () => cal._redraw(),
          }),
          textField(`${base}.ticketUrl`, "Ticket-Link", { mono: true }),
          textField(`${base}.ticketLabel`, "Button-Text", { placeholder: "Tickets" }),
        ],
      }),
    ]),
    group("Darstellung auf der Website", [
      textField("sections.shows.pastLabel", "Beschriftung „vergangene Shows“"),
    ], {
      hint: "Der Abschnitt erscheint erst, sobald oben mindestens ein echter Termin angelegt ist. Der Kalender im Booking-Formular bleibt für Wunschanfragen trotzdem verfügbar.",
    }),
  ]);
}

/* -------------------------------------------------- Abschnitt: Referenzen */

export function renderReferences() {
  return view([
    head("Referenzen", "Wo Sam schon gespielt hat."),
    sectionBasics("references"),
    nachtragHinweis(),
    group("Liste", [
      objectList("sections.references.items", null, {
        addLabel: "Referenz hinzufügen",
        newItem: { name: "", city: "", url: "" },
        titleOf: (i) => [i.name, i.city].filter(Boolean).join(" — ") || "(leer)",
        fields: (base) => [
          textField(`${base}.name`, "Club / Festival"),
          textField(`${base}.city`, "Ort"),
          textField(`${base}.url`, "Link (optional)", { mono: true, hint: "Leer = führt zum Booking-Abschnitt." }),
        ],
      }),
    ], {
      hint:
        "Alle Referenzen erscheinen auf der Website im selben Stil, fortlaufend in " +
        "genau dieser Reihenfolge — mit ↑ ↓ verschiebst du einen Eintrag. Was oben " +
        "steht, steht auch auf der Website oben.",
    }),
    /* Das Häkchen „Gross zeigen" ist am 11.08.2026 weggefallen. Es hat eine
       zweite Rangfolge neben dieser Liste aufgemacht: wer hier etwas nach oben
       schob, sah davon nichts, solange der Eintrag nicht auch gross stand — und
       wer gross setzte, sprengte die Reihenfolge. Jetzt entscheidet allein die
       Reihenfolge, und die ist eins zu eins auf der Website zu sehen.

       Ein früher gesetztes `highlight` bleibt im Inhalt stehen (nichts geht
       verloren), wirkt aber nirgends mehr. */
    group("Zeile über den Referenzen", [
      textField("sections.references.moreLabel", "Text", {
        placeholder: "Also played at",
        hint:
          "Wird auf der Website nicht mehr angezeigt — die Referenzen stehen ohne " +
          "Zwischenzeile in einer Liste. Der Text bleibt hier erhalten.",
      }),
    ]),
    group("Abschlusszeile", [
      textField("sections.references.note", "Text"),
      textField("sections.references.noteLinkLabel", "Link-Text"),
    ], { cols: 2 }),
  ]);
}

/* ----------------------------------------------------- Abschnitt: Galerie */

export function renderGallery() {
  return view([
    head(
      "Galerie",
      "Bilder mit Lightbox; auf dem Handy startet die Galerie bewusst als kurze Auswahl. " +
        "Videos in der Galerie laufen erst, wenn der Zeiger auf der Kachel liegt."
    ),
    sectionBasics("gallery"),
    group(null, [
      el("p", { class: "field-hint" }, [
        el("strong", {}, "Fotos und Videos. "),
        el("span", {}, [
          "Beim Auswählen filtern die Reiter „Alle | Bilder | Videos“. Ein Video steht in ",
          "der Bilderwand als Kachel mit Play-Zeichen — angespielt wird es erst beim ",
          "Darüberfahren, auf dem Handy sobald es im Bild ist.",
        ]),
      ]),
    ], { class: "basics" }),
    group("Mobile Darstellung", [
      selectField("sections.gallery.mobileLimit", "Bilder vor „Mehr anzeigen“", [
        ["2", "2 Bilder"],
        ["4", "4 Bilder (empfohlen)"],
        ["6", "6 Bilder"],
        ["8", "8 Bilder"],
      ], {
        hint: "Nur für Handys. Desktop zeigt weiterhin die komplette Galerie.",
      }),
    ], {
      hint: "Eine kurze 2-Spalten-Auswahl hält den AIDA-Weg kompakt. Weitere Bilder öffnet der Besucher bewusst über einen Knopf.",
    }),
    group("Bilder", [
      objectList("sections.gallery.items", null, {
        // Der übliche Weg ist „Bilder aussuchen“ — der leere Platz ist die
        // Ausnahme (z. B. wenn die Adresse von Hand kommt).
        addLabel: "Aus den Medien hinzufügen",
        onAdd: async (items, render) => {
          /* Der Dialog zeigt Bilder UND Videos — getrennt ueber die Tabs
             "Alle | Bilder | Videos". Er beginnt bei den Bildern, weil hier die
             Bilderwand gepflegt wird; wer ein Video sucht, findet es einen
             Klick daneben.

             Beides gehoert in die Bilderwand: ein Video steht dort als eigene
             Kachel mit Play-Zeichen zwischen den Fotos. Eine separate
             Video-Seite gibt es nicht mehr (zurueckgenommen am 11.08.2026). */
          const chosen = await pickMany({ kind: "image" });
          if (!chosen || !chosen.length) return;
          chosen.forEach((m) =>
            items.push({ src: m.url, alt: m.alt || "" })
          );
          markDirty();
          render();
          toast(`${chosen.length} Medien hinzugefügt`);
        },
        newItem: { src: "", alt: "" },
        titleOf: (i, n) => i.alt || `Bild ${n + 1}`,
        emptyText: "Keine Bilder.",
        extraAdd: [
          {
            label: "leerer Platz",
            onClick: (items, render) => {
              items.push({ src: "", alt: "" });
              markDirty();
              render();
            },
          },
        ],
        fields: (base) => {
          const istVideo = looksLikeVideo(getPath(S.content, `${base}.src`));
          return [
            imageField(base, null, { emptyText: "Bild oder Video wählen" }),
            /* Ein Video in der Bilderwand: erlaubt und gewollt. Es steht dort
               als eigene Kachel mit Play-Zeichen zwischen den Fotos — das ist
               der einzige Ort, an dem es oeffentlich erscheint. */
            ...(istVideo
              ? [
                  el("p", { class: "field-hint" }, [
                    el("strong", {}, "Video. "),
                    el("span", {}, [
                      "Steht als Kachel mit Play-Zeichen in der Bilderwand.",
                    ]),
                  ]),
                  selectField(`${base}.fit`, "Anzeige des Videos", [
                    ["fill", "Fläche füllen — Ränder abgeschnitten"],
                    ["full", "ganzes Video zeigen — mit Rand"],
                  ], { hint: "Gilt nur für Videos in der Galerie." }),
                  imageField(`${base}.poster`, "Vorschaubild (Poster)", {
                    asObject: false,
                    kind: "image",
                    hint:
                      "Steht auf der Kachel, solange das Video nicht läuft. " +
                      "Ohne Poster bleibt die Kachel bis zum ersten Abspielen dunkel.",
                  }),
                  ...videoZuschnitt(base),
                ]
              : []),
          ];
        },
      }),
    ]),
  ]);
}

/* -------------------------------------------------------- Abschnitt: Shop */

export function renderShop() {
  return view([
    head("Shop", "Die Merch-Seite: Einladung oben, Katalog darunter, Infostreifen zum Schluss."),
    sectionBasics("shop"),
    nachtragHinweis(),
    /* Die helle Fläche ganz oben im Shop. Sie ersetzt seit dem 11.08.2026 die
       alte Zeile „Merch from Sam Sparking …" über der Ware. */
    group("Einladung oben", [
      textField("sections.shop.kicker", "Kleine Zeile", {
        placeholder: "MERCH",
        hint: "Steht klein über der Überschrift.",
      }),
      textField("sections.shop.headline", "Überschrift", { placeholder: "Sam Sparking Shop" }),
      textArea("sections.shop.intro", "Kurze Beschreibung", {
        rows: 2,
        hint: "Ein, zwei Sätze. Leer = es steht nur die Überschrift da.",
      }),
      textField("sections.shop.ctaLabel", "Knopf zum Katalog", {
        placeholder: "Zum Katalog",
        hint: "Der Knopf springt zu den Produktkarten. Leer = kein Knopf.",
      }),
    ], { cols: 2 }),
    group("Grunddaten", [
      textField("sections.shop.currency", "Währung", {
        placeholder: "CHF",
        hint: "Steht vor jedem Preis.",
      }),
      textField("sections.shop.buyLabel", "Button-Text", { placeholder: "Kaufen" }),
      textField("sections.shop.note", "Zeile im leeren Shop", {
        hint:
          "Erscheint nur, wenn kein Artikel da ist. Über Ware steht sie nicht mehr — " +
          "die Ware spricht für sich.",
      }),
      textArea("sections.shop.emptyText", "Text ohne Ware", { rows: 2 }),
    ], { cols: 2 }),
    group("Ware", [
      objectList("sections.shop.items", null, {
        addLabel: "Artikel hinzufügen",
        newItem: { name: "", price: "", note: "", badge: "", src: "", alt: "", paymentLink: "", linkUrl: "", status: "available" },
        titleOf: (i) => [i.name, i.price].filter(Boolean).join(" — ") || "(neuer Artikel)",
        emptyText: "Keine Ware — es steht dann nur der Text von oben da.",
        fields: (base) => [
          imageField(base, "Bild", { kind: "image" }),
          textField(`${base}.name`, "Name"),
          textField(`${base}.price`, "Preis", { placeholder: "35" }),
          textField(`${base}.note`, "Kurze Zeile darunter"),
          /* Das Abzeichen sitzt oben links auf dem Produktbild. Frei
             beschriftbar; leer heisst kein Abzeichen. Ausverkauft schlägt es:
             dann sagt die Karte das Wichtigere. */
          textField(`${base}.badge`, "Abzeichen (optional)", {
            placeholder: "Bestseller",
            hint: "Steht oben links auf dem Bild. Leer = kein Abzeichen.",
          }),
          selectField(`${base}.status`, "Verfügbarkeit", [
            ["available", "verfügbar"],
            ["soldout", "ausverkauft"],
          ]),
          /* Ein Stripe Payment Link gehoert zu GENAU EINEM Preis. Deshalb steht
             er am Artikel und nicht global: ein gemeinsamer Link haette bei
             jedem Artikel denselben Betrag abgerechnet. Ein API-Schluessel wird
             hier nie gebraucht — ein Payment Link ist eine oeffentliche
             Adresse. */
          textField(`${base}.paymentLink`, "Stripe Payment Link", {
            mono: true,
            placeholder: "https://buy.stripe.com/…",
            hint:
              "So kommst du dran: in Stripe unter Produktkatalog einen Preis anlegen → " +
              "„Payment Link“ erzeugen → die Adresse hier einsetzen. Sie beginnt mit " +
              "https://buy.stripe.com/ — nur solche Adressen werden übernommen. " +
              "Der Kauf-Knopf dieses Artikels führt dann direkt dorthin. " +
              "Kein API-Schlüssel, keine Netlify-Variable. Leer = kein Kauf-Knopf; " +
              "die Bestellung läuft dann über das Formular und du meldest dich per E-Mail.",
          }),
          textField(`${base}.linkUrl`, "Link (optional)", {
            mono: true,
            hint: "Nur für eine Info-Seite zum Artikel. Bezahlt wird über den Payment Link oben.",
          }),
        ],
      }),
    ], {
      hint:
        "Die Reihenfolge hier ist auch die Reihenfolge im Katalog. Drei Karten " +
        "nebeneinander am Rechner, zwei am Tablet, eine am Handy.",
    }),
    /* Der Streifen unter den Karten. Drei Punkte, mehr zeigt die Website nicht.
       Wichtig: keine Versprechen, die niemand einlösen kann — keine festen
       Lieferfristen, kein „gratis Versand", kein Zahlungsanbieter, der gar
       nicht eingerichtet ist. */
    group("Informationsstreifen unter dem Katalog", [
      objectList("sections.shop.info", null, {
        addLabel: "Punkt hinzufügen",
        newItem: { icon: "fragen", title: "", text: "" },
        titleOf: (i) => i.title || "(leer)",
        emptyText: "Kein Streifen — dann steht unter den Karten nichts.",
        fields: (base) => [
          selectField(`${base}.icon`, "Zeichen", [
            ["zahlung", "Karte — Zahlung"],
            ["versand", "Paket — Versand"],
            ["fragen", "Fragezeichen — Fragen"],
          ]),
          textField(`${base}.title`, "Titel", { placeholder: "Versand" }),
          textArea(`${base}.text`, "Text", { rows: 2 }),
        ],
      }),
    ], {
      hint:
        "Höchstens drei Punkte — mehr zeigt die Website nicht. Bitte nichts " +
        "versprechen, was nicht feststeht: keine Lieferfrist, kein „gratis Versand“, " +
        "kein Zahlungsanbieter, der nicht eingerichtet ist.",
    }),
  ]);
}

/* ------------------------------------------------- Abschnitt: Sound & Genres */

export function renderSound() {
  return view([
    head("Sound & Genres", "Womit Sam auflegt und wo man es hören kann."),
    nichtGebaut("Sound & Genres"),
    group("Einleitung", [textArea("sections.sound.note", "Text unter der Überschrift", { rows: 2 })]),
    group("Genres", [
      objectList("sections.sound.genres", null, {
        addLabel: "Genre hinzufügen",
        newItem: { name: "", meta: "Genre" },
        titleOf: (i) => i.name || "(leer)",
        emptyText: "Keine Genres.",
        fields: (base) => [
          textField(`${base}.name`, "Name", { placeholder: "Euphoric Hardstyle" }),
          textField(`${base}.meta`, "Kleine Zeile", { placeholder: "Genre" }),
        ],
      }),
    ]),
    group("Mixe", [
      objectList("sections.sound.mixes", null, {
        addLabel: "Mix hinzufügen",
        newItem: { kicker: "", title: "", text: "", linkLabel: "", linkUrl: "" },
        titleOf: (i) => i.title || "(neuer Mix)",
        emptyText: "Keine Mixe.",
        fields: (base) => [
          textField(`${base}.kicker`, "Kleine Zeile", { placeholder: "Latest Mix" }),
          textField(`${base}.title`, "Titel"),
          textArea(`${base}.text`, "Text", { rows: 3 }),
          textField(`${base}.linkLabel`, "Link-Text", { placeholder: "Auf Mixcloud hören" }),
          textField(`${base}.linkUrl`, "Link", { mono: true }),
        ],
      }),
    ]),
  ]);
}

/* ---------------------------------------------------- Abschnitt: Erlebnis */

export function renderExperience() {
  return view([
    head("Erlebnis", "Wie ein Set von Sam abläuft — der Bogen von Warm-up bis Schluss."),
    nichtGebaut("Erlebnis"),
    group("Einleitung", [
      textArea("sections.experience.lede", "Einstieg (gross gesetzt)", { rows: 3 }),
      textField("sections.experience.embedLabel", "Beschriftung beim Video", { placeholder: "Aftermovie" }),
    ]),
    group("Momente", [
      objectList("sections.experience.moments", null, {
        addLabel: "Moment hinzufügen",
        newItem: { kicker: "", title: "", text: "" },
        titleOf: (i) => [i.kicker, i.title].filter(Boolean).join(" — ") || "(neuer Moment)",
        emptyText: "Keine Momente — der Abschnitt bleibt dann leer.",
        fields: (base) => [
          textField(`${base}.kicker`, "Kleine Zeile", { placeholder: "Peak time" }),
          textField(`${base}.title`, "Titel", { placeholder: "The Drop" }),
          textArea(`${base}.text`, "Text", { rows: 3 }),
        ],
      }),
    ]),
  ]);
}

/* ----------------------------------------------------- Abschnitt: Booking */

export function renderBooking() {
  return view([
    head("Booking", "Verfügbarkeit, Presskit und das Anfrage-Formular."),
    sectionBasics("booking"),
    group("Bild", [
      imageField("sections.booking.photo", "Bild neben der Anfrage", {
        kind: "image",
        hint: "Steht unter „Verfügbar für“. Ohne Bild entfällt der Platz dafür.",
      }),
    ]),
    group("Verfügbar für", [
      textField("sections.booking.availableKicker", "Kleine Zeile"),
      stringList("sections.booking.available", "Einträge", { addLabel: "Eintrag hinzufügen" }),
    ]),
    group("Presskit", [
      textField("sections.booking.presskitLabel", "Button-Text"),
      textField("sections.booking.presskitUrl", "Datei / URL", {
        mono: true,
        hint: "presskit/… im Website-Repo oder eine komplette URL. Leer = Button ausblenden.",
      }),
    ], { cols: 2 }),
    group("Anfrage-Formular", [
      checkboxField("sections.booking.form.enabled", "Formular anzeigen"),
      textField("sections.booking.form.kicker", "Kleine Zeile"),
      textField("sections.booking.form.title", "Titel"),
      textField("sections.booking.form.submitLabel", "Button-Text"),
      textArea("sections.booking.form.successText", "Text nach dem Absenden", { rows: 2 }),
      textArea("sections.booking.form.errorText", "Text bei einem Fehler", { rows: 2 }),
    ]),
  ]);
}

/* ----------------------------------------------------- Abschnitt: Kontakt */

export function renderContact() {
  return view([
    head("Kontakt", "Wie Veranstalter Sam erreichen."),
    sectionBasics("contact"),
    kanaeleHinweis(),
    group("Kontaktdaten", [
      textField("sections.contact.kicker", "Kleine Zeile"),
      textField("sections.contact.email", "E-Mail", { type: "email" }),
      /* Das Telefonfeld gab es hier bis zum 12.08.2026. Es ist ganz weg — erst
         war es nur ausgeblendet, dann leer; beides war halb. Der Kunde will es
         gar nicht mehr haben. Der alte Wert wird beim Laden geloescht
         (nachtragen.js) und bei jedem Build der Website.

         Das Telefonfeld IM Booking-Formular bleibt: dort traegt der Besucher
         seine eigene Nummer ein, das ist etwas anderes. */
      textField("sections.contact.base", "Standort"),
    ], { cols: 2 }),
    group("Social Media & Musik", [socialsList()], {
      hint:
        "Dieselbe Liste wie unter „Join the Movement“ — hier wie dort dieselben Kanäle. " +
        "Sie stehen im Abschnitt nach dem Booking, im Fussbereich und, wo angewählt, " +
        "oben im Kopfbereich.",
    }),
  ]);
}

/* ---------------------------------------------------- Website-Release */

/**
 * Der Start der Website. Bis zum eingestellten Zeitpunkt liegt ein Vorhang mit
 * Countdown über allen öffentlichen Seiten; danach ist die Website da.
 *
 * Umgeschaltet wird im Browser des Besuchers: der Zeitpunkt steht als Zahl in
 * der Seite, ein kleines Skript zählt herunter und nimmt den Vorhang bei null
 * weg. Es braucht also weder einen neuen Deploy noch einen Cache-Griff, und
 * eine Seite, die offen liegen bleibt, schaltet von selbst um.
 *
 * Die Vorführ-Fassung unter /site/ und diese Verwaltung sind nie gesperrt —
 * dort wird gearbeitet.
 */
export function renderRelease() {
  const an = getPath(S.content, "release.enabled") !== false;
  const datum = String(getPath(S.content, "release.date") || "");
  const zeit = String(getPath(S.content, "release.time") || "");
  let wann = "";
  if (datum) {
    const [j, m, t] = datum.split("-");
    wann = `${t}.${m}.${j}` + (zeit ? `, ${zeit} Uhr` : "");
  }
  return view([
    head("Website-Release", "Bis zum Start zeigt die öffentliche Website einen Countdown."),
    group(null, [
      el("p", { class: "field-hint" }, [
        an && datum
          ? `Die Website ist gesperrt und öffnet sich am ${wann} (Zeitzone Europe/Zurich) von selbst. `
          : "Die Sperre ist aus — die Website ist öffentlich erreichbar. ",
        "Umgeschaltet wird im Browser: eine Seite, die über den Zeitpunkt hinaus offen ",
        "bleibt, wechselt ohne Neuladen. Ein neuer Deploy ist dafür nicht nötig.",
      ]),
    ], { class: "basics" }),
    group("Schalter", [
      checkboxField(
        "release.enabled",
        "Website bis zum Release sperren",
        "Aus = die Website ist sofort öffentlich, ohne Countdown."
      ),
    ]),
    group("Zeitpunkt", [
      textField("release.date", "Datum", {
        type: "date",
        hint: "Ohne Datum greift die Sperre nicht.",
      }),
      textField("release.time", "Uhrzeit", {
        type: "time",
        hint: "Ortszeit in der Schweiz (Europe/Zurich). Sommer- und Winterzeit sind berücksichtigt.",
      }),
      textField("release.zone", "Zeitzone", {
        mono: true,
        placeholder: "Europe/Zurich",
        hint: "Nur ändern, wenn der Start wirklich in einer anderen Zeitzone gilt.",
      }),
    ], { cols: 3 }),
    group("Was auf dem Countdown steht", [
      textField("release.kicker", "Kleine Zeile", { placeholder: "Release" }),
      textField("release.headline", "Überschrift", { placeholder: "Sam Sparking" }),
      textArea("release.text", "Text", {
        rows: 3,
        hint: "Ein, zwei Sätze. Darunter läuft der Zähler in Tagen, Stunden, Minuten und Sekunden.",
      }),
    ], { cols: 2 }),
    group(null, [
      el("p", { class: "field-hint" }, [
        el("strong", {}, "Gut zu wissen: "),
        "Während der Sperre steht der Inhalt der Seite trotzdem im Quelltext — wer ",
        "„Seitenquelltext anzeigen“ wählt, kann ihn lesen. Wirklich unsichtbar wäre er ",
        "nur mit einer Sperre auf dem Server, und die bräuchte genau zum Startzeitpunkt ",
        "einen neuen Deploy. Für Suchmaschinen und normale Besucher ist die Seite bis ",
        "zum Start der Countdown.",
      ]),
    ], { class: "basics" }),
  ]);
}

/* ---------------------------------------------------------- Impressum */

/**
 * Das Impressum ist eine eigene, sehr kurze Seite: /impressum/, /de/impressum/
 * und /fr/impressum/. Es ist kein Abschnitt der Startseite — es steht deshalb
 * nicht in der Abschnittsliste und nicht im Menü, sondern nur im Fussbereich
 * jeder Seite.
 *
 * Bearbeitbar sind die Angaben selbst. Die Aufschriften („E-Mail", „Standort")
 * setzt der Generator je Sprache; beim Standort übersetzt er nur das Landeswort,
 * der Ort bleibt wie er hier steht.
 */
export function renderImpressum() {
  return view([
    head("Impressum", "Die kurze Pflichtseite — verlinkt im Fussbereich jeder Seite."),
    group(null, [
      el("p", { class: "field-hint" }, [
        "Diese Seite steht unter ",
        el("strong", {}, "/impressum/"),
        " und in jeder Sprache unter derselben Adresse. Der Link dazu steht im ",
        "Fussbereich jeder Seite. Absichtlich knapp: nur Name, E-Mail und Standort.",
      ]),
    ], { class: "basics" }),
    group("Angaben", [
      textField("imprint.email", "E-Mail", {
        type: "email",
        placeholder: "info@samsparking.ch",
        hint: "Leer = die E-Mail aus dem Kontakt-Abschnitt wird verwendet.",
      }),
      textField("imprint.location", "Standort", {
        placeholder: "Herisau, Schweiz",
        hint:
          "Ort und Land, ohne Strasse und Hausnummer. Das Landeswort übersetzt die " +
          "Website selbst — aus „Herisau, Schweiz“ wird auf /fr/ „Herisau, Suisse“.",
      }),
    ], { cols: 2 }),
    group(null, [
      el("p", { class: "field-hint" }, [
        "Der Künstlername kommt aus „Start & Design“. Weitere Pflichtangaben ",
        "(Handelsregister, Mehrwertsteuernummer, Postadresse) stehen bewusst nicht ",
        "auf der Seite — sie sind nicht bekannt und werden nicht erfunden. Brauchst du ",
        "sie, trag sie hier ein, sobald sie feststehen.",
      ]),
    ], { class: "basics" }),
  ]);
}

/* --------------------------------------- Abschnitt: Join the Movement */

export function renderFollow() {
  return view([
    head(
      "Join the Movement",
      "Der Aufruf gleich nach dem Booking: alle Kanäle an einem Ort, damit niemand suchen muss."
    ),
    nichtGebaut("Join the Movement"),
    kanaeleHinweis(),
    group("Einleitung", [
      textArea("sections.follow.lede", "Text unter dem Titel", {
        rows: 3,
        hint: "Ein, zwei Sätze — warum es sich lohnt, Sam zu folgen.",
      }),
    ]),
    group("Kanäle", [socialsList()], {
      hint:
        "Alle Kanäle stehen gleichwertig nebeneinander — TikTok, Instagram, Mixcloud und was " +
        "noch dazukommt. Es ist dieselbe Liste, die im Fussbereich steht und (wenn angewählt) " +
        "oben im Kopfbereich: einmal gepflegt, überall aktuell.",
    }),
  ]);
}

/**
 * Hinweis, wenn beim Laden Kanäle nachgetragen wurden.
 *
 * Bis zum 11.08.2026 legte der Website-Generator fehlende Kanäle beim Bauen
 * selbst an. In der Datenbank stand davon nichts — die Verwaltung zeigte darum
 * nur „Mixcloud", während auf der Website vier Kanäle standen. Der Generator
 * tut das nicht mehr; damit kein Kanal verloren geht, holt die Verwaltung sie
 * beim Laden in die Liste (kanaele-nachtragen.js). Einmal speichern, und alle
 * drei Stände sind gleich.
 */
function nachtragHinweis() {
  const dazu = S.nachgetragen || [];
  if (!dazu.length) return null;
  const gespeichert = S.nachgetragenGespeichert === true;
  return group(null, [
    el("p", { class: "warn-box" }, [
      el("strong", {}, gespeichert ? "Einmalig nachgetragen und gespeichert. " : "Einmalig nachgetragen. "),
      el("span", {}, [
        "Diese Angaben standen auf der Website, in der Datenbank aber nicht — der ",
        "Website-Generator hatte sie beim Bauen selbst ergänzt. Das tut er nicht mehr: ",
        "die Website zeigt jetzt genau, was hier gespeichert ist. Alles Nachgetragene ",
        "steht als normaler Eintrag da und lässt sich bearbeiten oder löschen. ",
        gespeichert
          ? el("span", {}, [
              "Gespeichert ist es schon — du musst nichts tun. Der Nachtrag läuft nie ",
              "wieder; was du jetzt löschst, bleibt gelöscht.",
            ])
          : el("span", {}, [
              el("strong", {}, "Bitte einmal speichern"),
              " — automatisch ging es gerade nicht. Danach stehen Verwaltung, Vorschau ",
              "und Website auf demselben Stand, und der Nachtrag läuft nie wieder.",
            ]),
      ]),
      el("span", { class: "field-hint" }, dazu.join(" · ")),
    ]),
  ], { class: "basics" });
}

// Alter Name, damit bestehende Aufrufe weiter stimmen.
const kanaeleHinweis = nachtragHinweis;

/**
 * Die Kanalliste. Sie gehört zum Kontakt-Abschnitt (dort liegt sie seit jeher
 * gespeichert), bearbeitet wird sie aber hier — „Join the Movement“ ist der
 * Ort, an dem die Kanäle auf der Website gross herauskommen.
 */
function socialsList() {
  return objectList("sections.contact.socials", null, {
    addLabel: "Kanal hinzufügen",
    newItem: { label: "", handle: "", url: "", inHeader: false },
    titleOf: (i) => [i.label, i.handle].filter(Boolean).join(" — ") || "(leer)",
    emptyText: "Noch kein Kanal.",
    fields: (base) => [
      textField(`${base}.label`, "Kanal", { placeholder: "TikTok" }),
      textField(`${base}.handle`, "Name / Handle", {
        placeholder: "@sam_sparking",
        hint: "Steht klein unter dem Kanal. Leer = nur der Kanalname.",
      }),
      textField(`${base}.url`, "URL", {
        mono: true,
        hint: "Ohne Adresse bleibt der Kanal auf der Website aussen vor.",
      }),
      checkboxField(
        `${base}.inHeader`,
        "Zeichen oben im Kopfbereich zeigen",
        "Im Abschnitt und im Fussbereich steht der Kanal immer. Jeder Kanal bekommt " +
          "sein eigenes Zeichen — Instagram sieht also anders aus als Mixcloud."
      ),
    ],
  });
}

/* ------------------------------------------------------------------ Seiten */

/** Zuordnung der Abschnitte zu einer Seite: an/aus plus Reihenfolge. */
function sectionPicker(basePath) {
  const host = el("div", { class: "picker" });

  const render = () => {
    const page = getPath(S.content, basePath);
    if (!Array.isArray(page.sections)) page.sections = [];
    const chosen = page.sections;
    const all = alleAbschnitte();
    host.innerHTML = "";

    // Zuerst die gewählten in ihrer Reihenfolge, danach der Rest
    chosen.forEach((key, i) => {
      const sec = S.content.sections[key] || {};
      host.appendChild(
        el("div", { class: "pick-row on" }, [
          el("span", { class: "pick-num" }, String(i + 1).padStart(2, "0")),
          el("strong", {}, sec.navLabel || key),
          sec.enabled === false ? el("span", { class: "tag off" }, "ausgeschaltet") : null,
          el("div", { class: "row-tools" }, [
            el("button", { class: "tool", title: "Nach oben", "aria-label": "Nach oben",
              onclick: () => { if (i > 0) { chosen.splice(i - 1, 0, chosen.splice(i, 1)[0]); markDirty(); render(); } } }, "↑"),
            el("button", { class: "tool", title: "Nach unten", "aria-label": "Nach unten",
              onclick: () => { if (i < chosen.length - 1) { chosen.splice(i + 1, 0, chosen.splice(i, 1)[0]); markDirty(); render(); } } }, "↓"),
            el("button", { class: "tool danger", title: "Von dieser Seite nehmen", "aria-label": "Entfernen",
              onclick: () => { chosen.splice(i, 1); markDirty(); render(); } }, "✕"),
          ]),
        ])
      );
    });

    const rest = all.filter((k) => !chosen.includes(k));
    if (rest.length) {
      host.appendChild(
        el("div", { class: "pick-add" }, [
          el("span", { class: "field-label" }, "hinzufügen:"),
          ...rest.map((key) =>
            el("button", { class: "btn ghost sm", onclick: () => { chosen.push(key); markDirty(); render(); } },
              "+ " + (S.content.sections[key]?.navLabel || key))
          ),
        ])
      );
    }
    if (!chosen.length) {
      host.appendChild(el("p", { class: "field-hint" }, "Diese Seite zeigt noch keinen Abschnitt."));
    }
  };
  render();

  return el("div", { class: "field" }, [
    el("label", { class: "field-label" }, "Abschnitte auf dieser Seite"),
    host,
  ]);
}

export function renderPages() {
  const used = new Set((S.content.pages || []).flatMap((p) => p.sections || []));
  const orphan = alleAbschnitte().filter(
    (k) => !used.has(k) && S.content.sections[k]?.enabled !== false
  );

  return view([
    head(
      "Seiten",
      "Aus welchen Seiten die Website besteht und welche Abschnitte auf welcher Seite stehen. Die erste Seite ist immer die Startseite."
    ),
    orphan.length
      ? el(
          "p",
          { class: "warn-box" },
          "Auf keiner Seite eingeplant: " +
            orphan.map((k) => S.content.sections[k]?.navLabel || k).join(", ") +
            " — diese Abschnitte erscheinen nirgends."
        )
      : null,
    group(null, [
      objectList("pages", null, {
        addLabel: "Seite hinzufügen",
        newItem: {
          slug: "",
          navLabel: "Neue Seite",
          title: "Neue Seite",
          enabled: true,
          hero: "compact",
          ticker: false,
          inNav: true,
          sections: [],
          seo: { title: "", description: "" },
        },
        titleOf: (p, i) =>
          (i === 0 ? "/ — " : "/" + (p.slug || "?") + "/ — ") + (p.navLabel || "(ohne Namen)"),
        emptyText: "Keine Seiten — die Website wird dann als einzelne Seite gebaut.",
        fields: (base, item, i) => [
          checkboxField(
            `${base}.enabled`,
            "Seite auf der Website veröffentlichen",
            "Ausgeschaltet steht die Seite weiter hier in der Verwaltung, wird aber " +
              "nicht gebaut und taucht auch im Menü nicht auf."
          ),
          textField(`${base}.navLabel`, "Name im Menü"),
          i === 0
            ? el("div", { class: "field" }, [
                el("label", { class: "field-label" }, "Adresse"),
                el("p", { class: "mono-input" }, "/  (Startseite)"),
              ])
            : textField(`${base}.slug`, "Adresse", {
                mono: true,
                placeholder: "shows",
                hint:
                  "Ergibt " +
                  (item.slug ? "/" + item.slug + "/" : "eine Adresse") +
                  " — nur Kleinbuchstaben, Zahlen und Bindestriche.",
              }),
          textField(`${base}.title`, "Überschrift auf der Seite"),
          selectField(`${base}.hero`, "Kopfbereich", [
            ["full", "gross (Bild/Video, ganzer Bildschirm)"],
            ["compact", "schmal (nur Titel)"],
            ["none", "keiner"],
          ]),
          checkboxField(`${base}.inNav`, "Im Menü zeigen"),
          checkboxField(`${base}.ticker`, "Lauftext-Ticker zeigen"),
          sectionPicker(base),
          textField(`${base}.seo.title`, "Titel bei Google", {
            maxlength: 70,
            hint: "Leer = wird aus Seitenname und Künstlername gebaut.",
          }),
          textArea(`${base}.seo.description`, "Beschreibung bei Google", { rows: 2, maxlength: 300 }),
        ],
      }),
    ]),
  ]);
}

/* ----------------------------------------------- Abschnitte & Reihenfolge */

/**
 * Jeder Abschnitt, den es im Inhalt gibt, steht hier — auch die, die gerade
 * auf keiner Seite eingeplant sind. Sonst verschwindet ein ausgeschalteter
 * Abschnitt aus der Verwaltung und lässt sich nie wieder einschalten.
 */
function alleAbschnitte() {
  if (!Array.isArray(S.content.layout)) S.content.layout = [];
  const layout = S.content.layout;
  const rest = Object.keys(S.content.sections || {}).filter((k) => !layout.includes(k));
  return layout.concat(rest);
}

export function renderLayout() {
  const host = el("div", { class: "layout-list" });
  const totes = el("div", { class: "layout-list" });
  const hinweis = el("div", {});

  const render = () => {
    const modell = abschnittsModell(S.content);
    host.innerHTML = "";
    totes.innerHTML = "";
    hinweis.innerHTML = "";

    /* Der geladene Stand ist noch der alte Einseiter. Der Generator stellt das
       beim Bauen still um — die Verwaltung zeigte davon nichts und behauptete
       damit, Booking und Shop seien Abschnitte der Startseite. Lieber sagen,
       was ist, und die Umstellung anbieten, als sie hinter dem Rücken zu
       machen: geschrieben wird erst beim Speichern. */
    if (modell.einseiter) {
      hinweis.appendChild(
        el("div", { class: "warn-box" }, [
          el("strong", {}, "Dieser Stand ist noch das alte Ein-Seiten-Modell. "),
          el("span", {}, [
            "Die ausgelieferte Website hat seit August 2026 eigene Seiten für Booking und ",
            "Shop; der Generator rechnet das beim Bauen um. Hier steht noch der alte Stand, ",
            "deshalb sehen Reihenfolge und Nummern anders aus als auf der Seite.",
          ]),
          el(
            "button",
            {
              class: "btn sm",
              onclick: () => {
                if (!aufMehrseitigStellen(S.content, S.defaults)) {
                  toast("Die Vorlage kennt das Mehrseiten-Modell nicht.", "err");
                  return;
                }
                markDirty();
                toast("Auf Startseite, /booking/ und /shop/ umgestellt — noch nicht gespeichert.");
                render();
              },
            },
            "Auf das Mehrseiten-Modell umstellen"
          ),
        ])
      );
    }

    if (modell.ohneSeite.length) {
      hinweis.appendChild(
        el(
          "p",
          { class: "warn-box" },
          "Eingeschaltet, aber auf keiner Seite eingeplant: " +
            modell.ohneSeite.join(", ") +
            " — diese Abschnitte erscheinen nirgends. Unter „Seiten“ zuordnen."
        )
      );
    }

    for (const eintrag of modell.aufDerWebsite) {
      const sec = S.content.sections[eintrag.key] || {};
      const toggle = el("input", {
        type: "checkbox",
        onchange: (e) => {
          sec.enabled = e.target.checked;
          if (e.target.checked) einplanen(eintrag.key);
          markDirty();
          render();
        },
      });
      toggle.checked = eintrag.enabled;
      host.appendChild(
        el("div", { class: "layout-row" + (eintrag.enabled ? "" : " off") }, [
          el("span", { class: "layout-num" }, eintrag.nummer ? String(eintrag.nummer).padStart(2, "0") : "—"),
          el("strong", { class: "layout-name" }, eintrag.navLabel),
          el("span", { class: "layout-key mono-input" }, "#" + eintrag.key),
          // Statt einer Gesamt-Nummer: auf welcher Seite der Abschnitt steht.
          // Booking und Shop sind eigene Seiten, keine Abschnitte der Startseite.
          el(
            "span",
            { class: "tag" + (eintrag.seite ? "" : " off") },
            eintrag.seite ? eintrag.seite : "keiner Seite zugeordnet"
          ),
          el("label", { class: "check" }, [toggle, el("span", {}, eintrag.enabled ? "sichtbar" : "aus")]),
          el("div", { class: "row-tools" }, [
            el("button", { class: "tool", title: "Nach oben", "aria-label": "Nach oben",
              onclick: () => move(eintrag.key, -1) }, "↑"),
            el("button", { class: "tool", title: "Nach unten", "aria-label": "Nach unten",
              onclick: () => move(eintrag.key, 1) }, "↓"),
          ]),
        ])
      );
    }

    for (const eintrag of modell.stillgelegt) {
      totes.appendChild(
        el("div", { class: "layout-row off" }, [
          el("span", { class: "layout-num" }, "—"),
          el("strong", { class: "layout-name" }, eintrag.navLabel),
          el("span", { class: "layout-key mono-input" }, "#" + eintrag.key),
          el("span", { class: "tag off" }, "nicht mehr Teil der Website"),
        ])
      );
    }
  };

  /**
   * Ein wieder eingeschalteter Abschnitt muss auch irgendwo stehen: fehlt er
   * in der Reihenfolge oder auf jeder Seite, erscheint er sonst trotz Häkchen
   * nirgends. Er gehört dabei auf SEINE Seite — Booking auf /booking/, Shop
   * auf /shop/. Früher landete alles auf der Startseite; damit stand der Shop
   * plötzlich wieder mitten auf der Startseite.
   */
  const einplanen = (key) => {
    if (!Array.isArray(S.content.layout)) S.content.layout = [];
    if (!S.content.layout.includes(key)) S.content.layout.push(key);
    const ziel = zielSeiteFuer(S.content, key);
    if (!ziel) return;
    if (!Array.isArray(ziel.sections)) ziel.sections = [];
    if (!ziel.sections.includes(key)) ziel.sections.push(key);
  };

  const move = (key, delta) => {
    const layout = S.content.layout;
    const from = layout.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= layout.length) return;
    layout.splice(to, 0, layout.splice(from, 1)[0]);
    markDirty();
    render();
  };
  render();

  const stillgelegte = abschnittsModell(S.content).stillgelegt;

  return view([
    head(
      "Abschnitte & Reihenfolge",
      "Jeder Abschnitt der Website steht hier — auch die ausgeschalteten. Das Häkchen " +
        "entscheidet, ob er in der Live-Fassung erscheint; die Pfeile bestimmen die " +
        "Reihenfolge. Die Nummer (01, 02, …) zählt je Seite, genau wie auf der Website."
    ),
    hinweis,
    group(null, [host]),
    stillgelegte.length
      ? group("Nicht mehr Teil der Website", [
          totes,
          el(
            "p",
            { class: "field-hint" },
            "Diese Abschnitte liegen noch im Inhalt, aber der Website-Generator baut sie " +
              "nicht mehr — ein Häkchen hier hätte keine Wirkung. Ihre Texte bleiben " +
              "erhalten; kommt ein Abschnitt zurück, muss er auch im Generator zurückkommen."
          ),
        ])
      : null,
    group("Beschriftungen", [
      ...abschnittsModell(S.content).aufDerWebsite.map(({ key }) =>
        el("div", { class: "label-row" }, [
          el("span", { class: "label-key" }, key),
          textField(`sections.${key}.navLabel`, "Menü", { class: "inline" }),
          textField(`sections.${key}.title`, "Überschrift, Teil 1 (weiss)", { class: "inline" }),
          textField(`sections.${key}.titleAccent`, "Teil 2 (Akzentfarbe)", { class: "inline" }),
        ])
      ),
    ], { hint: "Die Überschrift wird zweifarbig gesetzt: „Boo“ + „king.“ ergibt BOOKING. mit farbigem Ende." }),
  ]);
}

/**
 * Kopfhinweis für Abschnitte, die der Website-Generator nicht mehr baut.
 * Steht anstelle des Sichtbarkeits-Schalters: ein Häkchen wäre hier eine
 * Zusage, die die Website nicht einhält — genau daran ist am 10.08.2026
 * aufgefallen, dass „Sound & Genres" und „Erlebnis" sich einschalten liessen,
 * ohne je auf der Seite zu erscheinen.
 */
function nichtGebaut(was) {
  return group(null, [
    el("p", { class: "warn-box" }, [
      el("strong", {}, "Nicht mehr auf der Website. "),
      el("span", {}, [
        `„${was}" wird vom Website-Generator nicht mehr gebaut — die Texte hier bleiben `,
        "erhalten und gehen nicht verloren, erscheinen aber auf keiner Seite. Ein ",
        "Sichtbarkeits-Häkchen gibt es deshalb nicht: es hätte keine Wirkung. Soll der ",
        "Abschnitt zurück, muss er zuerst im Generator zurückkommen (BAUBAR in ",
        "s-mi/scripts/build.mjs).",
      ]),
    ]),
  ], { class: "basics" });
}

/** Sichtbarkeits-Schalter, den jede Abschnitts-Ansicht oben zeigt. */
function sectionBasics(key) {
  return group(null, [
    checkboxField(`sections.${key}.enabled`, "Abschnitt auf der Website anzeigen"),
  ], { class: "basics" });
}
