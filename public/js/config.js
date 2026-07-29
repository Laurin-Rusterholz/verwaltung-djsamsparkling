/* ==========================================================================
   Verwaltung DJ Sam Sparkling — Konfiguration
   Firebase-Werte identisch zu ai-sync (public/index.html, public/drive.html).
   Diese Werte sind bewusst öffentlich (Web-API-Key); der Schutz kommt aus den
   Realtime-Database- und Storage-Regeln, siehe firebase/.
   ========================================================================== */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC6xVo-wmXC4JjG7qMQnOExIjU-UDvBluE",
  authDomain: "jupidu-36804.firebaseapp.com",
  databaseURL: "https://jupidu-36804-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "jupidu-36804",
  storageBucket: "jupidu-36804.firebasestorage.app",
  messagingSenderId: "11390726952",
  appId: "1:11390726952:web:aba2f101b6c5ca2bc5561d",
  measurementId: "G-LT97CCT5DF",
};

/** RTDB-Instanz explizit (europe-west1) — wie in ai-sync. */
export const RTDB_URL =
  "https://jupidu-36804-default-rtdb.europe-west1.firebasedatabase.app";

/** Wurzelknoten in der Realtime Database. */
export const ROOT = "samsparking";

export const PATHS = {
  content: `${ROOT}/content`, // die komplette Website
  versions: `${ROOT}/versions`, // Verlauf der letzten Publikationen
  inquiries: `${ROOT}/inquiries`, // Booking-Anfragen vom Website-Formular
  media: `${ROOT}/media`, // Medienbibliothek (Metadaten)
  config: `${ROOT}/config`, // Build-Hook, Website-URL
  session: `${ROOT}/session`, // Nachweis "dieses Gerät kennt das Passwort"
  gate: `${ROOT}/gate`, // Hash des gemeinsamen Passworts (nur Regeln lesen ihn)
};

/**
 * Aufgaben-Eingang von Quantus (ai-sync). Liegt bewusst NICHT unter
 * `samsparking`, sondern auf der Wurzel — dort liest Quantus
 * (ai-sync/public/index.html) mit `child_added` mit, legt pro Eintrag über
 * `createEntity("task", …)` eine echte Aufgabe an und entfernt den Knoten
 * wieder. Ein Eintrag verschwindet also, sobald Quantus offen war.
 */
export const QUANTUS_INBOX = "quantus_task_inbox";

/**
 * Projekt in Quantus, dem Website-Wünsche zugeordnet werden — die externe
 * Projekt-ID im Format `PRJ-XXXXX`. Leer lassen heisst: die Aufgabe entsteht
 * ohne Projekt (so war es bisher). Quantus löst die ID beim Import auf; findet
 * es kein passendes Projekt, bleibt die Aufgabe trotzdem erhalten.
 */
export const QUANTUS_PROJECT = "";

/**
 * Vorführ-Modus. Aus (false) ist dies die echte Verwaltung: Anmeldung mit dem
 * gemeinsamen Passwort, Speichern und Publizieren schreiben in die Datenbank.
 *
 * An (true) öffnet sich die Verwaltung ohne Passwort und zeigt den echten,
 * öffentlich lesbaren Inhalt — aber nichts wird zurückgeschrieben: Speichern,
 * Publizieren, Uploads und Anfragen sind stillgelegt, Änderungen bleiben im
 * Browser. Genutzt von der Präsentations-Fassung (Repo Beispiel-Sami), die nur
 * diese eine Datei anders hat.
 */
export const DEMO = false;

/** Ablage der Bilder und Videos in Firebase Storage. */
export const STORAGE_PREFIX = `${ROOT}/media`;

/** Fallback, solange unter Einstellungen keine Website-URL gesetzt ist. */
export const DEFAULT_SITE_URL = "https://www.samsparking.ch";

/** Grösse pro Datei. Muss zu den Storage-Regeln passen (firebase/storage.rules). */
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024; // 250 MB

/** Ab hier warnt die Verwaltung: so grosse Hero-Videos laden spürbar lange. */
export const VIDEO_WARN_BYTES = 12 * 1024 * 1024; // 12 MB

export const ACCEPTED_TYPES = {
  image: /^image\/(jpeg|png|webp|avif|gif)$/,
  video: /^video\/(mp4|webm|quicktime)$/,
};

/** Was der Datei-Dialog anbietet. */
export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm";
