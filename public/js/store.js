/* ==========================================================================
   Store — Firebase (Auth, Realtime Database, Storage) + Zustand
   ========================================================================== */

import { FIREBASE_CONFIG, RTDB_URL, PATHS, DEFAULT_SITE_URL } from "./config.js";
import { clone, withDefaults, pruneForRtdb, toast } from "./util.js";

export const S = {
  user: null,
  content: null, // aktueller (evtl. ungespeicherter) Inhalt
  saved: null, // Stand in der Datenbank, zum Dirty-Vergleich
  defaults: null,
  media: {}, // id → {name, url, storagePath, size, contentType, createdAt}
  inquiries: {}, // id → Anfrage
  config: {}, // {buildHook, siteUrl, lastPublish}
  dirty: false,
  ready: false,
};

let db = null;
let storage = null;
let auth = null;
const listeners = new Set();

/** Auf Zustandsaenderungen hören. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(what = "state") {
  listeners.forEach((fn) => {
    try {
      fn(what);
    } catch (e) {
      console.error(e);
    }
  });
}

export function markDirty() {
  const d = JSON.stringify(S.content) !== JSON.stringify(S.saved);
  if (d !== S.dirty) {
    S.dirty = d;
    emit("dirty");
  } else {
    S.dirty = d;
  }
}

/* ------------------------------------------------------------------- init */

export function initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  storage = firebase.storage();
  db = firebase.app().database(RTDB_URL);
  return { auth, db, storage };
}

export const getDb = () => db;
export const getStorage = () => storage;
export const getAuth = () => auth;

export async function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (e && e.code === "auth/popup-blocked" && window.self === window.top) {
      await auth.signInWithRedirect(provider);
      return;
    }
    if (e && e.code === "auth/popup-closed-by-user") return;
    throw e;
  }
}

export async function signOut() {
  await auth.signOut();
}

/* ------------------------------------------------------------ laden */

async function readOnce(path) {
  const snap = await db.ref(path).get();
  return snap.exists() ? snap.val() : null;
}

async function loadDefaults() {
  if (S.defaults) return S.defaults;
  const res = await fetch("defaults/site.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("defaults/site.json nicht ladbar");
  S.defaults = await res.json();
  return S.defaults;
}

/**
 * Inhalt laden. Ist der Knoten leer (erster Start), wird der Standard-Inhalt
 * verwendet — aber noch NICHT geschrieben; das passiert beim ersten Speichern.
 */
export async function loadAll() {
  const defaults = await loadDefaults();
  const [content, cfg] = await Promise.all([readOnce(PATHS.content), readOnce(PATHS.config)]);

  S.content = normalize(withDefaults(content ? clone(content) : clone(defaults), defaults));
  S.saved = content ? clone(S.content) : null; // null ⇒ noch nie gespeichert
  S.config = cfg || {};
  if (!S.config.siteUrl) S.config.siteUrl = DEFAULT_SITE_URL;
  S.dirty = S.saved === null;
  S.ready = true;

  // Medien und Anfragen live mitverfolgen
  db.ref(PATHS.media).on(
    "value",
    (snap) => {
      S.media = snap.val() || {};
      emit("media");
    },
    (err) => console.warn("media:", err.message)
  );
  db.ref(PATHS.inquiries).on(
    "value",
    (snap) => {
      S.inquiries = snap.val() || {};
      emit("inquiries");
    },
    (err) => console.warn("inquiries:", err.message)
  );

  emit("loaded");
}

/**
 * Struktur begradigen: die Realtime Database speichert Arrays mit Löchern als
 * Objekt ({"0":…,"2":…}) und lässt leere Arrays ganz weg. Beim Laden bauen wir
 * daraus wieder echte Arrays.
 */
function normalize(c) {
  const arrays = [
    "site.keywords",
    "ticker.items",
    "layout",
    "sections.about.paragraphs",
    "sections.about.words",
    "sections.about.facts",
    "sections.sound.genres",
    "sections.sound.mixes",
    "sections.shows.items",
    "sections.references.items",
    "sections.gallery.items",
    "sections.booking.available",
    "sections.booking.rider.groups",
    "sections.contact.socials",
  ];
  const toArray = (v) => {
    if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined);
    if (v && typeof v === "object")
      return Object.keys(v)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => v[k])
        .filter((x) => x !== null && x !== undefined);
    return [];
  };
  const walk = (obj, path) => {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") return;
      cur = cur[keys[i]];
    }
    const last = keys[keys.length - 1];
    cur[last] = toArray(cur[last]);
  };
  arrays.forEach((p) => walk(c, p));
  // Rider-Gruppen haben selbst wieder Listen
  (c.sections?.booking?.rider?.groups || []).forEach((g) => {
    g.items = toArray(g.items);
  });
  // Nur bekannte Abschnitte im Layout, und keine doppelt
  const known = Object.keys(c.sections || {});
  const seen = new Set();
  c.layout = toArray(c.layout).filter((k) => known.includes(k) && !seen.has(k) && seen.add(k));
  known.forEach((k) => {
    if (!c.layout.includes(k)) c.layout.push(k);
  });
  return c;
}

/* --------------------------------------------------------------- speichern */

export async function saveContent() {
  const payload = clone(S.content);
  payload.updatedAt = new Date().toISOString();
  payload.updatedBy = S.user?.email || "unbekannt";
  await db.ref(PATHS.content).set(pruneForRtdb(payload));
  S.content.updatedAt = payload.updatedAt;
  S.content.updatedBy = payload.updatedBy;
  S.saved = clone(S.content);
  S.dirty = false;
  emit("saved");
  return payload.updatedAt;
}

export async function saveConfig(patch) {
  Object.assign(S.config, patch);
  await db.ref(PATHS.config).update(pruneForRtdb(patch));
  emit("config");
}

/**
 * Publizieren: speichern, Versions-Schnappschuss ablegen, Netlify-Build-Hook
 * anstossen.
 *
 * Der Build-Hook wird per no-cors abgeschickt — Netlify sendet keine
 * CORS-Header, die Antwort ist also nicht lesbar. Kommt der Aufruf durch, hat
 * Netlify den Build angenommen; sichtbar wird das im Netlify-Deploy-Log.
 */
export async function publish() {
  const updatedAt = await saveContent();

  const snapshot = {
    at: updatedAt,
    by: S.user?.email || "unbekannt",
    content: pruneForRtdb(clone(S.content)),
  };
  try {
    await db.ref(PATHS.versions).push(snapshot);
    await trimVersions();
  } catch (e) {
    console.warn("Version nicht gespeichert:", e.message);
  }

  const hook = (S.config.buildHook || "").trim();
  if (!hook) {
    await saveConfig({ lastPublish: updatedAt, lastPublishHook: false });
    return { built: false, reason: "kein Build-Hook hinterlegt" };
  }
  if (!/^https:\/\/api\.netlify\.com\/build_hooks\//.test(hook)) {
    await saveConfig({ lastPublish: updatedAt, lastPublishHook: false });
    return { built: false, reason: "Build-Hook sieht nicht wie eine Netlify-URL aus" };
  }
  try {
    await fetch(hook, { method: "POST", mode: "no-cors" });
    await saveConfig({ lastPublish: updatedAt, lastPublishHook: true });
    return { built: true };
  } catch (e) {
    await saveConfig({ lastPublish: updatedAt, lastPublishHook: false });
    return { built: false, reason: e.message };
  }
}

/** Nur die letzten 20 Versionen behalten. */
async function trimVersions() {
  const snap = await db.ref(PATHS.versions).orderByKey().get();
  const keys = snap.exists() ? Object.keys(snap.val()) : [];
  if (keys.length <= 20) return;
  const drop = keys.sort().slice(0, keys.length - 20);
  const updates = {};
  drop.forEach((k) => (updates[k] = null));
  await db.ref(PATHS.versions).update(updates);
}

export async function listVersions() {
  const snap = await db.ref(PATHS.versions).orderByKey().limitToLast(20).get();
  const val = snap.exists() ? snap.val() : {};
  return Object.entries(val)
    .map(([id, v]) => ({ id, at: v.at, by: v.by, content: v.content }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Eine alte Version in den Editor zurückholen (noch nicht speichern). */
export function restoreVersion(version) {
  S.content = normalize(withDefaults(clone(version.content), S.defaults));
  markDirty();
  emit("loaded");
}

/** Alles auf den Standard-Inhalt zurücksetzen (nur im Editor). */
export function resetToDefaults() {
  S.content = normalize(clone(S.defaults));
  markDirty();
  emit("loaded");
}

/* ------------------------------------------------------------ anfragen */

export async function updateInquiry(id, patch) {
  await db.ref(`${PATHS.inquiries}/${id}`).update(patch);
}

export async function deleteInquiry(id) {
  await db.ref(`${PATHS.inquiries}/${id}`).remove();
}

/* -------------------------------------------------------- warnung beim weg */

window.addEventListener("beforeunload", (e) => {
  if (S.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

export { toast };
