# Verwaltung DJ Sam Sparkling

Management-Oberfläche für die Website von **Sam Sparkling**
([Repo `s-mi`](https://github.com/Laurin-Rusterholz/s-mi), live auf
`samsparking.ch`). Hier wird die **ganze Website eingestellt**: Texte, Bilder,
Shows, Rider, SEO, Reihenfolge und Sichtbarkeit der Abschnitte — plus die
Booking-Anfragen, die über das Formular auf der Website hereinkommen.

Reine statische Seite, keine Netlify-Functions. Alles läuft direkt gegen dein
bestehendes Firebase-Projekt **jupidu-36804** (dasselbe wie in `ai-sync`).

```
┌────────────────────┐         ┌──────────────────────────────┐
│  Verwaltung        │ schreibt│ Firebase Realtime Database   │
│  (diese Seite)     ├────────▶│  samsparking/content         │
│  Login: Google     │         │  samsparking/media           │
└────────┬───────────┘         │  samsparking/inquiries       │
         │ Upload              │  samsparking/config          │
         ▼                     │  samsparking/versions        │
┌────────────────────┐         └───────────┬──────────────────┘
│ Firebase Storage   │                     │ liest (öffentlich)
│ samsparking/media  │                     ▼
└────────────────────┘         ┌──────────────────────────────┐
         ▲ Bild-URLs           │ Netlify-Build der Website    │
         └─────────────────────│ node scripts/build.mjs       │
                               │ → index.html, sitemap.xml    │
                               └──────────────────────────────┘
                                     ▲ Build-Hook beim Publizieren
```

---

## Einrichten (einmalig)

### 1. Netlify-Site aus diesem Repo

Publish-Verzeichnis ist `public`, kein Build-Command — steht in `netlify.toml`.
Die Seite ist per `X-Robots-Tag: noindex` von Suchmaschinen ausgenommen.

### 2. Firebase: Google-Anmeldung erlauben

Firebase Console → Authentication → Settings → **Authorized domains**: die
Netlify-Adresse der Verwaltung eintragen (z. B.
`verwaltung-djsamsparkling.netlify.app`). Sonst schlägt der Google-Login fehl.

### 3. Firebase: Datenbank-Regeln

Den Block `samsparking` aus `firebase/database.rules.json` in die vollständige
Regeldatei des Projekts einfügen (`ai-sync/firebase/database.rules.json` — dort
ist er bereits ergänzt) und deployen bzw. in der Console einsetzen.

Warum diese Aufteilung:

| Knoten | lesen | schreiben |
|---|---|---|
| `content` | **öffentlich** — der Website-Build liest ihn ohne Anmeldung | nur angemeldet |
| `media` | öffentlich (Bild-URLs sind ohnehin öffentlich) | nur angemeldet |
| `inquiries` | **nur angemeldet** (personenbezogene Daten) | jede/r darf *neue* anlegen (das Formular), nicht überschreiben |
| `config`, `versions` | nur angemeldet | nur angemeldet |

Ohne diese Regeln greift der `$andere`-Catch-All des Projekts — dann wären die
Booking-Anfragen öffentlich lesbar. **Also nicht überspringen.**

### 4. Firebase: Storage-Regeln und CORS

- Regeln: `match`-Block aus `firebase/storage.rules` in die bestehenden
  Storage-Regeln einfügen (Console → Storage → Rules).
- CORS für den Bild-Upload aus dem Browser:

```bash
# Adresse der Verwaltung zuerst in firebase/cors.json ergänzen!
bash firebase/set-cors.sh
```

`gsutil` ersetzt die CORS-Konfiguration des ganzen Buckets — die Liste in
`cors.json` enthält deshalb auch die Origin von `ai-sync`.

### 5. Build-Hook der Website hinterlegen

Netlify (Site der **Website**, nicht der Verwaltung) → Site configuration →
Build & deploy → Build hooks → *Add build hook* → URL kopieren und in der
Verwaltung unter **Einstellungen** einsetzen. Erst dann löst *Publizieren*
tatsächlich einen neuen Website-Build aus.

---

## Bedienung

| Bereich | Was drin ist |
|---|---|
| **Dashboard** | Stand, letzte Publikation, offene Anfragen, nächste Show, Checkliste mit Sprungmarken |
| **Start & Design** | Künstlername, Farben (Grundton + Akzent), Hero-Text, Hero-Bild **oder** -Video, Ticker |
| **SEO & Teilen** | Domain, Titel, Description (mit Längen-Check), Keywords, Vorschaubild fürs Teilen |
| **Abschnitte & Reihenfolge** | Reihenfolge, Sichtbarkeit, Menü-Beschriftungen, zweifarbige Überschriften |
| **About** | Portrait, Einstiegstext, Absätze (`**fett**`, `[Link](url)`), Stichworte, Fakten-Leiste |
| **Sound & Mixe** | Genres, beliebig viele Mixe mit Link und optionalem Player-Embed |
| **Shows** | Termine mit Datum, Location, Stadt, Ticket-Link, „ausverkauft" |
| **Referenzen** | Clubs und Festivals |
| **Galerie** | Bilder aus der Medienbibliothek, sortierbar, mit Alt-Text und Bildnachweis |
| **Booking** | Verfügbarkeit, Presskit, Anfrage-Formular, Rider (Gruppen mit Geräten) |
| **Kontakt** | E-Mail, Telefon, Standort, beliebig viele Social-Links |
| **Medien** | Upload per Drag & Drop nach Firebase Storage, zeigt an, welche Bilder unbenutzt sind |
| **Anfragen** | Eingang aus dem Website-Formular, Status (neu / in Abklärung / bestätigt / abgelehnt), Antwort per Mail |
| **Publizieren** | Publizieren, Verlauf der letzten 20 Stände zum Zurückholen, JSON-Export/Import |
| **Einstellungen** | Build-Hook, Website-Adresse, Datenablage, Standard-Inhalt laden |

**Speichern vs. Publizieren**

- **Speichern** (auch `Strg`/`Cmd` + `S`) schreibt in die Datenbank. Öffentlich
  ändert sich noch nichts.
- **Publizieren** speichert, legt einen Stand im Verlauf ab und ruft den
  Netlify-Build-Hook auf. Nach 1–2 Minuten ist die Website aktuell.

Ungespeicherte Änderungen zeigt der Punkt oben links; beim Verlassen der Seite
warnt der Browser.

## Lokal starten

```bash
npx http-server -p 8080 public
```

Für den Bild-Upload muss `http://localhost:8080` in `firebase/cors.json` stehen
(ist voreingestellt) und in den Authorized domains von Firebase Auth
(`localhost` ist dort standardmässig erlaubt).

## Aufbau

```
public/
  index.html         Hülle, lädt Firebase-compat-SDK
  admin.css          Oberfläche (gleiche Farbwelt wie die Website)
  defaults/site.json Auslieferungs-Inhalt (identisch mit s-mi/content/site.json)
  js/
    config.js        Firebase-Werte, Datenbank-Pfade
    util.js          DOM-Helfer, Pfad-Zugriff, Toasts, Dialoge
    store.js         Auth, Laden/Speichern, Publizieren, Versionen
    fields.js        Formular-Bausteine (Text, Liste, Bildfeld, Karten-Liste)
    media.js         Upload, Medienbibliothek, Bild-Auswahl
    content.js       Editoren je Website-Abschnitt
    inbox.js         Booking-Anfragen
    app.js           Navigation, Dashboard, Publizieren, Einstellungen
firebase/
  database.rules.json  Regeln für samsparking (zum Einfügen)
  storage.rules        Storage-Regeln (zum Einfügen)
  cors.json            CORS-Liste des Buckets
  set-cors.sh          setzt CORS per gsutil
```

Das Inhalts-Schema ist dasselbe, das der Website-Generator liest
(`s-mi/scripts/build.mjs`). Neue Felder gehören daher immer an drei Stellen:
`defaults/site.json`, ein Editor in `content.js`, und die Ausgabe im Generator.

## Datenschutz

Booking-Anfragen enthalten Name, E-Mail und Nachricht von Veranstaltern. Sie
liegen in der Realtime Database und sind nur angemeldet lesbar. Löschen geht in
der Verwaltung unter *Anfragen* pro Eintrag.
