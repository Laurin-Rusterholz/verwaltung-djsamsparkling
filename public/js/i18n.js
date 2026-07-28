/* ==========================================================================
   Sprachen — Deutsch ist der gepflegte Stand, Englisch und Französisch
   liegen als Übersetzungstabelle daneben.

   Ablage im Inhalt:
     i18n.en.sections.about.lede      = "…"   (übersetzter Text)
     i18nHash.en.sections.about.lede  = "a1b2…" (Fingerabdruck des deutschen
                                       Ausgangstexts zum Zeitpunkt der
                                       Übersetzung — daran erkennen wir, ob
                                       das Deutsche seither geändert wurde)

   Verschachtelt und nicht flach mit Punkt-Pfaden, weil Schlüssel in der
   Realtime Database keine Punkte enthalten dürfen. Der Website-Build
   (s-mi/scripts/build.mjs → flattenI18n) versteht beide Formen.

   Die Auswahl der übersetzbaren Stellen muss mit build.mjs (collectStrings)
   übereinstimmen — beide Listen bei Änderungen gemeinsam anpassen.
   ========================================================================== */

import { el, getPath, setPath, toast, confirmDialog, debounce } from "./util.js";
import { S, markDirty, saveContent } from "./store.js";
import { translateBatch, BATCH_SIZE } from "./ai.js";

/* ------------------------------------------------------- übersetzbare Texte */

const NO_TRANSLATE = new Set([
  "src", "poster", "url", "ticketUrl", "linkUrl", "embedUrl", "presskitUrl",
  "ogImage", "domain", "bookingApi", "themeColor", "accentColor", "lang",
  "slug", "date", "status", "email", "phone", "country", "createdAt",
  "updatedAt", "updatedBy", "schemaVersion", "type", "view",
  "value", "logoText", "artist", "languages", "nameSpaced", "nameMain",
  // Eigennamen: Clubs, Festivals, Geräte, Genre-Bezeichnungen
  "name", "venue", "inquiryId", "backgroundImage", "price", "currency", "twint",
]);

const looksTechnical = (v) =>
  /^(https?:|mailto:|tel:|#|\/)/i.test(v) ||
  /^#[0-9a-f]{3,8}$/i.test(v) ||
  /^\d{4}-\d{2}-\d{2}$/.test(v);

const NO_TRANSLATE_PATH = /^layout\.|^pages\.\d+\.sections\.|^pages\.\d+\.hero$/;

export function collectStrings(node, prefix = "", out = []) {
  if (prefix && NO_TRANSLATE_PATH.test(prefix)) return out;
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectStrings(v, `${prefix}.${i}`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      // Unter ui.* stehen nur Oberflächentexte — dort gelten die technischen
      // Schlüsselnamen (phone, close, …) nicht als Sperre.
      if ((!prefix.startsWith("ui") && NO_TRANSLATE.has(k)) || k === "i18n" || k === "i18nHash") continue;
      collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  if (typeof node === "string" && node.trim() && !looksTechnical(node)) out.push([prefix, node]);
  return out;
}

/** Kurzer Fingerabdruck (FNV-1a). Gleiche Funktion wie im Umwandlungsskript. */
export function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function flatten(node, prefix = "", out = {}) {
  if (!node || typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, p, out);
    else if (typeof v === "string") out[p] = v;
  }
  return out;
}

/* ----------------------------------------------------------------- zustand */

export const languages = () => {
  const master = String(S.content?.site?.lang || "de");
  const extra = (S.content?.site?.languages || [])
    .map((l) => String(l).toLowerCase())
    .filter((l) => /^[a-z]{2}$/.test(l) && l !== master);
  return [...new Set(extra)];
};

export const LANG_LABEL = { de: "Deutsch", en: "Englisch", fr: "Französisch" };

/**
 * Stand einer Sprache: jede deutsche Textstelle mit ihrer Übersetzung und
 * einem Status — fehlt / veraltet (Deutsch hat sich geändert) / passt.
 */
export function statusFor(lang) {
  const table = flatten(getPath(S.content, `i18n.${lang}`) || {});
  const hashes = flatten(getPath(S.content, `i18nHash.${lang}`) || {});
  const rows = collectStrings(S.content).map(([path, source]) => {
    const text = table[path] || "";
    let state = "ok";
    if (!text.trim()) state = "missing";
    else if (hashes[path] && hashes[path] !== fingerprint(source)) state = "stale";
    return { path, source, text, state };
  });
  const known = new Set(rows.map((r) => r.path));
  const orphans = Object.keys(table).filter((p) => !known.has(p));
  return {
    rows,
    orphans,
    missing: rows.filter((r) => r.state === "missing"),
    stale: rows.filter((r) => r.state === "stale"),
    done: rows.filter((r) => r.state === "ok").length,
    total: rows.length,
  };
}

/** Eine Übersetzung setzen (mit Fingerabdruck des deutschen Originals). */
export function setTranslation(lang, path, text, source) {
  setPath(S.content, `i18n.${lang}.${path}`, text);
  const src = source === undefined ? getPath(S.content, path) : source;
  if (typeof src === "string") setPath(S.content, `i18nHash.${lang}.${path}`, fingerprint(src));
  markDirty();
}

/** Verwaiste Einträge (Text auf Deutsch gelöscht) wegräumen. */
export function dropOrphans(lang, paths) {
  paths.forEach((p) => {
    const keys = p.split(".");
    const last = keys.pop();
    const parent = getPath(S.content, `i18n.${lang}.${keys.join(".")}`);
    if (parent && typeof parent === "object") delete parent[last];
    const parentHash = getPath(S.content, `i18nHash.${lang}.${keys.join(".")}`);
    if (parentHash && typeof parentHash === "object") delete parentHash[last];
  });
  markDirty();
}

/** Zusammenfassung für Dashboard und Publizieren. */
export function translationSummary() {
  return languages().map((lang) => {
    const st = statusFor(lang);
    return { lang, done: st.done, total: st.total, missing: st.missing.length, stale: st.stale.length };
  });
}

/* ------------------------------------------------ Hauptsprache umstellen

   Die Verwaltung wird mit deutscher Vorlage ausgeliefert. Steht in der
   Datenbank noch der alte englische Stand (site.lang: "en"), fehlen dort
   sämtliche deutschen Texte — die Website baut dann nur eine Sprache.
   Diese Aktion holt die Texte aus der Vorlage nach, ohne Bilder, Videos,
   Termine, Farben oder Links anzufassen.
*/

/** Weicht die Hauptsprache von der Vorlage ab? */
export function masterMismatch() {
  const from = String(S.content?.site?.lang || "");
  const to = String(S.defaults?.site?.lang || "");
  return from && to && from !== to ? { from, to } : null;
}

/**
 * Alle übersetzbaren Texte aus der Vorlage übernehmen — aber nur dort, wo es
 * das Feld im aktuellen Inhalt schon gibt. Dadurch bleiben eigene Termine,
 * Galerie-Einträge und Social-Links unangetastet.
 */
export function adoptDefaultTexts() {
  const d = S.defaults;
  if (!d) throw new Error("Vorlage nicht geladen");
  let n = 0;
  collectStrings(d).forEach(([path, text]) => {
    if (getPath(S.content, path) === undefined) return;
    setPath(S.content, path, text);
    n++;
  });
  setPath(S.content, "site.lang", d.site.lang);
  setPath(S.content, "site.languages", [...(d.site.languages || [])]);
  S.content.i18n = JSON.parse(JSON.stringify(d.i18n || {}));
  S.content.i18nHash = JSON.parse(JSON.stringify(d.i18nHash || {}));
  if (d.ui) S.content.ui = JSON.parse(JSON.stringify(d.ui));
  markDirty();
  return n;
}

/* -------------------------------------------------------------- übersetzen */

function artistBrief() {
  const c = S.content || {};
  return [
    c.site?.title,
    c.hero?.claim,
    (c.sections?.about?.paragraphs || []).slice(0, 2).join(" "),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

/**
 * Fehlende und veraltete Stellen einer Sprache übersetzen lassen.
 * @param {string} lang
 * @param {{all?:boolean, onProgress?:(done:number,total:number)=>void, signal?:AbortSignal}} opts
 */
export async function translateMissing(lang, opts = {}) {
  const apiKey = (S.config.anthropicKey || "").trim();
  if (!apiKey) throw new Error("Kein Anthropic-API-Key hinterlegt (Einstellungen).");

  const st = statusFor(lang);
  const todo = opts.all ? st.rows : st.rows.filter((r) => r.state !== "ok");
  if (!todo.length) return { count: 0 };

  const brief = artistBrief();
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const chunk = todo.slice(i, i + BATCH_SIZE);
    const result = await translateBatch({
      apiKey,
      target: lang,
      brief,
      signal: opts.signal,
      entries: chunk.map((r) => ({ id: r.path, text: r.source })),
    });
    chunk.forEach((r) => {
      const text = result[r.path];
      if (typeof text === "string" && text.trim()) setTranslation(lang, r.path, text.trim(), r.source);
    });
    done += chunk.length;
    opts.onProgress && opts.onProgress(Math.min(done, todo.length), todo.length);
  }
  return { count: todo.length };
}

/* ------------------------------------------------------------------ ansicht */

const STATE_LABEL = { missing: "fehlt", stale: "veraltet", ok: "übersetzt" };

/** Hinweis, wenn die Datenbank noch auf einer anderen Hauptsprache steht. */
function masterBox(onDone) {
  const m = masterMismatch();
  if (!m) return null;
  return el("div", { class: "warn-box" }, [
    el(
      "p",
      {},
      `Die Website läuft noch auf ${LANG_LABEL[m.from] || m.from} als Hauptsprache, die Vorlage ist ` +
        `${LANG_LABEL[m.to] || m.to}. Deshalb erscheinen auf der Website noch nicht alle Sprachen.`
    ),
    el("div", { class: "quick", style: "margin:12px 0 0" }, [
      el(
        "button",
        {
          class: "btn solid",
          onclick: async () => {
            if (
              !(await confirmDialog(
                `Auf ${LANG_LABEL[m.to] || m.to} umstellen?`,
                "Alle Texte werden durch die Fassung aus der Vorlage ersetzt, dazu kommen die " +
                  "Übersetzungen. Bilder, Videos, Termine, Farben, Links und Einstellungen bleiben, " +
                  "wie sie sind. Danach speichern nicht vergessen.",
                "Umstellen"
              ))
            )
              return;
            try {
              const n = adoptDefaultTexts();
              await saveContent();
              toast(`${n} Texte übernommen und gespeichert`);
              onDone();
            } catch (e) {
              toast("Nicht übernommen: " + e.message, "err");
            }
          },
        },
        `Texte auf ${LANG_LABEL[m.to] || m.to} umstellen`
      ),
    ]),
  ]);
}

/** Welche Sprachen die Website überhaupt baut. */
function languagePicker(onChange) {
  const master = String(S.content?.site?.lang || "de");
  const active = new Set(languages());
  const box = el("div", { class: "quick" }, [
    el("span", { class: "muted" }, `Hauptsprache ${LANG_LABEL[master] || master} · zusätzlich:`),
  ]);
  ["en", "fr"].forEach((l) => {
    if (l === master) return;
    const cb = el("input", {
      type: "checkbox",
      onchange: (e) => {
        const set = new Set(languages());
        if (e.target.checked) set.add(l);
        else set.delete(l);
        setPath(S.content, "site.languages", [master, ...set]);
        markDirty();
        onChange();
      },
    });
    cb.checked = active.has(l);
    box.appendChild(el("label", { class: "check" }, [cb, el("span", {}, LANG_LABEL[l] || l)]));
  });
  return box;
}

export function renderI18n() {
  const langs = languages();
  let lang = langs[0] || "en";
  let filter = "todo";
  let running = null; // AbortController

  const listHost = el("div", { class: "i18n-list" });
  const summary = el("p", { class: "muted" });
  const bar = el("div", { class: "prog" }, [el("span", { class: "prog-fill" })]);
  const barWrap = el("div", { class: "prog-wrap", hidden: true }, [bar, el("span", { class: "prog-text muted" })]);

  const setProgress = (done, total) => {
    barWrap.hidden = false;
    bar.querySelector(".prog-fill").style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
    barWrap.querySelector(".prog-text").textContent = `${done} von ${total} Texten`;
  };

  const row = (r) => {
    const input = el("textarea", {
      rows: Math.min(6, Math.max(2, Math.ceil((r.source.length || 1) / 55))),
      placeholder: "noch nicht übersetzt",
      spellcheck: "false",
      oninput: debounce((e) => {
        setTranslation(lang, r.path, e.target.value, r.source);
        node.classList.remove("s-missing", "s-stale");
        node.classList.add("s-ok");
        badge.className = "badge b-ok";
        badge.textContent = STATE_LABEL.ok;
      }, 400),
    });
    input.value = r.text;
    const badge = el("span", { class: "badge b-" + r.state }, STATE_LABEL[r.state]);
    const node = el("div", { class: "i18n-row s-" + r.state }, [
      el("div", { class: "i18n-src" }, [
        el("code", { class: "i18n-key", title: r.path }, r.path),
        el("p", {}, r.source),
      ]),
      el("div", { class: "i18n-dst" }, [badge, input]),
    ]);
    return node;
  };

  const render = () => {
    const st = statusFor(lang);
    const rows =
      filter === "todo" ? st.rows.filter((r) => r.state !== "ok") : filter === "all" ? st.rows : st.rows.filter((r) => r.state === filter);

    summary.textContent =
      `${st.done} von ${st.total} Texten übersetzt` +
      (st.missing.length ? ` · ${st.missing.length} fehlen` : "") +
      (st.stale.length ? ` · ${st.stale.length} veraltet` : "") +
      (st.orphans.length ? ` · ${st.orphans.length} verwaist` : "");

    listHost.innerHTML = "";
    if (!rows.length) {
      listHost.appendChild(
        el("p", { class: "empty" }, filter === "todo" ? "Alles übersetzt. 🎉" : "Nichts in diesem Filter.")
      );
    }
    rows.forEach((r) => listHost.appendChild(row(r)));
    orphanBox.hidden = !st.orphans.length;
    if (st.orphans.length) orphanBox.querySelector("span").textContent = `${st.orphans.length} Übersetzungen zeigen auf Texte, die es auf Deutsch nicht mehr gibt.`;
  };

  const orphanBox = el("div", { class: "warn-box row-between", hidden: true }, [
    el("span", {}, ""),
    el(
      "button",
      {
        class: "btn ghost sm",
        onclick: () => {
          dropOrphans(lang, statusFor(lang).orphans);
          toast("Verwaiste Übersetzungen entfernt");
          render();
        },
      },
      "aufräumen"
    ),
  ]);

  const runTranslate = async (all) => {
    if (running) {
      running.abort();
      running = null;
      return;
    }
    const st = statusFor(lang);
    const todo = all ? st.total : st.missing.length + st.stale.length;
    if (!todo) return toast("Nichts zu übersetzen");
    if (all && !(await confirmDialog("Alles neu übersetzen?", `${st.total} Texte werden neu von der KI übersetzt und ersetzen die bestehenden ${LANG_LABEL[lang]}-Texte.`, "Übersetzen")))
      return;

    running = new AbortController();
    aiBtn.textContent = "abbrechen";
    aiBtn.classList.add("danger");
    allBtn.disabled = true;
    setProgress(0, todo);
    try {
      const res = await translateMissing(lang, {
        all,
        signal: running.signal,
        onProgress: setProgress,
      });
      toast(`${res.count} Texte übersetzt — noch speichern nicht vergessen`);
      try {
        await saveContent();
        toast("Übersetzungen gespeichert");
      } catch (e) {
        toast("Übersetzt, aber nicht gespeichert: " + e.message, "err");
      }
    } catch (e) {
      if (e.name === "AbortError") toast("Übersetzung abgebrochen");
      else toast("Übersetzung fehlgeschlagen: " + e.message, "err");
    } finally {
      running = null;
      aiBtn.textContent = "Fehlende mit KI übersetzen";
      aiBtn.classList.remove("danger");
      allBtn.disabled = false;
      barWrap.hidden = true;
      render();
    }
  };

  const aiBtn = el("button", { class: "btn solid", onclick: () => runTranslate(false) }, "Fehlende mit KI übersetzen");
  const allBtn = el("button", { class: "btn ghost", onclick: () => runTranslate(true) }, "Alles neu übersetzen");

  const langTabs = el(
    "div",
    { class: "tabs" },
    langs.map((l) =>
      el(
        "button",
        {
          class: "tab" + (l === lang ? " on" : ""),
          onclick: (e) => {
            lang = l;
            Array.from(langTabs.children).forEach((c) => c.classList.remove("on"));
            e.currentTarget.classList.add("on");
            render();
          },
        },
        LANG_LABEL[l] || l
      )
    )
  );

  const filterTabs = el(
    "div",
    { class: "tabs" },
    [
      ["todo", "offen"],
      ["missing", "fehlend"],
      ["stale", "veraltet"],
      ["all", "alle"],
    ].map(([val, text]) =>
      el(
        "button",
        {
          class: "tab" + (val === filter ? " on" : ""),
          onclick: (e) => {
            filter = val;
            Array.from(filterTabs.children).forEach((c) => c.classList.remove("on"));
            e.currentTarget.classList.add("on");
            render();
          },
        },
        text
      )
    )
  );

  render();

  /** Ganze Ansicht neu aufbauen — nötig, wenn sich die Sprachliste ändert. */
  const reload = () => {
    const parent = v.parentNode;
    if (parent) parent.replaceChild(renderI18n(), v);
  };

  const v = el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h2", {}, "Sprachen"),
        el(
          "p",
          { class: "muted" },
          "Deutsch ist die Hauptsprache — was hier steht, ist die Übersetzung. Fehlt eine, zeigt die Website an dieser Stelle den deutschen Text."
        ),
      ]),
    ]),
    masterBox(() => reload()),
    languagePicker(() => reload()),
    langs.length
      ? null
      : el("p", { class: "warn-box" }, "Zurzeit baut die Website nur Deutsch. Oben eine Sprache anhaken."),
    langTabs,
    el("div", { class: "group" }, [
      summary,
      el("div", { class: "quick" }, [
        aiBtn,
        allBtn,
        S.config.anthropicKey ? null : el("span", { class: "muted" }, "→ Einstellungen: Anthropic-API-Key hinterlegen"),
      ]),
      barWrap,
      orphanBox,
    ]),
    filterTabs,
    listHost,
  ]);
  v._refresh = render;
  return v;
}
