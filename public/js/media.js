/* ==========================================================================
   Medien — Upload nach Firebase Storage, Metadaten in der Realtime Database
   ========================================================================== */

import { PATHS, STORAGE_PREFIX, MAX_UPLOAD_BYTES, VIDEO_WARN_BYTES, ACCEPTED_TYPES, ACCEPT_ATTR, DEMO } from "./config.js";
import { el, bytes, relativeTime, toast, confirmDialog, slug, looksLikeVideo, stummesVideo } from "./util.js";
import { S, getDb, getStorage, emit } from "./store.js";
import { setMediaPicker } from "./fields.js";

const uploads = new Map(); // tempId → {name, percent, error}

/* ------------------------------------------------------------------ upload */

export async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (DEMO) {
    toast("Vorführ-Modus: Hochladen ist hier abgeschaltet. Die vorhandenen Medien lassen sich ansehen.");
    return;
  }
  for (const file of files) uploadOne(file);
}

/** "image" | "video" | null (nicht erlaubt) */
export function kindOf(type) {
  if (ACCEPTED_TYPES.image.test(type || "")) return "image";
  if (ACCEPTED_TYPES.video.test(type || "")) return "video";
  return null;
}

async function uploadOne(file) {
  const tempId = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const kind = kindOf(file.type);
  if (!kind) {
    toast(`${file.name}: nur Bilder (JPG, PNG, WebP, AVIF, GIF) oder Videos (MP4, WebM)`, "err");
    return;
  }
  /* Die einzige Grenze, die es wirklich gibt: die Storage-Regel des Projekts
     (firebase/storage.rules, `request.resource.size < 250 MB`). Sie wird vom
     Server durchgesetzt — hier wird sie nur vorweggenommen, damit ein zu
     grosser Upload nicht erst nach Minuten am Server scheitert. Alles darunter
     geht durch: ein 44-MB-Video wird NICHT abgewiesen. */
  if (file.size > MAX_UPLOAD_BYTES) {
    toast(
      `${file.name} ist ${bytes(file.size)} — die Storage-Regel des Projekts nimmt bis ` +
        `${bytes(MAX_UPLOAD_BYTES)}. Grössere Dateien lehnt der Server ab.`,
      "err"
    );
    return;
  }
  /* Grosse Videos sind erlaubt. Der Hinweis sagt nur, was den Nutzer erwartet —
     er ist keine Abweisung und keine Aufforderung, die Datei kleiner zu machen.
     Bis August 2026 stand hier eine rote Fehlermeldung ("kürzer schneiden oder
     stärker komprimieren"); sie sah aus wie eine Sperre, obwohl der Upload
     weiterlief. */
  if (kind === "video" && file.size > VIDEO_WARN_BYTES) {
    toast(`${file.name} ist ${bytes(file.size)} — über Mobilfunk kann das Hochladen länger dauern.`);
  }

  uploads.set(tempId, { name: file.name, percent: 0 });
  emit("uploads");

  try {
    const db = getDb();
    if (/quicktime|\.mov$/i.test(file.type + " " + file.name)) {
      toast(
        "Achtung: .mov-Videos (iPhone) laufen auf Android und Windows oft nicht. Fuer das Hero-Video besser als MP4 (H.264) exportieren.",
        "err"
      );
    }
    const id = db.ref(PATHS.media).push().key;
    const clean = slug(file.name.replace(/\.[^.]+$/, "")) || "bild";
    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
    const storagePath = `${STORAGE_PREFIX}/${id}/${clean}${ext}`;

    const task = getStorage().ref(storagePath).put(file, {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
      customMetadata: { uploadedAt: new Date().toISOString() },
    });

    const url = await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          const u = uploads.get(tempId);
          if (u) {
            u.percent = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            emit("uploads");
          }
        },
        reject,
        async () => {
          try {
            resolve(await task.snapshot.ref.getDownloadURL());
          } catch (e) {
            reject(e);
          }
        }
      );
    });

    const dims = await mediaSize(file, kind).catch(() => null);
    await db.ref(`${PATHS.media}/${id}`).set({
      name: file.name,
      url,
      storagePath,
      kind,
      size: file.size,
      contentType: file.type,
      width: dims?.w || null,
      height: dims?.h || null,
      duration: dims?.d || null,
      alt: "",
      createdAt: new Date().toISOString(),
      createdBy: S.user?.email || "Verwaltung",
    });

    toast(`${file.name} hochgeladen`);
  } catch (e) {
    console.error(e);
    const hint =
      e && /cors|network/i.test(String(e.message))
        ? " — CORS für den Storage-Bucket setzen (siehe firebase/set-cors.sh)"
        : "";
    toast(`Upload fehlgeschlagen: ${file.name}${hint}`, "err");
    /* Der Eintrag bleibt stehen — mit Fehlertext und der Datei selbst, damit
       sich derselbe Upload wiederholen laesst. Frueher verschwand die Zeile im
       finally-Block: bei einem Abbruch nach 40 MB war nicht mehr zu sehen, was
       gescheitert war, und die Datei musste neu ausgewaehlt werden. */
    const u = uploads.get(tempId);
    if (u) {
      u.error = String(e?.message || e) + hint;
      u.file = file;
      u.percent = 0;
      emit("uploads");
    }
    return;
  }
  uploads.delete(tempId);
  emit("uploads");
}

/** Einen gescheiterten Upload noch einmal versuchen. */
export function uploadWiederholen(tempId) {
  const u = uploads.get(tempId);
  if (!u?.file) return;
  const datei = u.file;
  uploads.delete(tempId);
  emit("uploads");
  uploadOne(datei);
}

/** Einen gescheiterten Upload aus der Liste nehmen. */
export function uploadVerwerfen(tempId) {
  uploads.delete(tempId);
  emit("uploads");
}

/** Breite/Höhe (und bei Video die Länge) aus der Datei lesen. */
function mediaSize(file, kind) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const done = (v) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Masse nicht lesbar"));
    };
    if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () =>
        done({ w: v.videoWidth, h: v.videoHeight, d: Math.round(v.duration) || null });
      v.onerror = fail;
      v.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = fail;
    img.src = url;
  });
}

/* ------------------------------------------------------------------ pflege */

export function mediaList() {
  return Object.entries(S.media || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Der Inhalt wird für die Verwendungs-Zählung nur einmal je Änderung
// serialisiert — sonst einmal pro Kachel, was bei vielen Bildern bremst.
let usageCache = { stamp: -1, json: "" };
export function usageCount(url) {
  if (!url) return 0;
  const stamp = S.contentStamp || 0;
  if (usageCache.stamp !== stamp) {
    usageCache = { stamp, json: JSON.stringify(S.content || {}) };
  }
  return (usageCache.json.match(new RegExp(escapeRe(url), "g")) || []).length;
}
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function deleteMedia(item) {
  if (DEMO) return toast("Vorführ-Modus: Löschen ist hier abgeschaltet.");
  const uses = usageCount(item.url);
  const ok = await confirmDialog(
    isVideo(item) ? "Video löschen?" : "Bild löschen?",
    uses
      ? `„${item.name}“ wird auf der Website noch ${uses}× verwendet. Diese Stellen bleiben dann leer.`
      : `„${item.name}“ wird endgültig aus Firebase Storage entfernt.`,
    "Endgültig löschen"
  );
  if (!ok) return;
  try {
    if (item.storagePath) await getStorage().ref(item.storagePath).delete();
  } catch (e) {
    console.warn("Storage-Löschung:", e.message);
  }
  await getDb().ref(`${PATHS.media}/${item.id}`).remove();
  toast(isVideo(item) ? "Video gelöscht" : "Bild gelöscht");
}

export async function renameMedia(id, patch) {
  if (DEMO) return toast("Vorführ-Modus: Änderungen an der Mediathek werden nicht gespeichert.");
  await getDb().ref(`${PATHS.media}/${id}`).update(patch);
}

/* -------------------------------------------------------------- ansicht */

/** Ist dieser Eintrag ein Video? */
export const isVideo = (item) => item?.kind === "video" || looksLikeVideo(item?.url);

const duration = (sec) =>
  sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} min` : null;

/** Kachel für ein Medium. `onPick` macht die Kachel klickbar (Auswahlmodus). */
function tile(item, onPick) {
  const uses = usageCount(item.url);
  const video = isVideo(item);
  const meta = [
    item.width ? `${item.width}×${item.height}` : null,
    duration(item.duration),
    item.size ? bytes(item.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const thumb = el("div", { class: "tile-img" + (video ? " is-video" : "") }, [
    video
      ? stummesVideo({
          src: item.url,
          loop: true,
          playsinline: true,
          preload: "metadata",
          onmouseenter: (e) => e.target.play().catch(() => {}),
          onmouseleave: (e) => {
            e.target.pause();
            e.target.currentTime = 0;
          },
        })
      : el("img", { src: item.url, alt: item.alt || item.name, loading: "lazy" }),
    video ? el("span", { class: "play-badge" }, "▶ Video") : null,
  ]);

  const body = el("div", { class: "tile-body" }, [
    el("strong", { class: "tile-name", title: item.name }, item.name),
    el("span", { class: "tile-meta" }, meta),
    el("span", { class: "tile-meta" }, relativeTime(item.createdAt)),
    uses ? el("span", { class: "tag" }, `${uses}× verwendet`) : el("span", { class: "tag off" }, "unbenutzt"),
  ]);

  if (onPick) {
    return el("button", { type: "button", class: "tile pick", onclick: () => onPick(item) }, [thumb, body]);
  }

  const altInput = el("input", {
    type: "text",
    value: item.alt || "",
    placeholder: "Alt-Text (optional)",
    maxlength: 300,
    onchange: (e) => renameMedia(item.id, { alt: e.target.value }).then(() => toast("Alt-Text gespeichert")),
  });

  return el("div", { class: "tile" }, [
    thumb,
    body,
    el("div", { class: "tile-foot" }, [
      altInput,
      el("div", { class: "tile-actions" }, [
        el(
          "button",
          {
            type: "button",
            class: "btn ghost sm",
            onclick: () => {
              navigator.clipboard?.writeText(item.url);
              toast("URL kopiert");
            },
          },
          "URL kopieren"
        ),
        el("a", { class: "btn ghost sm", href: item.url, target: "_blank", rel: "noopener" }, "Öffnen"),
        el("button", { type: "button", class: "btn danger sm", onclick: () => deleteMedia(item) }, "Löschen"),
      ]),
    ]),
  ]);
}

/** Drop-Zone + versteckter Datei-Dialog. */
function dropZone() {
  const input = el("input", {
    type: "file",
    accept: ACCEPT_ATTR,
    multiple: true,
    class: "sr-only",
    onchange: (e) => {
      uploadFiles(e.target.files);
      e.target.value = "";
    },
  });
  const zone = el(
    "div",
    {
      class: "drop",
      tabindex: "0",
      role: "button",
      onclick: () => input.click(),
      onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click()),
      ondragover: (e) => {
        e.preventDefault();
        zone.classList.add("over");
      },
      ondragleave: () => zone.classList.remove("over"),
      ondrop: (e) => {
        e.preventDefault();
        zone.classList.remove("over");
        uploadFiles(e.dataTransfer.files);
      },
    },
    [
      el("strong", {}, "Bilder oder Videos hierher ziehen"),
      el("span", {}, `oder klicken — JPG, PNG, WebP, AVIF, GIF, MP4, WebM · bis ${bytes(MAX_UPLOAD_BYTES)}`),
      // Kein Rat zum Komprimieren: grosse Videos sind erlaubt. Gesagt wird nur,
      // was den Nutzer erwartet.
      el("span", { class: "field-hint" }, "Grosse Videos gehen durch — über Mobilfunk dauert das Hochladen länger."),
      input,
    ]
  );
  return zone;
}

function uploadProgress() {
  const host = el("div", { class: "uploads" });
  const render = () => {
    host.innerHTML = "";
    uploads.forEach((u, tempId) => {
      // Gescheitert: Fehlertext plus Wiederholen — statt einer Zeile, die
      // stillschweigend auf 0 % stehen bleibt.
      if (u.error) {
        host.appendChild(
          el("div", { class: "upl err" }, [
            el("span", { class: "upl-name" }, u.name),
            el("span", { class: "upl-fehler" }, "fehlgeschlagen: " + u.error),
            el("button", { class: "btn ghost sm", onclick: () => uploadWiederholen(tempId) }, "Wiederholen"),
            el("button", { class: "tool", title: "Verwerfen", "aria-label": "Verwerfen",
              onclick: () => uploadVerwerfen(tempId) }, "✕"),
          ])
        );
        return;
      }
      host.appendChild(
        el("div", { class: "upl" }, [
          el("span", { class: "upl-name" }, u.name),
          el("div", { class: "upl-bar" }, [el("div", { class: "upl-fill", style: `width:${u.percent}%` })]),
          el("span", { class: "upl-pct" }, u.percent + "%"),
        ])
      );
    });
  };
  render();
  host.dataset.progress = "1";
  return { host, render };
}

/** Ansicht „Medien“. */
export function renderMedia() {
  const grid = el("div", { class: "grid" });
  const prog = uploadProgress();
  const count = el("p", { class: "muted" });

  const render = () => {
    const items = mediaList();
    grid.innerHTML = "";
    if (!items.length) {
      grid.appendChild(el("p", { class: "empty" }, "Noch keine Bilder hochgeladen."));
    }
    items.forEach((it) => grid.appendChild(tile(it, null)));
    const unused = items.filter((i) => !usageCount(i.url)).length;
    const videos = items.filter(isVideo).length;
    count.textContent =
      `${items.length - videos} Bild${items.length - videos === 1 ? "" : "er"}` +
      (videos ? ` · ${videos} Video${videos === 1 ? "" : "s"}` : "") +
      (unused ? ` · ${unused} unbenutzt` : "");
    prog.render();
  };
  render();

  const view = el("div", { class: "view" }, [
    el("div", { class: "view-head" }, [
      el("div", {}, [el("h2", {}, "Medien"), count]),
    ]),
    dropZone(),
    prog.host,
    grid,
  ]);
  view._refresh = render;

  // Fortschritt der laufenden Uploads mitverfolgen — sonst bliebe die Zeile
  // nach dem Hochladen auf 100 % stehen, bis das nächste Medien-Ereignis kommt.
  const off = uploadsChanged(() => {
    if (!view.isConnected) return off();
    prog.render();
  });

  return view;
}

/* ------------------------------------------------------------ auswahl-dialog */

/** kind: "image" | "video" | undefined (alles) */
function filterKind(items, kind) {
  if (!kind) return items;
  return items.filter((i) => (kind === "video" ? isVideo(i) : !isVideo(i)));
}

/**
 * Tabs "Bilder | Videos | Alle" ueber dem Raster.
 *
 * ANLASS: Der Dialog filterte still nach dem Feld, aus dem er geoeffnet wurde.
 * Bei einem Bildfeld sah man deshalb nur Fotos — waehrend die Ablegezone
 * darueber "Bilder oder Videos hierher ziehen" sagte. Hochgeladene MP4 waren
 * damit unsichtbar und schienen zu fehlen.
 *
 * Der Tab, mit dem der Dialog aufgeht, richtet sich weiter nach dem Feld
 * (Video-Feld → Videos, Bildfeld → Bilder); umschalten laesst sich jetzt aber.
 */
function pickTabs(start, onChange) {
  const host = el("div", { class: "pick-tabs", role: "tablist" });
  let aktiv = start;
  const zeichnen = () => {
    host.innerHTML = "";
    for (const [wert, text] of [["alle", "Alle"], ["image", "Bilder"], ["video", "Videos"]]) {
      const anzahl = filterKind(mediaList(), wert === "alle" ? undefined : wert).length;
      host.appendChild(
        el(
          "button",
          {
            class: "pick-tab" + (aktiv === wert ? " on" : ""),
            role: "tab",
            "aria-selected": aktiv === wert ? "true" : "false",
            dataset: { tab: wert },
            onclick: () => {
              if (aktiv === wert) return;
              aktiv = wert;
              zeichnen();
              onChange(aktiv);
            },
          },
          [el("span", {}, text), el("span", { class: "pick-tab-n" }, String(anzahl))]
        )
      );
    }
  };
  zeichnen();
  return {
    host,
    get: () => aktiv,
    /** Nach einem Upload auf die Art der neuen Datei umschalten. */
    zeigen: (wert) => {
      if (!wert || aktiv === wert) {
        zeichnen();
        return false;
      }
      aktiv = wert;
      zeichnen();
      return true;
    },
    neu: zeichnen,
  };
}

function pickMedia(opts = {}) {
  return new Promise((resolve) => {
    const grid = el("div", { class: "grid pickgrid" });
    const prog = uploadProgress();

    const close = (val) => {
      off();
      offUploads();
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => e.key === "Escape" && close(null);

    const tabs = pickTabs(opts.kind || "alle", () => fill());
    const fill = () => {
      const tab = tabs.get();
      const items = filterKind(mediaList(), tab === "alle" ? undefined : tab);
      tabs.neu();
      grid.innerHTML = "";
      if (!items.length) {
        grid.appendChild(
          el(
            "p",
            { class: "empty" },
            (tab === "video"
              ? "Noch kein Video hochgeladen"
              : tab === "image"
              ? "Noch kein Bild hochgeladen"
              : "Noch nichts hochgeladen") + " — zieh die Dateien oben einfach hier hinein."
          )
        );
      }
      items.forEach((it) => grid.appendChild(tile(it, (item) => close(item))));
    };
    fill();

    const wrap = el("div", { class: "modal", onclick: (e) => e.target === wrap && close(null) }, [
      el("div", { class: "modal-box wide", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "modal-head" }, [
          el("h3", {}, { image: "Bild auswählen", video: "Video auswählen" }[opts.kind] || "Bild oder Video auswählen"),
          el("button", { class: "tool", onclick: () => close(null), "aria-label": "Schliessen" }, "✕"),
        ]),
        dropZone(),
        prog.host,
        tabs.host,
        grid,
      ]),
    ]);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);

    /* Neu hochgeladene Dateien sofort zeigen — und zwar im passenden Tab. Ein
       MP4, das in einem Bildfeld hochgeladen wird, waere unter "Bilder"
       unsichtbar; der Dialog schaltet deshalb auf "Videos" um. */
    const off = mediaChanged(() => {
      const neueste = mediaList()[0];
      if (neueste) tabs.zeigen(isVideo(neueste) ? "video" : "image");
      fill();
    });
    const offUploads = uploadsChanged(prog.render);
  });
}

/** Mehrfach-Auswahl (für die Galerie). Liefert ein Array von Medien. */
export function pickMany(opts = {}) {
  return new Promise((resolve) => {
    const chosen = new Set();
    const grid = el("div", { class: "grid pickgrid" });
    const prog = uploadProgress();
    const okBtn = el("button", { class: "btn solid", disabled: true, onclick: () => close(list()) }, "Übernehmen");

    const list = () => mediaList().filter((m) => chosen.has(m.id));
    const tabs = pickTabs(opts.kind || "alle", () => fill());
    const visible = () =>
      filterKind(mediaList(), tabs.get() === "alle" ? undefined : tabs.get());
    const close = (val) => {
      off();
      offUploads();
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => e.key === "Escape" && close([]);

    const fill = () => {
      const items = visible();
      tabs.neu();
      grid.innerHTML = "";
      if (!items.length) {
        grid.appendChild(
          el(
            "p",
            { class: "empty" },
            (tabs.get() === "image"
              ? "Noch kein Bild hochgeladen"
              : tabs.get() === "video"
              ? "Noch kein Video hochgeladen"
              : "Noch nichts hochgeladen") + " — zieh die Dateien oben einfach hier hinein."
          )
        );
      }
      items.forEach((it) => {
        const t = tile(it, () => {
          if (chosen.has(it.id)) chosen.delete(it.id);
          else chosen.add(it.id);
          t.classList.toggle("chosen", chosen.has(it.id));
          okBtn.disabled = chosen.size === 0;
          okBtn.textContent = chosen.size ? `${chosen.size} übernehmen` : "Übernehmen";
        });
        if (chosen.has(it.id)) t.classList.add("chosen");
        grid.appendChild(t);
      });
    };
    fill();

    const wrap = el("div", { class: "modal", onclick: (e) => e.target === wrap && close([]) }, [
      el("div", { class: "modal-box wide", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "modal-head" }, [
          el("h3", {}, { image: "Bilder auswählen", video: "Videos auswählen" }[opts.kind] || "Medien auswählen"),
          el("button", { class: "tool", onclick: () => close([]), "aria-label": "Schliessen" }, "✕"),
        ]),
        dropZone(),
        prog.host,
        tabs.host,
        grid,
        el("div", { class: "modal-foot" }, [
          el("button", { class: "btn ghost", onclick: () => close([]) }, "Abbrechen"),
          okBtn,
        ]),
      ]),
    ]);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);

    /* Wie im Einzel-Dialog: eine neu hochgeladene Datei erscheint im Tab ihrer
       Art, damit sie nicht unsichtbar bleibt. */
    const off = mediaChanged(() => {
      const neueste = mediaList()[0];
      if (neueste) tabs.zeigen(isVideo(neueste) ? "video" : "image");
      fill();
    });
    const offUploads = uploadsChanged(prog.render);
  });
}

/* Abonnements: Medienliste bzw. laufende Uploads haben sich geändert.
   app.js ruft notifyMediaChanged()/notifyUploadsChanged() aus store.onChange. */
const mediaSubs = new Set();
const uploadSubs = new Set();

export function notifyMediaChanged() {
  mediaSubs.forEach((fn) => fn());
}
export function notifyUploadsChanged() {
  uploadSubs.forEach((fn) => fn());
}
function mediaChanged(fn) {
  mediaSubs.add(fn);
  return () => mediaSubs.delete(fn);
}
function uploadsChanged(fn) {
  uploadSubs.add(fn);
  return () => uploadSubs.delete(fn);
}

setMediaPicker(pickMedia);
