/* ==========================================================================
   Store — Firebase (Auth, Realtime Database, Storage) + Zustand
   ========================================================================== */

import { FIREBASE_CONFIG, RTDB_URL, PATHS, DEFAULT_SITE_URL } from "./config.js";
import { clone, withDefaults, pruneForRtdb, toast, sha256Hex } from "./util.js";

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
  contentStamp: 0, // zählt Änderungen — für Zwischenspeicher, die den Inhalt lesen
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

/**
 * Änderungs-Marke. Der genaue Vergleich (zwei komplette JSON-Serialisierungen)
 * ist bei jedem Tastendruck zu teuer, deshalb wird sofort "geändert" gesetzt
 * und der Vergleich kurz danach nachgezogen — so verschwindet die Marke auch
 * wieder, wenn jemand seine Änderung von Hand rückgängig macht.
 */
let dirtyTimer = null;
export function markDirty() {
  S.contentStamp = (S.contentStamp || 0) + 1;
  if (!S.dirty) {
    S.dirty = true;
    emit("dirty");
  }
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(() => {
    const exact = JSON.stringify(S.content) !== JSON.stringify(S.saved);
    if (exact !== S.dirty) {
      S.dirty = exact;
      emit("dirty");
    }
  }, 400);
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

/* --------------------------------------------------------------- anmeldung
   Gemeinsames Passwort, geprüft von der Datenbank — nicht vom Browser:

   1. anonyme Firebase-Anmeldung (gibt dem Gerät eine uid)
   2. SHA-256 des Passworts nach samsparking/session/<uid>/pw schreiben
   3. Die Regel dort erlaubt den Schreibvorgang nur, wenn der Hash mit
      samsparking/gate/pw übereinstimmt → falsches Passwort = permission_denied
   4. Alle weiteren Regeln verlangen diesen Sitzungs-Nachweis

   Damit verlässt das Passwort den Browser nie im Klartext und der Hash ist
   für Clients nirgends lesbar (die Regeln dürfen ihn lesen, Clients nicht).
*/

export async function signInWithPassword(password) {
  const pw = String(password || "");
  if (pw.length < 4) throw new Error("Passwort zu kurz");

  if (!auth.currentUser) await auth.signInAnonymously();
  const uid = auth.currentUser.uid;
  const hash = await sha256Hex("samsparking:" + pw);

  try {
    await db.ref(`${PATHS.session}/${uid}`).set({ pw: hash, at: new Date().toISOString() });
  } catch (e) {
    const denied = /permission[_ ]denied/i.test(String(e && (e.code || e.message)));
    if (denied) {
      const err = new Error("Falsches Passwort");
      err.wrongPassword = true;
      throw err;
    }
    throw e;
  }
}

/** Ist dieses Gerät (noch) freigeschaltet? Probe auf einen geschützten Knoten. */
export async function hasAccess() {
  if (!auth.currentUser) return false;
  try {
    await db.ref(PATHS.config).get();
    return true;
  } catch (e) {
    if (/permission[_ ]denied/i.test(String(e && (e.code || e.message)))) return false;
    throw e;
  }
}

export async function signOut() {
  const uid = auth.currentUser?.uid;
  // Sitzungs-Nachweis entfernen, damit das Gerät wirklich abgemeldet ist
  if (uid) {
    try {
      await db.ref(`${PATHS.session}/${uid}`).remove();
    } catch (e) {
      console.warn("Sitzung nicht entfernt:", e.message);
    }
  }
  detachListeners();
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
  S.contentStamp++;
  S.saved = content ? clone(S.content) : null; // null ⇒ noch nie gespeichert
  S.config = cfg || {};
  if (!S.config.siteUrl) S.config.siteUrl = DEFAULT_SITE_URL;
  S.dirty = S.saved === null;
  S.ready = true;

  // Medien und Anfragen live mitverfolgen
  watch(PATHS.media, (val) => {
    S.media = val || {};
    emit("media");
  });
  watch(PATHS.inquiries, (val) => {
    S.inquiries = val || {};
    emit("inquiries");
  });

  emit("loaded");
}

/* Laufende Live-Abfragen, damit sie beim Abmelden gelöst werden können —
   sonst laufen sie nach dem Entfernen der Sitzung in permission_denied. */
const watchers = [];

function watch(path, onValue) {
  const ref = db.ref(path);
  const cb = ref.on(
    "value",
    (snap) => onValue(snap.val()),
    (err) => console.warn(`${path}:`, err.message)
  );
  watchers.push({ ref, cb });
}

function detachListeners() {
  while (watchers.length) {
    const w = watchers.pop();
    try {
      w.ref.off("value", w.cb);
    } catch (e) {
      /* egal */
    }
  }
  S.ready = false;
  S.media = {};
  S.inquiries = {};
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
    "pages",
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
  // Jede Seite hat eine Abschnittsliste; nur bekannte Abschnitte, keine doppelt
  const knownSections = Object.keys(c.sections || {});
  (c.pages || []).forEach((p, i) => {
    const seenSec = new Set();
    p.sections = toArray(p.sections).filter(
      (k) => knownSections.includes(k) && !seenSec.has(k) && seenSec.add(k)
    );
    if (i === 0) p.slug = "";
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
  payload.updatedBy = S.user?.email || "Verwaltung";
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
    by: S.user?.email || "Verwaltung",
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
  S.contentStamp++;
  markDirty();
  emit("loaded");
}

/** Alles auf den Standard-Inhalt zurücksetzen (nur im Editor). */
export function resetToDefaults() {
  S.content = normalize(clone(S.defaults));
  S.contentStamp++;
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
