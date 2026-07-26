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

/** Ablage der Bilder und Videos in Firebase Storage. */
export const STORAGE_PREFIX = `${ROOT}/media`;

/** Fallback, solange unter Einstellungen keine Website-URL gesetzt ist. */
export const DEFAULT_SITE_URL = "https://www.samsparking.ch";

/** Grösse pro Datei. Muss zu den Storage-Regeln passen (firebase/storage.rules). */
export const MAX_UPLOAD_BYTES = 48 * 1024 * 1024; // 48 MB

/** Ab hier warnt die Verwaltung: so grosse Hero-Videos laden spürbar lange. */
export const VIDEO_WARN_BYTES = 12 * 1024 * 1024; // 12 MB

export const ACCEPTED_TYPES = {
  image: /^image\/(jpeg|png|webp|avif|gif)$/,
  video: /^video\/(mp4|webm|quicktime)$/,
};

/** Was der Datei-Dialog anbietet. */
export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm";
