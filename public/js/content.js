/* ==========================================================================
   Inhalts-Editoren — je Website-Abschnitt eine Ansicht
   ========================================================================== */

import { el, getPath, setPath, toast } from "./util.js";
import { pickMany } from "./media.js";
import { S, markDirty } from "./store.js";
import {
  textField,
  textArea,
  checkboxField,
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
      textField("site.photoCredit", "Fotograf/in (Footer)"),
      selectField("site.lang", "Sprache der Seite", [
        ["en", "Englisch"],
        ["de", "Deutsch"],
      ]),
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
    heroBackground(),
    group("Lauftext-Ticker", [
      checkboxField("ticker.enabled", "Ticker anzeigen"),
      objectList("ticker.items", "Wörter", {
        addLabel: "+ Wortpaar",
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
      imageField("hero.media", isVideo ? "Video-Datei" : "Bild", {
        kind: isVideo ? "video" : "image",
        pickLabel: isVideo ? "Video wählen" : "Bild wählen",
        emptyText: isVideo ? "kein Video" : "kein Bild",
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
        addLabel: "+ Keyword",
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
    group("Bild", [imageField("sections.about.photo", "Portrait", { credit: true, kind: "image" })]),
    group("Text", [
      textArea("sections.about.lede", "Einstieg (gross gesetzt)", { rows: 3 }),
      stringList("sections.about.paragraphs", "Absätze", {
        multiline: true,
        rows: 5,
        addLabel: "+ Absatz",
        hint: "**doppelte Sternchen** machen fett, [Text](https://…) macht einen Link.",
      }),
      stringList("sections.about.words", "Stichworte (Kacheln)", { addLabel: "+ Stichwort" }),
    ]),
    group("Fakten-Leiste", [
      objectList("sections.about.facts", null, {
        addLabel: "+ Fakt",
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

/* ------------------------------------------------------- Abschnitt: Sound */

export function renderSound() {
  return view([
    head("Sound & Mixe", "Genres und veröffentlichte Sets."),
    sectionBasics("sound"),
    group("Genres", [
      objectList("sections.sound.genres", null, {
        addLabel: "+ Genre",
        newItem: { name: "", meta: "Genre" },
        titleOf: (i) => i.name || "(leer)",
        fields: (base) => [
          textField(`${base}.name`, "Genre"),
          textField(`${base}.meta`, "Beschriftung rechts", { placeholder: "Genre" }),
        ],
      }),
      textField("sections.sound.note", "Satz unter den Genres"),
    ]),
    group("Mixe", [
      objectList("sections.sound.mixes", null, {
        addLabel: "+ Mix",
        newItem: { kicker: "Latest Mix", title: "", text: "", linkLabel: "Listen", linkUrl: "", embedUrl: "" },
        titleOf: (i) => i.title || "(ohne Titel)",
        emptyText: "Keine Mixe.",
        fields: (base) => [
          textField(`${base}.kicker`, "Kleine Zeile oben", { placeholder: "Latest Mix" }),
          textField(`${base}.title`, "Titel"),
          textArea(`${base}.text`, "Kurzbeschreibung", { rows: 2 }),
          textField(`${base}.linkLabel`, "Button-Text", { placeholder: "Listen on Mixcloud" }),
          textField(`${base}.linkUrl`, "Button-Link", { mono: true }),
          textField(`${base}.embedUrl`, "Player einbetten (optional)", {
            mono: true,
            hint: "Embed-URL von Mixcloud/SoundCloud/Spotify. Leer = nur Button.",
          }),
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
      } — vergangene rutschen automatisch nach unten und verschwinden aus der Google-Anzeige.`
    ),
    sectionBasics("shows"),
    group("Übersicht", [cal], {
      hint: "Klick auf die Pfeile blättert durch die Monate. Punkte sind Termine.",
    }),
    group("Termine", [
      objectList("sections.shows.items", null, {
        addLabel: "+ Termin",
        newItem: {
          date: "",
          name: "",
          venue: "",
          city: "",
          country: "CH",
          ticketUrl: "",
          ticketLabel: "Tickets",
          status: "confirmed",
        },
        titleOf: (i) => [i.date, i.name].filter(Boolean).join("  ·  ") || "(neuer Termin)",
        emptyText: "Noch keine Termine — die Website zeigt dann den Platzhaltertext.",
        onChange: () => cal._redraw(),
        fields: (base) => [
          textField(`${base}.date`, "Datum", { type: "date" }),
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
      selectField("sections.shows.view", "Anzeige", [
        ["calendar", "Kalender und Liste"],
        ["list", "nur Liste"],
      ]),
      textField("sections.shows.emptyText", "Text ohne Termine"),
      textField("sections.shows.pastLabel", "Beschriftung „vergangene Shows“"),
    ], { cols: 2 }),
  ]);
}

/* -------------------------------------------------- Abschnitt: Referenzen */

export function renderReferences() {
  return view([
    head("Referenzen", "Wo Sam schon gespielt hat."),
    sectionBasics("references"),
    group("Liste", [
      objectList("sections.references.items", null, {
        addLabel: "+ Referenz",
        newItem: { name: "", city: "", url: "" },
        titleOf: (i) => [i.name, i.city].filter(Boolean).join(" — ") || "(leer)",
        fields: (base) => [
          textField(`${base}.name`, "Club / Festival"),
          textField(`${base}.city`, "Ort"),
          textField(`${base}.url`, "Link (optional)", { mono: true, hint: "Leer = führt zum Booking-Abschnitt." }),
        ],
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
    head("Galerie", "Bilder im Masonry-Raster mit Lightbox."),
    sectionBasics("gallery"),
    group("Bilder", [
      objectList("sections.gallery.items", null, {
        addLabel: "+ leeres Bild",
        newItem: { src: "", alt: "", credit: "" },
        titleOf: (i, n) => i.alt || `Bild ${n + 1}`,
        emptyText: "Keine Bilder.",
        extraAdd: [
          {
            label: "+ Aus Medien hinzufügen",
            onClick: async (items, render) => {
              const chosen = await pickMany({ kind: "image" });
              if (!chosen || !chosen.length) return;
              chosen.forEach((m) =>
                items.push({ src: m.url, alt: m.alt || "", credit: getPath(S.content, "site.photoCredit") || "" })
              );
              markDirty();
              render();
              toast(`${chosen.length} Bild(er) hinzugefügt`);
            },
          },
        ],
        fields: (base) => [
          imageField(base, null, { credit: true, kind: "image" }),
        ],
      }),
    ]),
  ]);
}

/* ----------------------------------------------------- Abschnitt: Booking */

export function renderBooking() {
  return view([
    head("Booking", "Verfügbarkeit, Rider, Presskit und das Anfrage-Formular."),
    sectionBasics("booking"),
    group("Verfügbar für", [
      textField("sections.booking.availableKicker", "Kleine Zeile"),
      stringList("sections.booking.available", "Einträge", { addLabel: "+ Eintrag" }),
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
    group("Rider (technische Anforderungen)", [
      textField("sections.booking.rider.kicker", "Kleine Zeile"),
      objectList("sections.booking.rider.groups", "Gruppen", {
        addLabel: "+ Gruppe",
        newItem: { title: "", items: [] },
        titleOf: (i) => i.title || "(neue Gruppe)",
        fields: (base) => [
          textField(`${base}.title`, "Titel", { placeholder: "CDJs — 4× required" }),
          objectList(`${base}.items`, "Geräte", {
            addLabel: "+ Gerät",
            newItem: { name: "", meta: "" },
            titleOf: (i) => i.name || "(leer)",
            confirmDelete: false,
            fields: (b2) => [
              textField(`${b2}.name`, "Gerät"),
              textField(`${b2}.meta`, "Hinweis rechts", { placeholder: "1st choice" }),
            ],
          }),
        ],
      }),
      textArea("sections.booking.rider.note", "Hinweis-Box", { rows: 3 }),
    ]),
  ]);
}

/* ----------------------------------------------------- Abschnitt: Kontakt */

export function renderContact() {
  return view([
    head("Kontakt", "Wie Veranstalter Sam erreichen."),
    sectionBasics("contact"),
    group("Kontaktdaten", [
      textField("sections.contact.kicker", "Kleine Zeile"),
      textField("sections.contact.email", "E-Mail", { type: "email" }),
      textField("sections.contact.phone", "Telefon"),
      textField("sections.contact.base", "Standort"),
    ], { cols: 2 }),
    group("Social Media & Musik", [
      objectList("sections.contact.socials", null, {
        addLabel: "+ Link",
        newItem: { label: "", url: "" },
        titleOf: (i) => i.label || "(leer)",
        hint: "Instagram, Mixcloud, SoundCloud, Spotify, YouTube …",
        fields: (base) => [
          textField(`${base}.label`, "Name"),
          textField(`${base}.url`, "URL", { mono: true }),
        ],
      }),
    ]),
  ]);
}

/* ------------------------------------------------------------------ Seiten */

/** Zuordnung der Abschnitte zu einer Seite: an/aus plus Reihenfolge. */
function sectionPicker(basePath) {
  const host = el("div", { class: "picker" });

  const render = () => {
    const page = getPath(S.content, basePath);
    if (!Array.isArray(page.sections)) page.sections = [];
    const chosen = page.sections;
    const all = S.content.layout || Object.keys(S.content.sections || {});
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
  const orphan = (S.content.layout || []).filter(
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
        addLabel: "+ Seite",
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

export function renderLayout() {
  const host = el("div", { class: "layout-list" });

  const render = () => {
    const layout = S.content.layout;
    host.innerHTML = "";
    layout.forEach((key, i) => {
      const sec = S.content.sections[key] || {};
      const on = sec.enabled !== false;
      const toggle = el("input", {
        type: "checkbox",
        onchange: (e) => {
          sec.enabled = e.target.checked;
          markDirty();
          render();
        },
      });
      toggle.checked = on;
      host.appendChild(
        el("div", { class: "layout-row" + (on ? "" : " off") }, [
          el("span", { class: "layout-num" }, on ? String(numberOf(layout, key)).padStart(2, "0") : "—"),
          el("strong", { class: "layout-name" }, sec.navLabel || key),
          el("span", { class: "layout-key mono-input" }, "#" + key),
          el("label", { class: "check" }, [toggle, el("span", {}, on ? "sichtbar" : "aus")]),
          el("div", { class: "row-tools" }, [
            el("button", {
              class: "tool", title: "Nach oben", "aria-label": "Nach oben",
              onclick: () => move(i, i - 1),
            }, "↑"),
            el("button", {
              class: "tool", title: "Nach unten", "aria-label": "Nach unten",
              onclick: () => move(i, i + 1),
            }, "↓"),
          ]),
        ])
      );
    });
  };
  const move = (from, to) => {
    const layout = S.content.layout;
    if (to < 0 || to >= layout.length) return;
    const [k] = layout.splice(from, 1);
    layout.splice(to, 0, k);
    markDirty();
    render();
  };
  const numberOf = (layout, key) =>
    layout.filter((k) => S.content.sections[k]?.enabled !== false).indexOf(key) + 1;
  render();

  return view([
    head(
      "Abschnitte & Reihenfolge",
      "Reihenfolge auf der Seite, Sichtbarkeit und die Beschriftung im Menü. Die Nummerierung (01, 02, …) und die Navigation richten sich automatisch danach."
    ),
    group(null, [host]),
    group("Beschriftungen", [
      ...(S.content.layout || []).map((key) =>
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

/** Sichtbarkeits-Schalter, den jede Abschnitts-Ansicht oben zeigt. */
function sectionBasics(key) {
  return group(null, [
    checkboxField(`sections.${key}.enabled`, "Abschnitt auf der Website anzeigen"),
  ], { class: "basics" });
}
