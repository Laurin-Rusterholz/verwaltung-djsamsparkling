/* ==========================================================================
   Formular-Bausteine — an S.content gebundene Eingabefelder
   ========================================================================== */

import { el, getPath, setPath, clone, toast, confirmDialog, looksLikeVideo } from "./util.js";
import { S, markDirty } from "./store.js";
import { DEFAULT_SITE_URL } from "./config.js";

/**
 * Bildpfade in der Vorschau anzeigbar machen: Inhalte dürfen relative Pfade
 * enthalten (z. B. img/hero.jpg im Website-Repo). Für die Vorschau hier werden
 * sie gegen die Adresse der Website aufgelöst.
 */
export function previewSrc(src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^(https?:|data:)/i.test(s)) return s;
  const base = String(S.config?.siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return base + "/" + s.replace(/^\/+/, "");
}

/* Der Medien-Auswahldialog wird von media.js registriert (vermeidet
   gegenseitige Imports). */
let mediaPicker = null;
export function setMediaPicker(fn) {
  mediaPicker = fn;
}

const read = (path) => getPath(S.content, path);
function write(path, value) {
  setPath(S.content, path, value);
  markDirty();
}

/* ------------------------------------------------------------------ hülle */

function wrap(labelText, control, hint, cls = "") {
  return el("div", { class: "field " + cls }, [
    labelText ? el("label", { class: "field-label" }, labelText) : null,
    control,
    hint ? el("p", { class: "field-hint" }, hint) : null,
  ]);
}

/* ----------------------------------------------------------------- felder */

export function textField(path, label, opts = {}) {
  const input = el("input", {
    type: opts.type || "text",
    value: read(path) ?? "",
    placeholder: opts.placeholder || "",
    maxlength: opts.maxlength || 400,
    class: opts.mono ? "mono-input" : "",
    oninput: (e) => write(path, e.target.value),
  });
  return wrap(label, input, opts.hint, opts.class || "");
}

export function textArea(path, label, opts = {}) {
  const ta = el("textarea", {
    rows: opts.rows || 4,
    placeholder: opts.placeholder || "",
    maxlength: opts.maxlength || 8000,
    oninput: (e) => write(path, e.target.value),
  });
  ta.value = read(path) ?? "";
  return wrap(label, ta, opts.hint, opts.class || "");
}

export function checkboxField(path, label, hint) {
  const box = el("input", {
    type: "checkbox",
    onchange: (e) => write(path, e.target.checked),
  });
  box.checked = read(path) !== false;
  return el("div", { class: "field field-check" }, [
    el("label", { class: "check" }, [box, el("span", {}, label)]),
    hint ? el("p", { class: "field-hint" }, hint) : null,
  ]);
}

/**
 * Schalter, der von Haus aus AUS ist — für Auszeichnungen wie „gross zeigen“.
 * (checkboxField ist bewusst umgekehrt: dort bedeutet „nichts gespeichert“ an.)
 *
 * opts.allow(neuerWert) darf die Änderung ablehnen: liefert es `false`, springt
 * der Schalter zurück und es wird nichts geschrieben. opts.onChange läuft erst,
 * wenn der neue Wert steht — von dort aus darf neu gezeichnet werden.
 */
export function flagField(path, label, hint, opts = {}) {
  const box = el("input", {
    type: "checkbox",
    onchange: (e) => {
      const an = e.target.checked;
      if (typeof opts.allow === "function" && opts.allow(an) === false) {
        e.target.checked = !an;
        return;
      }
      write(path, an);
      if (typeof opts.onChange === "function") opts.onChange(an);
    },
  });
  box.checked = read(path) === true;
  return el("div", { class: "field field-check" }, [
    el("label", { class: "check" }, [box, el("span", {}, label)]),
    hint ? el("p", { class: "field-hint" }, hint) : null,
  ]);
}

export function colorField(path, label, hint) {
  const value = read(path) || "#000000";
  const text = el("input", {
    type: "text",
    value,
    class: "mono-input",
    maxlength: 30,
    oninput: (e) => {
      write(path, e.target.value);
      if (/^#[0-9a-f]{6}$/i.test(e.target.value)) picker.value = e.target.value;
    },
  });
  const picker = el("input", {
    type: "color",
    value: /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000",
    oninput: (e) => {
      text.value = e.target.value;
      write(path, e.target.value);
    },
  });
  return wrap(label, el("div", { class: "color-row" }, [picker, text]), hint);
}

export function selectField(path, label, options, opts = {}) {
  const sel = el("select", {
    onchange: (e) => {
      write(path, e.target.value);
      if (typeof opts.onChange === "function") opts.onChange(e.target.value);
    },
  });
  const cur = read(path);
  options.forEach(([val, text]) => {
    const o = el("option", { value: val }, text);
    if (String(cur) === String(val)) o.selected = true;
    sel.appendChild(o);
  });
  return wrap(label, sel, opts.hint);
}

/**
 * Bild- oder Videofeld: die Vorschau selbst ist der Knopf. Ein Klick darauf
 * öffnet die Medienbibliothek und tauscht das Medium aus — kein Umweg über
 * einen Extra-Knopf. Ist noch nichts gesetzt, steht dort ein grosses „+“.
 * Die Adresse von Hand einzutippen geht weiterhin, aber eingeklappt.
 *
 * `path` zeigt auf das Objekt {src, alt, credit?} oder direkt auf einen String.
 */
export function imageField(path, label, opts = {}) {
  const asObject = opts.asObject !== false;
  const srcPath = asObject ? `${path}.src` : path;
  const wording = opts.kind === "video" ? "Video" : "Bild";

  const preview = el("button", {
    type: "button",
    class: "media-pick",
    onclick: () => choose(),
  });

  const removeBtn = el(
    "button",
    {
      type: "button",
      class: "link danger",
      onclick: () => {
        write(srcPath, "");
        urlInput.value = "";
        renderPreview();
      },
    },
    "Entfernen"
  );

  const renderPreview = () => {
    const src = read(srcPath);
    const video = looksLikeVideo(src);
    const fallback = (e) =>
      e.target.replaceWith(el("span", { class: "img-empty" }, "nicht ladbar"));

    preview.classList.toggle("empty", !src);
    preview.title = src ? `${wording} austauschen` : `${wording} wählen`;
    removeBtn.hidden = !src;

    preview.replaceChildren(
      ...(!src
        ? [
            el("span", { class: "media-empty-plus" }, "+"),
            el("span", { class: "media-empty-text" }, opts.emptyText || `${wording} wählen`),
          ]
        : [
            video
              ? el("video", {
                  src: previewSrc(src),
                  muted: true,
                  loop: true,
                  playsinline: true,
                  autoplay: true,
                  preload: "metadata",
                  onerror: fallback,
                })
              : el("img", { src: previewSrc(src), alt: "", loading: "lazy", onerror: fallback }),
            video ? el("span", { class: "media-kind" }, "Video") : null,
            el("span", { class: "media-overlay" }, "Klicken zum Austauschen"),
          ].filter(Boolean))
    );
  };

  async function choose() {
    if (!mediaPicker) return toast("Medienbibliothek noch nicht bereit", "err");
    const item = await mediaPicker({ kind: opts.kind });
    if (!item) return;
    write(srcPath, item.url);
    urlInput.value = item.url;
    if (asObject && !read(`${path}.alt`) && item.alt) write(`${path}.alt`, item.alt);
    renderPreview();
    if (altInput && read(`${path}.alt`)) altInput.value = read(`${path}.alt`);
    if (typeof opts.afterPick === "function") opts.afterPick(item);
  }

  const urlInput = el("input", {
    type: "text",
    value: read(srcPath) ?? "",
    placeholder: opts.placeholder || "https://… oder img/hero.jpg",
    class: "mono-input",
    oninput: (e) => {
      write(srcPath, e.target.value);
      renderPreview();
    },
  });

  const manual = el("div", { class: "media-manual", hidden: true }, [
    el("label", { class: "field-label" }, "Adresse von Hand"),
    urlInput,
  ]);
  const manualToggle = el(
    "button",
    {
      type: "button",
      class: "link",
      onclick: () => {
        manual.hidden = !manual.hidden;
        manualToggle.textContent = manual.hidden ? "Adresse von Hand" : "Adresse ausblenden";
        if (!manual.hidden) urlInput.focus();
      },
    },
    "Adresse von Hand"
  );

  renderPreview();

  let altInput = null;
  const extras = [];
  if (asObject && opts.alt !== false) {
    altInput = el("input", {
      type: "text",
      value: read(`${path}.alt`) ?? "",
      placeholder: "Was ist auf dem Bild? (für Google & Screenreader)",
      maxlength: 300,
      oninput: (e) => write(`${path}.alt`, e.target.value),
    });
    extras.push(wrap("Alt-Text", altInput, null, "sub"));
  }
  if (asObject && opts.credit) {
    extras.push(
      textField(`${path}.credit`, "Bildnachweis", { class: "sub", placeholder: "Photo — …" })
    );
  }

  return el("div", { class: "field img-field" }, [
    label ? el("label", { class: "field-label" }, label) : null,
    preview,
    el("div", { class: "media-actions" }, [manualToggle, removeBtn]),
    manual,
    ...extras,
    opts.hint ? el("p", { class: "field-hint" }, opts.hint) : null,
  ]);
}

/* -------------------------------------------------------------- listen */

function moveItem(arr, from, to) {
  if (to < 0 || to >= arr.length) return false;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return true;
}

/** Liste einfacher Textzeilen (z. B. Keywords, Absätze, Stichworte). */
export function stringList(path, label, opts = {}) {
  const host = el("div", { class: "list" });

  const render = () => {
    const arr = read(path);
    const items = Array.isArray(arr) ? arr : (write(path, []), read(path));
    host.innerHTML = "";
    items.forEach((val, i) => {
      const input = opts.multiline
        ? el("textarea", {
            rows: opts.rows || 3,
            oninput: (e) => {
              items[i] = e.target.value;
              markDirty();
            },
          })
        : el("input", {
            type: "text",
            value: val ?? "",
            placeholder: opts.placeholder || "",
            maxlength: opts.maxlength || 400,
            oninput: (e) => {
              items[i] = e.target.value;
              markDirty();
            },
          });
      if (opts.multiline) input.value = val ?? "";
      host.appendChild(
        el("div", { class: "list-row" }, [
          el("span", { class: "list-idx" }, String(i + 1).padStart(2, "0")),
          input,
          el("div", { class: "row-tools" }, [
            toolBtn("↑", "Nach oben", () => moveItem(items, i, i - 1) && (markDirty(), render())),
            toolBtn("↓", "Nach unten", () => moveItem(items, i, i + 1) && (markDirty(), render())),
            toolBtn("✕", "Entfernen", () => {
              items.splice(i, 1);
              markDirty();
              render();
            }, "danger"),
          ]),
        ])
      );
    });
    host.appendChild(
      addTile(
        opts.addLabel || "Zeile hinzufügen",
        () => {
          items.push("");
          markDirty();
          render();
          const last = host.querySelectorAll("input,textarea");
          if (last.length) last[last.length - 1].focus();
        },
        { small: true }
      )
    );
  };
  render();

  return el("div", { class: "field" }, [
    label ? el("label", { class: "field-label" }, label) : null,
    opts.hint ? el("p", { class: "field-hint" }, opts.hint) : null,
    host,
  ]);
}

function toolBtn(text, title, onclick, cls = "") {
  return el("button", { type: "button", class: "tool " + cls, title, "aria-label": title, onclick }, text);
}

/**
 * Hinzufügen geht überall gleich: eine breite Fläche mit einem „+“ davor.
 * Beschriftungen dürfen weiterhin als „+ Produkt“ hereinkommen — das Zeichen
 * steckt jetzt im Kreis, im Text wäre es doppelt.
 */
function addTile(label, onclick, opts = {}) {
  return el(
    "button",
    { type: "button", class: "add-tile" + (opts.small ? " sm" : ""), onclick },
    [el("span", { class: "plus", "aria-hidden": "true" }, "+"), String(label).replace(/^\+\s*/, "")]
  );
}

/**
 * Liste aus Objekten. `fields` ist eine Funktion (basePath, item, index) →
 * Array von Feld-Elementen. `titleOf(item, i)` liefert die Kartenbeschriftung.
 */
export function objectList(path, label, opts = {}) {
  const host = el("div", { class: "cards" });
  const changed = () => {
    if (typeof opts.onChange === "function") opts.onChange();
  };

  const render = () => {
    let items = read(path);
    if (!Array.isArray(items)) {
      write(path, []);
      items = read(path);
    }
    host.innerHTML = "";
    if (!items.length) {
      host.appendChild(el("p", { class: "empty" }, opts.emptyText || "Noch keine Einträge."));
    }
    items.forEach((item, i) => {
      const base = `${path}.${i}`;
      const title = opts.titleOf ? opts.titleOf(item, i) : `#${i + 1}`;
      const body = el("div", { class: "card-body" }, opts.fields(base, item, i, render));
      const card = el("div", { class: "card" }, [
        el("div", { class: "card-head" }, [
          el("span", { class: "card-title" }, title || "(ohne Titel)"),
          el("div", { class: "row-tools" }, [
            toolBtn("↑", "Nach oben", () => moveItem(items, i, i - 1) && (markDirty(), render(), changed())),
            toolBtn("↓", "Nach unten", () => moveItem(items, i, i + 1) && (markDirty(), render(), changed())),
            toolBtn("⧉", "Duplizieren", () => {
              items.splice(i + 1, 0, clone(item));
              markDirty();
              render();
              changed();
            }),
            toolBtn("✕", "Entfernen", async () => {
              if (
                opts.confirmDelete !== false &&
                !(await confirmDialog("Eintrag entfernen?", title, "Entfernen"))
              )
                return;
              items.splice(i, 1);
              markDirty();
              render();
              changed();
            }, "danger"),
          ]),
        ]),
        body,
      ]);
      host.appendChild(card);
    });
    host.appendChild(
      addTile(opts.addLabel || "Eintrag hinzufügen", async () => {
        // `onAdd` übernimmt das Anlegen selbst (z. B. Auswahl aus der
        // Medienbibliothek); sonst kommt ein leerer Eintrag dazu.
        if (typeof opts.onAdd === "function") {
          await opts.onAdd(items, () => {
            render();
            changed();
          });
          return;
        }
        items.push(clone(opts.newItem || {}));
        markDirty();
        render();
        changed();
        const cards = host.querySelectorAll(".card");
        const last = cards[cards.length - 1];
        if (last) {
          last.scrollIntoView({ block: "nearest" });
          const f = last.querySelector("input,textarea,select");
          if (f) f.focus();
        }
      })
    );
    if ((opts.extraAdd || []).length) {
      host.appendChild(
        el(
          "div",
          { class: "add-row" },
          opts.extraAdd.map((a) =>
            el(
              "button",
              { type: "button", class: "btn ghost sm", onclick: () => a.onClick(items, render) },
              a.label
            )
          )
        )
      );
    }
  };
  render();

  return el("div", { class: "field" }, [
    label ? el("label", { class: "field-label" }, label) : null,
    opts.hint ? el("p", { class: "field-hint" }, opts.hint) : null,
    host,
  ]);
}

/** Gruppierung mit Titel. */
export function group(title, children, opts = {}) {
  return el("section", { class: "group" + (opts.class ? " " + opts.class : "") }, [
    title ? el("h3", { class: "group-title" }, title) : null,
    opts.hint ? el("p", { class: "group-hint" }, opts.hint) : null,
    el("div", { class: "group-body" + (opts.cols ? " cols-" + opts.cols : "") }, children.filter(Boolean)),
  ]);
}
