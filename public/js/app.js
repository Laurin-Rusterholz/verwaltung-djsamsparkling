/* ==========================================================================
   Verwaltung DJ Sam Sparking — App-Rahmen, Navigation, Dashboard
   ========================================================================== */

import { DEFAULT_SITE_URL, PATHS, RTDB_URL, DEMO } from "./config.js";
import { el, $, toast, relativeTime, formatDate, confirmDialog } from "./util.js";
import {
  S,
  initFirebase,
  getAuth,
  signInWithPassword,
  hasAccess,
  signOut,
  loadAll,
  saveContent,
  saveConfig,
  publish,
  listVersions,
  restoreVersion,
  resetToDefaults,
  onChange,
} from "./store.js";
import {
  renderDesign,
  renderSeo,
  renderAbout,
  renderShows,
  renderReferences,
  renderGallery,
  renderShop,
  renderSound,
  renderExperience,
  renderBooking,
  renderContact,
  renderLayout,
  renderPages,
} from "./content.js";
import { renderMedia, mediaList, usageCount, notifyMediaChanged, notifyUploadsChanged } from "./media.js";
import { renderInbox, openCount, inquiryList } from "./inbox.js";
import { renderI18n, translationSummary, LANG_LABEL } from "./i18n.js";
import { renderPreview } from "./wish.js";
import { checkKey } from "./ai.js";

/* ------------------------------------------------------------------ views */

/**
 * Kleine Strichzeichnungen für die Navigation. Sie erben die Farbe vom
 * Menüpunkt, deshalb reicht ein einziges Gerüst für alle.
 */
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICON = {
  dashboard: svg(
    '<rect x="3" y="3" width="7" height="8" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/>' +
      '<rect x="14" y="11" width="7" height="10" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/>'
  ),
  eye: svg('<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
  spark: svg('<path d="m12 3 2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2Z"/><path d="m18.6 15.4.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  page: svg('<path d="M6 3h7l5 5v13H6z"/><path d="M13 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
  layout: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 3.7 5.6 3.7 9S14.4 18.4 12 21c-2.4-2.6-3.7-5.6-3.7-9S9.6 5.6 12 3Z"/>'),
  user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1-3.6 3.9-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>'),
  music: svg('<path d="M9 18V6l11-2v12"/><circle cx="6.4" cy="18" r="2.6"/><circle cx="17.4" cy="16" r="2.6"/>'),
  bolt: svg('<path d="M13 2 4.5 14H10l-1 8 9.5-12H13z"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  star: svg('<path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>'),
  bag: svg('<path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
  clipboard: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3.5H9z"/><path d="m9.5 13 2 2 3.5-4"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/>'),
  media: svg('<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M17 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"/>'),
  inbox: svg('<path d="M4.5 5h15l1.5 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>'),
  upload: svg('<path d="M12 16V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.1"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>'),
};

const NAV = [
  {
    group: "Übersicht",
    items: [
      { id: "dashboard", label: "Dashboard", icon: ICON.dashboard, render: renderDashboard },
      { id: "preview", label: "Website & Wünsche", icon: ICON.eye, render: renderPreview },
    ],
  },
  {
    group: "Website",
    items: [
      { id: "design", label: "Start & Design", icon: ICON.spark, render: renderDesign },
      { id: "seo", label: "SEO & Teilen", icon: ICON.search, render: renderSeo },
      { id: "pages", label: "Seiten", icon: ICON.page, render: renderPages },
      { id: "layout", label: "Abschnitte", icon: ICON.layout, render: renderLayout },
      {
        id: "i18n",
        label: "Sprachen",
        icon: ICON.globe,
        render: renderI18n,
        badge: () => translationSummary().reduce((n, l) => n + l.missing + l.stale, 0),
      },
    ],
  },
  {
    group: "Abschnitte",
    items: [
      { id: "about", label: "About", icon: ICON.user, render: renderAbout },
      { id: "shows", label: "Shows", icon: ICON.calendar, render: renderShows },
      { id: "references", label: "Referenzen", icon: ICON.star, render: renderReferences },
      { id: "gallery", label: "Galerie", icon: ICON.image, render: renderGallery },
      { id: "sound", label: "Sound & Genres", icon: ICON.music, render: renderSound },
      { id: "experience", label: "Erlebnis", icon: ICON.bolt, render: renderExperience },
      { id: "shop", label: "Shop", icon: ICON.bag, render: renderShop },
      { id: "booking", label: "Booking", icon: ICON.clipboard, render: renderBooking },
      { id: "contact", label: "Kontakt", icon: ICON.mail, render: renderContact },
    ],
  },
  {
    group: "Verwaltung",
    items: [
      { id: "media", label: "Medien", icon: ICON.media, render: renderMedia },
      { id: "inbox", label: "Anfragen", icon: ICON.inbox, render: renderInbox, badge: () => openCount() },
      { id: "publish", label: "Publizieren", icon: ICON.upload, render: renderPublish },
      { id: "settings", label: "Einstellungen", icon: ICON.gear, render: renderSettings },
    ],
  },
];

const allItems = () => NAV.flatMap((g) => g.items);
let currentId = "dashboard";

/* ---------------------------------------------------------------- dashboard */

function statCard(label, value, note, cls = "") {
  return el("div", { class: "stat " + cls }, [
    el("span", { class: "stat-label" }, label),
    el("strong", { class: "stat-value" }, value),
    note ? el("span", { class: "stat-note" }, note) : null,
  ]);
}

function checklist() {
  const c = S.content;
  const items = [];
  const add = (ok, text, target) => items.push({ ok, text, target });

  add(!!S.config.buildHook, "Netlify-Build-Hook hinterlegt (sonst wirkt Publizieren nicht)", "settings");
  add(
    (c.site.description || "").length >= 120 && (c.site.description || "").length <= 170,
    "Meta-Description hat eine gute Länge",
    "seo"
  );
  const shows = (c.sections.shows?.items || []).filter(
    (i) => !i.date || i.date >= new Date().toISOString().slice(0, 10)
  );
  add(shows.length > 0, "Mindestens ein kommender Termin eingetragen", "shows");
  const gal = c.sections.gallery?.items || [];
  add(gal.length > 0 && gal.every((g) => g.src), "Alle Galerie-Plätze haben ein Bild", "gallery");
  add(gal.every((g) => (g.alt || "").length > 3), "Alle Galeriebilder haben einen Alt-Text (SEO)", "gallery");
  add(!!c.sections.contact?.email, "Kontakt-E-Mail gesetzt", "contact");
  add((c.sections.contact?.socials || []).length >= 2, "Mindestens zwei Social-Links", "contact");
  add(
    !String(c.hero?.media?.src || "").startsWith("img/"),
    "Hero-Bild ist ein eigenes Foto (nicht der Platzhalter aus dem Repo)",
    "design"
  );
  const onPages = new Set((c.pages || []).flatMap((p) => p.sections || []));
  add(
    !(c.pages || []).length ||
      (c.layout || []).every((k) => c.sections[k]?.enabled === false || onPages.has(k)),
    "Jeder sichtbare Abschnitt ist einer Seite zugeordnet",
    "pages"
  );
  translationSummary().forEach((l) =>
    add(
      !l.missing && !l.stale,
      `${LANG_LABEL[l.lang] || l.lang} ist vollständig übersetzt` +
        (l.missing || l.stale
          ? ` (${[l.missing ? l.missing + " fehlen" : "", l.stale ? l.stale + " veraltet" : ""]
              .filter(Boolean)
              .join(", ")})`
          : ""),
      "i18n"
    )
  );

  return el("div", { class: "check-list" }, [
    el("h3", { class: "group-title" }, "Checkliste"),
    ...items.map((i) =>
      el("div", { class: "check-item " + (i.ok ? "ok" : "todo") }, [
        el("span", { class: "check-dot" }, i.ok ? "✓" : "!"),
        el("span", {}, i.text),
        i.ok ? null : el("button", { class: "link", onclick: () => go(i.target) }, "hin"),
      ])
    ),
  ]);
}

function renderDashboard() {
  const c = S.content;
  const today = new Date().toISOString().slice(0, 10);
  const shows = (c.sections.shows?.items || [])
    .filter((i) => i.date && i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = shows[0];
  const open = openCount();
  const siteUrl = S.config.siteUrl || DEFAULT_SITE_URL;

  return el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h2", {}, "Hoi Sam"),
        el("p", { class: "muted" }, "Alles über Sam Sparking an einem Ort."),
      ]),
    ]),
    el("div", { class: "stats" }, [
      statCard(
        "Stand",
        S.dirty ? "ungespeichert" : "gespeichert",
        S.content.updatedAt ? "zuletzt " + relativeTime(S.content.updatedAt) : "noch nie gespeichert",
        S.dirty ? "warn" : "ok"
      ),
      statCard(
        "Publiziert",
        S.config.lastPublish ? relativeTime(S.config.lastPublish) : "noch nie",
        S.config.buildHook ? "Build-Hook aktiv" : "kein Build-Hook",
        S.config.buildHook ? "" : "warn"
      ),
      statCard("Neue Anfragen", String(open), open ? "warten auf Antwort" : "alles beantwortet", open ? "warn" : "ok"),
      statCard(
        "Nächste Show",
        next ? formatDate(next.date) : "—",
        next ? [next.name, next.city].filter(Boolean).join(", ") : "kein Termin eingetragen"
      ),
      statCard("Bilder", String(mediaList().length), mediaList().filter((m) => !usageCount(m.url)).length + " unbenutzt"),
      (() => {
        const langs = translationSummary();
        const offen = langs.reduce((n, l) => n + l.missing + l.stale, 0);
        return statCard(
          "Sprachen",
          String(1 + langs.length),
          langs.length ? (offen ? offen + " Texte offen" : "alles übersetzt") : "nur Deutsch",
          langs.length && offen ? "warn" : "ok"
        );
      })(),
      statCard(
        "Seiten",
        String((c.pages || []).filter((p) => p.enabled !== false).length || 1),
        (c.layout || []).filter((k) => c.sections[k]?.enabled !== false).length + " Abschnitte sichtbar"
      ),
    ]),
    el("div", { class: "quick" }, [
      el("button", { class: "btn solid", onclick: doPublish }, "Speichern & publizieren"),
      el("a", { class: "btn ghost", href: siteUrl, target: "_blank", rel: "noopener" }, "Website öffnen"),
      el("button", { class: "btn ghost", onclick: () => go("shows") }, "Termin hinzufügen"),
      open ? el("button", { class: "btn ghost", onclick: () => go("inbox") }, `${open} Anfrage(n) ansehen`) : null,
    ]),
    checklist(),
    open
      ? el("div", { class: "group" }, [
          el("h3", { class: "group-title" }, "Neueste Anfragen"),
          el(
            "div",
            { class: "inq-list" },
            inquiryList()
              .slice(0, 3)
              .map((q) =>
                el("div", { class: "mini-inq", onclick: () => go("inbox") }, [
                  el("strong", {}, q.name || "(ohne Name)"),
                  el("span", { class: "muted" }, [q.event, q.city, q.date].filter(Boolean).join(" · ")),
                  el("span", { class: "muted" }, relativeTime(q.createdAt)),
                ])
              )
          ),
        ])
      : null,
  ]);
}

/* ------------------------------------------------------------- publizieren */

function renderPublish() {
  const versionHost = el("div", { class: "versions" }, [el("p", { class: "muted" }, "lade …")]);

  listVersions()
    .then((versions) => {
      versionHost.innerHTML = "";
      if (!versions.length) {
        versionHost.appendChild(el("p", { class: "empty" }, "Noch nichts publiziert."));
        return;
      }
      versions.forEach((v, i) => {
        versionHost.appendChild(
          el("div", { class: "ver-row" }, [
            el("span", { class: "ver-when" }, formatDate(v.at, true)),
            el("span", { class: "muted" }, v.by || ""),
            i === 0 ? el("span", { class: "badge b-confirmed" }, "aktuell") : null,
            el(
              "button",
              {
                class: "btn ghost sm",
                onclick: async () => {
                  if (
                    !(await confirmDialog(
                      "Diesen Stand zurückholen?",
                      "Der Inhalt von " +
                        formatDate(v.at, true) +
                        " wird in den Editor geladen. Gespeichert wird erst, wenn du auf Speichern klickst.",
                      "Zurückholen"
                    ))
                  )
                    return;
                  restoreVersion(v);
                  toast("Stand geladen — noch nicht gespeichert");
                  go("dashboard");
                },
              },
              "zurückholen"
            ),
          ])
        );
      });
    })
    .catch((e) => {
      versionHost.innerHTML = "";
      versionHost.appendChild(el("p", { class: "empty" }, "Verlauf nicht lesbar: " + e.message));
    });

  const importInput = el("input", {
    type: "file",
    accept: "application/json",
    class: "sr-only",
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.site) throw new Error("Datei enthält kein site-Objekt");
        if (!(await confirmDialog("Inhalt ersetzen?", file.name, "Ersetzen"))) return;
        restoreVersion({ content: data });
        toast("Datei geladen — noch nicht gespeichert");
        go("dashboard");
      } catch (err) {
        toast("Import fehlgeschlagen: " + err.message, "err");
      }
    },
  });

  return el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h2", {}, "Publizieren"),
        el(
          "p",
          { class: "muted" },
          "Speichern schreibt in die Datenbank. Publizieren speichert und lässt Netlify die Website neu bauen — erst danach sind die Änderungen öffentlich sichtbar."
        ),
      ]),
    ]),
    el("div", { class: "group" }, [
      el("div", { class: "quick" }, [
        el("button", { class: "btn solid", onclick: doPublish }, "Jetzt publizieren"),
        el("button", { class: "btn ghost", onclick: doSave }, "Nur speichern"),
        el(
          "a",
          {
            class: "btn ghost",
            href: S.config.siteUrl || DEFAULT_SITE_URL,
            target: "_blank",
            rel: "noopener",
          },
          "Website ansehen"
        ),
      ]),
      S.config.buildHook
        ? null
        : el(
            "p",
            { class: "warn-box" },
            "Kein Build-Hook hinterlegt: Publizieren speichert nur. Unter Einstellungen die Netlify-Build-Hook-URL eintragen."
          ),
    ]),
    el("div", { class: "group" }, [el("h3", { class: "group-title" }, "Verlauf"), versionHost]),
    el("div", { class: "group" }, [
      el("h3", { class: "group-title" }, "Sicherung"),
      el("div", { class: "quick" }, [
        el(
          "button",
          {
            class: "btn ghost",
            onclick: () => {
              const blob = new Blob([JSON.stringify(S.content, null, 2)], { type: "application/json" });
              const a = el("a", {
                href: URL.createObjectURL(blob),
                download: `samsparking-inhalt-${new Date().toISOString().slice(0, 10)}.json`,
              });
              document.body.appendChild(a);
              a.click();
              a.remove();
            },
          },
          "Inhalt als JSON herunterladen"
        ),
        el("button", { class: "btn ghost", onclick: () => importInput.click() }, "JSON hochladen"),
        importInput,
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------ einstellungen */

function renderSettings() {
  const hookInput = el("input", {
    type: "text",
    class: "mono-input",
    value: S.config.buildHook || "",
    placeholder: "https://api.netlify.com/build_hooks/…",
  });
  const siteInput = el("input", {
    type: "text",
    class: "mono-input",
    value: S.config.siteUrl || DEFAULT_SITE_URL,
    placeholder: "https://www.samsparking.ch",
  });
  const keyInput = el("input", {
    type: "password",
    class: "mono-input",
    autocomplete: "off",
    value: S.config.anthropicKey || "",
    placeholder: "sk-ant-…",
  });
  const keyState = el("span", { class: "muted" }, "");

  return el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [el("h2", {}, "Einstellungen"), el("p", { class: "muted" }, "Verbindung zur Website.")]),
    ]),
    el("div", { class: "group" }, [
      el("h3", { class: "group-title" }, "Netlify"),
      el("div", { class: "field" }, [
        el("label", { class: "field-label" }, "Build-Hook der Website"),
        hookInput,
        el(
          "p",
          { class: "field-hint" },
          "Netlify → Site configuration → Build & deploy → Build hooks → Add build hook. URL hier einsetzen; sie wird beim Publizieren aufgerufen."
        ),
      ]),
      el("div", { class: "field" }, [
        el("label", { class: "field-label" }, "Adresse der Website"),
        siteInput,
        el("p", { class: "field-hint" }, "Nur für die „Website öffnen“-Knöpfe."),
      ]),
      el(
        "button",
        {
          class: "btn solid",
          onclick: async () => {
            try {
              await saveConfig({
                buildHook: hookInput.value.trim(),
                siteUrl: siteInput.value.trim() || DEFAULT_SITE_URL,
              });
              toast("Einstellungen gespeichert");
              render();
            } catch (e) {
              toast("Nicht gespeichert: " + e.message, "err");
            }
          },
        },
        "Einstellungen speichern"
      ),
    ]),
    el("div", { class: "group" }, [
      el("h3", { class: "group-title" }, "KI-Übersetzung"),
      el("div", { class: "field" }, [
        el("label", { class: "field-label" }, "Anthropic-API-Key"),
        keyInput,
        el(
          "p",
          { class: "field-hint" },
          "Für „Sprachen → Fehlende mit KI übersetzen“. Key auf console.anthropic.com erzeugen (API Keys). " +
            "Er liegt im geschützten Konfigurations-Knoten der Datenbank und ist nur mit diesem Passwort lesbar — " +
            "wer das Passwort kennt, kann damit auf deine Rechnung übersetzen. Bei Verdacht den Key dort neu erzeugen."
        ),
      ]),
      el("div", { class: "quick" }, [
        el(
          "button",
          {
            class: "btn solid",
            onclick: async (e) => {
              e.target.disabled = true;
              try {
                await saveConfig({ anthropicKey: keyInput.value.trim() });
                toast("API-Key gespeichert");
              } catch (err) {
                toast("Nicht gespeichert: " + err.message, "err");
              } finally {
                e.target.disabled = false;
              }
            },
          },
          "API-Key speichern"
        ),
        el(
          "button",
          {
            class: "btn ghost",
            onclick: async (e) => {
              const key = keyInput.value.trim();
              if (!key) return toast("Kein Key eingetragen", "err");
              e.target.disabled = true;
              keyState.textContent = "prüfe …";
              try {
                await checkKey(key);
                keyState.textContent = "✓ Key funktioniert";
              } catch (err) {
                keyState.textContent = "✗ " + err.message;
              } finally {
                e.target.disabled = false;
              }
            },
          },
          "Key testen"
        ),
        keyState,
      ]),
    ]),
    el("div", { class: "group" }, [
      el("h3", { class: "group-title" }, "Datenablage"),
      el("dl", { class: "kv" }, [
        el("dt", {}, "Inhalt"),
        el("dd", { class: "mono-input" }, `${RTDB_URL}/${PATHS.content}.json`),
        el("dt", {}, "Anfragen"),
        el("dd", { class: "mono-input" }, `${RTDB_URL}/${PATHS.inquiries}.json`),
        el("dt", {}, "Bilder"),
        el("dd", {}, "Firebase Storage — samsparking/media/…"),
        el("dt", {}, "Sitzung"),
        el("dd", { class: "mono-input" }, (S.user?.uid || "—").slice(0, 12) + " (dieses Gerät)"),
      ]),
      el(
        "p",
        { class: "field-hint" },
        "Der Inhalts-Knoten ist absichtlich öffentlich lesbar — der Website-Build liest ihn beim Deploy. Schreiben darf nur, wer angemeldet ist. Anfragen sind nur angemeldet lesbar."
      ),
    ]),
    el("div", { class: "group danger-zone" }, [
      el("h3", { class: "group-title" }, "Zurücksetzen"),
      el(
        "p",
        { class: "field-hint" },
        "Lädt den Auslieferungs-Inhalt in den Editor. Gespeichert wird erst mit Speichern — der aktuelle Stand bleibt bis dahin in der Datenbank."
      ),
      el(
        "button",
        {
          class: "btn danger",
          onclick: async () => {
            if (!(await confirmDialog("Standard-Inhalt laden?", "Alle Texte werden im Editor überschrieben.", "Laden")))
              return;
            resetToDefaults();
            toast("Standard geladen — noch nicht gespeichert");
            go("dashboard");
          },
        },
        "Standard-Inhalt laden"
      ),
    ]),
  ]);
}

/* ------------------------------------------------------------------ aktionen */

async function doSave() {
  const btn = $("#save-btn");
  if (btn) btn.disabled = true;
  try {
    await saveContent();
    toast("Gespeichert");
  } catch (e) {
    console.error(e);
    toast("Speichern fehlgeschlagen: " + e.message, "err");
  } finally {
    if (btn) btn.disabled = false;
    updateTopbar();
  }
}

async function doPublish() {
  const btn = $("#publish-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "publiziere …";
  }
  try {
    const res = await publish();
    if (res.built) toast("Publiziert — Netlify baut die Website neu (1–2 Minuten)");
    else if (/Build-Hook/.test(res.reason || ""))
      toast(
        "Publiziert — die Website übernimmt den Stand automatisch (spätestens in einer Stunde). " +
          "Soll es sofort sein: Build-Hook unter Einstellungen hinterlegen."
      );
    else toast("Gespeichert, aber kein Build ausgelöst: " + res.reason, "err");
  } catch (e) {
    console.error(e);
    toast("Publizieren fehlgeschlagen: " + e.message, "err");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publizieren";
    }
    updateTopbar();
    if (currentId === "dashboard" || currentId === "publish") render();
  }
}

/* ----------------------------------------------------------------- rahmen */

function go(id) {
  const item = allItems().find((i) => i.id === id);
  if (!item) return;
  currentId = id;
  location.hash = "#" + id;
  render();
  const main = $("#main");
  if (main) main.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "auto" });
  toggleSidebar(false);
}

function renderSidebar() {
  const nav = el("nav", { class: "nav", id: "sidebar" });
  NAV.forEach((g) => {
    nav.appendChild(el("span", { class: "nav-group" }, g.group));
    g.items.forEach((item) => {
      const badge = item.badge ? item.badge() : 0;
      nav.appendChild(
        el(
          "button",
          {
            class: "nav-item" + (item.id === currentId ? " on" : ""),
            dataset: { nav: item.id },
            onclick: () => go(item.id),
          },
          [
            item.icon ? el("span", { class: "nav-icon", html: item.icon }) : null,
            el("span", { class: "nav-label" }, item.label),
            badge ? el("span", { class: "nav-badge" }, String(badge)) : null,
          ]
        )
      );
    });
  });
  return nav;
}

function updateTopbar() {
  const dot = $("#dirty-dot");
  if (dot) {
    dot.className = "dot " + (S.dirty ? "warn" : "ok");
    dot.title = S.dirty ? "Ungespeicherte Änderungen" : "Alles gespeichert";
  }
  const label = $("#dirty-label");
  if (label)
    label.textContent = S.dirty
      ? "ungespeichert"
      : S.content?.updatedAt
      ? "gespeichert " + relativeTime(S.content.updatedAt)
      : "gespeichert";
  const save = $("#save-btn");
  if (save) save.disabled = !S.dirty;
  syncSidebar();
}

function render() {
  const item = allItems().find((i) => i.id === currentId) || allItems()[0];
  const main = $("#main");
  main.innerHTML = "";
  let node;
  try {
    node = item.render();
  } catch (e) {
    console.error(e);
    node = el("p", { class: "empty" }, "Fehler in der Ansicht: " + e.message);
  }
  node.classList && node.classList.add("view-enter");
  main.appendChild(node);
  requestAnimationFrame(() => node.classList && node.classList.remove("view-enter"));
  syncSidebar();
  updateTopbar();
}

/**
 * Navigation nur dort anfassen, wo sie sich wirklich ändert — sie komplett neu
 * zu bauen kostet bei jedem Tastendruck Zeit und lässt den Fokus springen.
 */
function syncSidebar() {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  allItems().forEach((item) => {
    const btn = sidebar.querySelector(`[data-nav="${item.id}"]`);
    if (!btn) return;
    btn.classList.toggle("on", item.id === currentId);
    if (item.badge) {
      const n = item.badge();
      let badge = btn.querySelector(".nav-badge");
      if (n && !badge) btn.appendChild(el("span", { class: "nav-badge" }, String(n)));
      else if (n && badge) badge.textContent = String(n);
      else if (!n && badge) badge.remove();
    }
  });
}

function renderShell() {
  const app = $("#app");
  app.innerHTML = "";
  app.appendChild(
    el("div", { class: "shell" }, [
      el("header", { class: "topbar" }, [
        el("button", {
          class: "burger tool",
          "aria-label": "Menü",
          "aria-expanded": "false",
          onclick: (e) => toggleSidebar(undefined, e.currentTarget),
        }, "☰"),
        el("div", { class: "brand" }, [
          el("span", { class: "brand-mark" }, "◆"),
          el("span", { class: "brand-text" }, "Sam Sparking — Verwaltung"),
          DEMO
            ? el(
                "span",
                {
                  class: "demo-chip",
                  title:
                    "Vorführ-Modus: echter Inhalt, aber nichts wird zurückgeschrieben. " +
                    "Änderungen bleiben in diesem Browser.",
                },
                "Vorführ-Modus"
              )
            : null,
        ]),
        el("div", { class: "topbar-state" }, [
          el("span", { class: "dot ok", id: "dirty-dot" }),
          el("span", { class: "muted", id: "dirty-label" }, ""),
        ]),
        el("div", { class: "topbar-actions" }, [
          el("button", { class: "btn ghost", id: "save-btn", onclick: doSave }, "Speichern"),
          el("button", { class: "btn solid", id: "publish-btn", onclick: doPublish }, "Publizieren"),
          DEMO ? null : el("button", { class: "btn ghost sm", onclick: () => signOut() }, "Abmelden"),
        ]),
      ]),
      el("div", { class: "body" }, [renderSidebar(), el("main", { class: "main", id: "main" })]),
    ])
  );
  render();
}

function toggleSidebar(force, trigger) {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  const open = force === undefined ? !sidebar.classList.contains("open") : force;
  sidebar.classList.toggle("open", open);
  document.body.classList.toggle("nav-open", open);
  const burger = trigger || $(".burger");
  if (burger) {
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Menü schliessen" : "Menü");
    burger.textContent = open ? "×" : "☰";
  }
  if (open) sidebar.querySelector(".nav-item.on, .nav-item")?.focus();
  else if (trigger) trigger.focus();
}

function renderLogin(message) {
  const app = $("#app");
  app.innerHTML = "";

  const input = el("input", {
    type: "password",
    autocomplete: "current-password",
    placeholder: "Passwort",
    "aria-label": "Passwort",
  });
  const hint = el("p", { class: "login-msg" }, "");
  const btn = el("button", { class: "btn solid", type: "submit" }, "Anmelden");

  const form = el(
    "form",
    {
      class: "login-form",
      onsubmit: async (e) => {
        e.preventDefault();
        const pw = input.value;
        if (!pw) return input.focus();
        loggingIn = true;
        btn.disabled = true;
        btn.textContent = "prüfe …";
        hint.textContent = "";
        hint.className = "login-msg";
        try {
          await signInWithPassword(pw);
          input.value = "";
          // Weiter geht es über onAuthStateChanged / enterApp()
          await enterApp();
        } catch (err) {
          hint.textContent = err.wrongPassword
            ? "Falsches Passwort."
            : "Anmeldung fehlgeschlagen: " + (err.code || err.message);
          hint.className = "login-msg err";
          input.select();
        } finally {
          loggingIn = false;
          btn.disabled = false;
          btn.textContent = "Anmelden";
        }
      },
    },
    [input, btn]
  );

  app.appendChild(
    el("div", { class: "login" }, [
      el("div", { class: "login-box" }, [
        el("span", { class: "brand-mark big" }, "◆"),
        el("h1", {}, "Sam Sparking"),
        el("p", { class: "muted" }, "Verwaltung der Website"),
        form,
        hint,
        message ? el("p", { class: "warn-box" }, message) : null,
      ]),
    ])
  );
  input.focus();
}

/* -------------------------------------------------------------------- boot */

let loggingIn = false;

/** Inhalte laden und die Oberfläche aufbauen. */
async function enterApp() {
  const app = $("#app");
  app.innerHTML = "";
  app.appendChild(el("div", { class: "login" }, [el("p", { class: "muted" }, "lade Inhalte …")]));
  try {
    await loadAll();
    if (!S.saved) toast("Erster Start: Standard-Inhalt geladen. Mit Speichern in die Datenbank schreiben.");
    renderShell();
  } catch (e) {
    console.error(e);
    if (/permission[_ ]denied/i.test(String(e.code || e.message))) renderLogin();
    else renderLogin("Daten nicht ladbar: " + e.message);
  }
}

function boot() {
  try {
    initFirebase();
  } catch (e) {
    console.error(e);
    renderLogin("Firebase konnte nicht geladen werden — Adblocker prüfen.");
    return;
  }

  const auth = getAuth();

  // Vorführ-Modus: kein Passwort, keine Anmeldung. Der Inhalt kommt aus dem
  // öffentlich lesbaren Teil der Datenbank, geschrieben wird nirgends.
  if (DEMO) {
    enterApp();
    bindStoreEvents();
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    S.user = user;
    // Während der Anmeldung übernimmt das Formular — sonst würde der Wechsel
    // auf den anonymen Nutzer den Login-Bildschirm mitten im Vorgang neu bauen.
    if (loggingIn) return;
    if (!user) {
      S.ready = false;
      renderLogin();
      return;
    }
    // Anonymer Nutzer aus einer früheren Sitzung: ist er noch freigeschaltet?
    try {
      if (await hasAccess()) await enterApp();
      else renderLogin();
    } catch (e) {
      console.error(e);
      renderLogin("Verbindung zur Datenbank fehlgeschlagen: " + e.message);
    }
  });

  bindStoreEvents();
}

/** Store-Ereignisse, Tastatur und Direktlinks — in beiden Betriebsarten gleich. */
function bindStoreEvents() {
  // Zustandsänderungen aus dem Store
  onChange((what) => {
    if (what === "media") notifyMediaChanged();
    if (what === "uploads") notifyUploadsChanged();
    if (!S.ready || !document.getElementById("main")) return;
    if (what === "dirty" || what === "saved" || what === "config") updateTopbar();
    if (what === "media" || what === "inquiries") {
      const main = $("#main");
      const active = main?.firstElementChild;
      if (active && typeof active._refresh === "function") active._refresh();
      else if (currentId === "dashboard") render();
      else updateTopbar();
    }
    if (what === "loaded" && S.ready && $("#main")) renderShell();
  });

  // Tastatur: Strg/Cmd+S speichert
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#sidebar")?.classList.contains("open")) {
      toggleSidebar(false);
      $(".burger")?.focus();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (S.dirty) doSave();
    }
  });

  // Direktlink per #hash
  const applyHash = () => {
    const id = location.hash.replace("#", "");
    if (id && allItems().some((i) => i.id === id)) currentId = id;
  };
  applyHash();
  window.addEventListener("hashchange", () => {
    const id = location.hash.replace("#", "");
    if (id && id !== currentId && allItems().some((i) => i.id === id)) {
      currentId = id;
      if (S.ready) render();
    }
  });
}

boot();
