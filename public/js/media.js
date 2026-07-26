/* ==========================================================================
   Medien — Upload nach Firebase Storage, Metadaten in der Realtime Database
   ========================================================================== */

import { PATHS, STORAGE_PREFIX, MAX_UPLOAD_BYTES } from "./config.js";
import { el, bytes, relativeTime, toast, confirmDialog, slug } from "./util.js";
import { S, getDb, getStorage, emit } from "./store.js";
import { setMediaPicker } from "./fields.js";

const uploads = new Map(); // tempId → {name, percent, error}

/* ------------------------------------------------------------------ upload */

export async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) uploadOne(file);
}

async function uploadOne(file) {
  const tempId = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)) {
    toast(`${file.name}: nur JPG, PNG, WebP, AVIF oder GIF`, "err");
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    toast(`${file.name} ist ${bytes(file.size)} — max. ${bytes(MAX_UPLOAD_BYTES)}`, "err");
    return;
  }

  uploads.set(tempId, { name: file.name, percent: 0 });
  emit("uploads");

  try {
    const db = getDb();
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

    const dims = await imageSize(file).catch(() => null);
    await db.ref(`${PATHS.media}/${id}`).set({
      name: file.name,
      url,
      storagePath,
      size: file.size,
      contentType: file.type,
      width: dims?.w || null,
      height: dims?.h || null,
      alt: "",
      createdAt: new Date().toISOString(),
      createdBy: S.user?.email || "unbekannt",
    });

    toast(`${file.name} hochgeladen`);
  } catch (e) {
    console.error(e);
    const hint =
      e && /cors|network/i.test(String(e.message))
        ? " — CORS für den Storage-Bucket setzen (siehe firebase/set-cors.sh)"
        : "";
    toast(`Upload fehlgeschlagen: ${file.name}${hint}`, "err");
  } finally {
    uploads.delete(tempId);
    emit("uploads");
  }
}

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("kein Bild"));
    };
    img.src = url;
  });
}

/* ------------------------------------------------------------------ pflege */

export function mediaList() {
  return Object.entries(S.media || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function usageCount(url) {
  if (!url) return 0;
  return (JSON.stringify(S.content || {}).match(new RegExp(escapeRe(url), "g")) || []).length;
}
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function deleteMedia(item) {
  const uses = usageCount(item.url);
  const ok = await confirmDialog(
    "Bild löschen?",
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
  toast("Bild gelöscht");
}

export async function renameMedia(id, patch) {
  await getDb().ref(`${PATHS.media}/${id}`).update(patch);
}

/* -------------------------------------------------------------- ansicht */

/** Kachel für ein Bild. `onPick` macht die Kachel klickbar (Auswahlmodus). */
function tile(item, onPick) {
  const uses = usageCount(item.url);
  const meta = [
    item.width ? `${item.width}×${item.height}` : null,
    item.size ? bytes(item.size) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const thumb = el("div", { class: "tile-img" }, [
    el("img", { src: item.url, alt: item.alt || item.name, loading: "lazy" }),
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
    accept: "image/*",
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
      el("strong", {}, "Bilder hierher ziehen"),
      el("span", {}, "oder klicken — JPG, PNG, WebP, AVIF, GIF · max. 12 MB"),
      input,
    ]
  );
  return zone;
}

function uploadProgress() {
  const host = el("div", { class: "uploads" });
  const render = () => {
    host.innerHTML = "";
    uploads.forEach((u) => {
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
    count.textContent = `${items.length} Bild${items.length === 1 ? "" : "er"}${
      unused ? ` · ${unused} unbenutzt` : ""
    }`;
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
  return view;
}

/* ------------------------------------------------------------ auswahl-dialog */

function pickMedia() {
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

    const fill = () => {
      const items = mediaList();
      grid.innerHTML = "";
      if (!items.length) {
        grid.appendChild(
          el("p", { class: "empty" }, "Noch keine Bilder — zieh sie oben einfach hier hinein.")
        );
      }
      items.forEach((it) => grid.appendChild(tile(it, (item) => close(item))));
    };
    fill();

    const wrap = el("div", { class: "modal", onclick: (e) => e.target === wrap && close(null) }, [
      el("div", { class: "modal-box wide", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "modal-head" }, [
          el("h3", {}, "Bild auswählen"),
          el("button", { class: "tool", onclick: () => close(null), "aria-label": "Schliessen" }, "✕"),
        ]),
        dropZone(),
        prog.host,
        grid,
      ]),
    ]);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);

    // Neu hochgeladene Bilder sofort im Dialog zeigen
    const off = mediaChanged(fill);
    const offUploads = uploadsChanged(prog.render);
  });
}

/** Mehrfach-Auswahl (für die Galerie). Liefert ein Array von Medien. */
export function pickMany() {
  return new Promise((resolve) => {
    const chosen = new Set();
    const grid = el("div", { class: "grid pickgrid" });
    const prog = uploadProgress();
    const okBtn = el("button", { class: "btn solid", disabled: true, onclick: () => close(list()) }, "Übernehmen");

    const list = () => mediaList().filter((m) => chosen.has(m.id));
    const close = (val) => {
      off();
      offUploads();
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => e.key === "Escape" && close([]);

    const fill = () => {
      const items = mediaList();
      grid.innerHTML = "";
      if (!items.length) {
        grid.appendChild(el("p", { class: "empty" }, "Noch keine Bilder — zieh sie oben einfach hier hinein."));
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
          el("h3", {}, "Bilder auswählen"),
          el("button", { class: "tool", onclick: () => close([]), "aria-label": "Schliessen" }, "✕"),
        ]),
        dropZone(),
        prog.host,
        grid,
        el("div", { class: "modal-foot" }, [
          el("button", { class: "btn ghost", onclick: () => close([]) }, "Abbrechen"),
          okBtn,
        ]),
      ]),
    ]);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);

    const off = mediaChanged(fill);
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
