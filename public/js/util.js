/* ==========================================================================
   Kleine Helfer — DOM, Pfade, Formatierung, Toasts
   ========================================================================== */

/** Element bauen: el("div", {class:"x", onclick:fn}, [kinder|text]) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Wert über einen Pfad lesen: getPath(obj, "sections.about.lede") */
export function getPath(obj, path) {
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);
}

/** Wert über einen Pfad schreiben; fehlende Ebenen werden angelegt. */
export function setPath(obj, path, value) {
  const keys = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

export const clone = (v) => JSON.parse(JSON.stringify(v));

/** Tiefe Ergaenzung: alles aus `defaults`, was in `target` fehlt. */
export function withDefaults(target, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(target) ? target : clone(defaults);
  if (defaults && typeof defaults === "object") {
    const out = target && typeof target === "object" && !Array.isArray(target) ? target : {};
    for (const [k, v] of Object.entries(defaults)) {
      out[k] = withDefaults(out[k], v);
    }
    return out;
  }
  return target === undefined ? defaults : target;
}

/**
 * Leere Strings zu null machen: die Realtime Database loescht null-Werte,
 * damit bleiben keine leeren Felder im Datensatz haengen. Arrays behalten
 * ihre Laenge (dort wuerde null Loecher reissen → leerer String bleibt).
 */
export function pruneForRtdb(value) {
  if (Array.isArray(value)) return value.map((v) => (Array.isArray(v) || (v && typeof v === "object") ? pruneForRtdb(v) : v === undefined ? "" : v));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const p = Array.isArray(v) || (v && typeof v === "object") ? pruneForRtdb(v) : v;
      out[k] = p === "" || p === undefined ? null : p;
    }
    return out;
  }
  return value;
}

export const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatDate(iso, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const opts = { day: "2-digit", month: "2-digit", year: "numeric" };
  if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("de-CH", opts);
}

export function relativeTime(iso) {
  if (!iso) return "noch nie";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return String(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 30) return `vor ${d} Tag${d === 1 ? "" : "en"}`;
  return formatDate(iso);
}

export const bytes = (n) =>
  n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " kB";

export function debounce(fn, ms = 400) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function slug(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * SHA-256 als Hex. Braucht einen sicheren Kontext (HTTPS oder localhost) —
 * auf Netlify immer gegeben.
 */
export async function sha256Hex(text) {
  if (!crypto?.subtle) throw new Error("Braucht HTTPS (oder localhost)");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* -------------------------------------------------------------- toasts */

let toastHost = null;
export function toast(message, kind = "") {
  if (!toastHost) {
    toastHost = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.appendChild(toastHost);
  }
  const t = el("div", { class: "toast" + (kind ? " " + kind : ""), text: message });
  toastHost.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 300);
  }, kind === "err" ? 6000 : 3200);
}

/* -------------------------------------------------------------- dialoge */

/** Bestaetigungsdialog als Promise<boolean>. */
export function confirmDialog(title, text, okLabel = "Ja, löschen") {
  return new Promise((resolve) => {
    const close = (val) => {
      wrap.remove();
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
    };
    const ok = el("button", { class: "btn danger", onclick: () => close(true) }, okLabel);
    const wrap = el("div", { class: "modal", onclick: (e) => e.target === wrap && close(false) }, [
      el("div", { class: "modal-box", role: "dialog", "aria-modal": "true" }, [
        el("h3", {}, title),
        text ? el("p", {}, text) : null,
        el("div", { class: "modal-foot" }, [
          el("button", { class: "btn ghost", onclick: () => close(false) }, "Abbrechen"),
          ok,
        ]),
      ]),
    ]);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);
    ok.focus();
  });
}
