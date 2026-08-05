# Verwaltung DJ Sam Sparkling

Management-Oberfläche für die Website von **Sam Sparkling**
([Repo `s-mi`](https://github.com/Laurin-Rusterholz/s-mi), live auf
`djsamsparkling.netlify.app`). Hier wird die **ganze Website eingestellt**: Texte, Bilder,
Shows, Rider, SEO, Reihenfolge und Sichtbarkeit der Abschnitte — plus die
Booking-Anfragen, die über das Formular auf der Website hereinkommen.

Reine statische Seite, keine Netlify-Functions. Alles läuft direkt gegen dein
bestehendes Firebase-Projekt **jupidu-36804** (dasselbe wie in `ai-sync`).

```
┌────────────────────┐         ┌──────────────────────────────┐
│  Verwaltung        │ schreibt│ Firebase Realtime Database   │
│  (diese Seite)     ├────────▶│  samsparking/content         │
│  Login: Passwort   │         │  samsparking/media           │
└────────┬───────────┘         │  samsparking/inquiries       │
         │ Upload              │  samsparking/config          │
         ▼                     │  samsparking/versions        │
┌────────────────────┐         └───────────┬──────────────────┘
│ Firebase Storage   │                     │ liest (öffentlich)
│ samsparking/media  │                     ▼
└────────────────────┘         ┌──────────────────────────────┐
         ▲ Datei-URLs          │ Netlify-Build der Website    │
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

### 2. Firebase: anonyme Anmeldung aktivieren

Firebase Console → Authentication → Sign-in method → **Anonymous** → aktivieren.

Die Verwaltung braucht kein Google-Konto: sie meldet sich anonym an (das gibt
dem Gerät nur eine ID) und weist danach das gemeinsame Passwort nach. Ohne
aktivierten Anonymous-Provider kommt beim Anmelden
`auth/operation-not-allowed`.

Die Netlify-Adresse unter Authentication → Settings → **Authorized domains**
einzutragen ist nicht zwingend, aber sinnvoll.

### 3. Passwort festlegen

Das Passwort steht **nicht** im Code, sondern als SHA-256-Hash in der Datenbank.

1. `https://<verwaltung>.netlify.app/passwort.html` öffnen, Wunsch-Passwort
   eingeben, Hash kopieren. (Die Seite rechnet lokal im Browser; es wird nichts
   verschickt. Ohne Netlify geht es auch mit
   `node -e 'console.log(require("crypto").createHash("sha256").update("samsparking:DEINPASSWORT").digest("hex"))'`.)
2. Firebase Console → Realtime Database → beim Knoten `samsparking` ein Kind
   `gate` anlegen, darin `pw` mit dem Hash als Wert.

**Nimm eine lange Passphrase (20+ Zeichen).** Warum, steht unter
*Grenzen dieser Anmeldung*.

Passwort ändern: einfach den Wert von `samsparking/gate/pw` ersetzen. Alle
bisher angemeldeten Geräte fallen damit automatisch heraus.

### 4. Firebase: Datenbank-Regeln

Den Block `samsparking` aus `firebase/database.rules.json` in die vollständige
Regeldatei des Projekts einfügen (`ai-sync/firebase/database.rules.json` — dort
ist er bereits ergänzt) und deployen bzw. in der Console einsetzen.

So läuft die Anmeldung — geprüft von der **Datenbank**, nicht vom JavaScript:

1. Du gibst das Passwort ein → der Browser bildet den SHA-256-Hash
2. anonyme Anmeldung, dann schreibt der Browser den Hash nach
   `samsparking/session/<geräte-id>/pw`
3. Die Regel dort lässt den Schreibvorgang **nur bei Übereinstimmung mit
   `samsparking/gate/pw`** durch → falsches Passwort = `permission_denied`
4. Alle geschützten Zugriffe verlangen danach diesen Sitzungs-Nachweis

Das Passwort verlässt den Browser nie im Klartext, und den Hash kann kein Client
lesen (`gate` und `session` sind für Clients nicht lesbar — die Regeln dürfen
sie trotzdem lesen). Abmelden löscht den Sitzungs-Knoten.

| Knoten | lesen | schreiben |
|---|---|---|
| `content` | **öffentlich** — der Website-Build liest ihn ohne Anmeldung | nur mit Sitzung |
| `media` | öffentlich (die Datei-URLs stehen ohnehin auf der Website) | nur mit Sitzung |
| `inquiries` | **nur mit Sitzung** (personenbezogene Daten) | jede/r darf *neue* anlegen (das Formular), nicht überschreiben |
| `config`, `versions` | nur mit Sitzung | nur mit Sitzung |
| `gate`, `session` | für Clients gesperrt | `session` nur mit richtigem Passwort |

Ohne diese Regeln greift der `$andere`-Catch-All des Projekts — dann wären die
Booking-Anfragen öffentlich lesbar und jede Person könnte die Website
überschreiben. **Also nicht überspringen.**

### 5. Firebase: Storage-Regeln und CORS

- Regeln: `match`-Block aus `firebase/storage.rules` in die bestehenden
  Storage-Regeln einfügen (Console → Storage → Rules).
- CORS für den Upload aus dem Browser:

```bash
# Adresse der Verwaltung zuerst in firebase/cors.json ergänzen!
bash firebase/set-cors.sh
```

`gsutil` ersetzt die CORS-Konfiguration des ganzen Buckets — die Liste in
`cors.json` enthält deshalb auch die Origin von `ai-sync`.

### 6. Build-Hook der Website hinterlegen

Netlify (Site der **Website**, nicht der Verwaltung) → Site configuration →
Build & deploy → Build hooks → *Add build hook* → URL kopieren und in der
Verwaltung unter **Einstellungen** einsetzen. Erst dann löst *Publizieren*
tatsächlich einen neuen Website-Build aus.

### Grenzen dieser Anmeldung

Ein gemeinsames Passwort ohne Benutzerkonto hat zwei Schwächen, die sich nicht
wegprogrammieren lassen — beide sind mit einer langen Passphrase unkritisch:

- **Raten:** Wer die Projekt-URL kennt, kann Passwörter durch wiederholte
  `session`-Schreibversuche durchprobieren. Firebase bremst das nicht. Eine
  Passphrase mit 20+ Zeichen macht das aussichtslos.
- **Firebase Storage:** Storage-Regeln können den Sitzungs-Nachweis aus der
  Realtime Database nicht lesen. Bilder-Upload und -Löschung sind daher für
  jede anonym angemeldete Person möglich (begrenzt auf Bild- und Videodateien
  ≤ 250 MB unter `samsparking/media/`). Die Website selbst und die Anfragen sind davon
  nicht betroffen. Wer das schliessen will, braucht echte Benutzerkonten
  (z. B. E-Mail + Passwort) — dann greift `request.auth.uid` direkt.

---

## Bedienung

| Bereich | Was drin ist |
|---|---|
| **Dashboard** | Stand, letzte Publikation, offene Anfragen, nächste Show, Checkliste mit Sprungmarken |
| **Start & Design** | Künstlername, Hauptsprache, Farben (Grundton + Akzent), Hero-Text, Hero-Bild **oder** -Video (läuft automatisch), **Hintergrundbild der ganzen Seite**, Ticker |
| **SEO & Teilen** | Domain, Titel, Description (mit Längen-Check), Keywords, Vorschaubild fürs Teilen |
| **Seiten** | Aus welchen Seiten die Website besteht, welche Abschnitte auf welcher Seite stehen, Adresse (`/shows/`), Kopfbereich, Menü, SEO je Seite |
| **Sprachen** | Deutsch, Englisch, Französisch: Stand je Sprache, Übersetzungen von Hand bearbeiten, „Fehlende mit KI übersetzen“ |
| **Abschnitte** | Sichtbarkeit, Menü-Beschriftungen, zweifarbige Überschriften |
| **About** | Portrait, Einstiegstext, Absätze (`**fett**`, `[Link](url)`), Stichworte, Fakten-Leiste |
| **Sound & Mixe** | Genres, beliebig viele Mixe mit Link und optionalem Player-Embed |
| **Shows** | Termine mit Datum, Location, Stadt, Ticket-Link, Status (bestätigt / **gebucht** / ausverkauft / abgesagt) — plus Monatskalender als Übersicht |
| **Referenzen** | Clubs und Festivals |
| **Galerie** | Bilder aus der Medienbibliothek, sortierbar, mit Alt-Text und Bildnachweis; Anzahl der zunächst sichtbaren Mobile-Bilder einstellbar |
| **Shop** | Produkte mit Bild, Preis, Beschreibung und Bezahl-Link (Stripe Payment Link / PayPal.me); ohne Link bestellt die Kundschaft per Mail. Anleitung für Bezahl-Links direkt in der Ansicht |
| **Booking** | Verfügbarkeit, Presskit, Anfrage-Formular, Rider (Gruppen mit Geräten) |
| **Kontakt** | E-Mail, Telefon, Standort, beliebig viele Social-Links |
| **Medien** | Upload per Drag & Drop nach Firebase Storage — Bilder **und Videos** (MP4, WebM), max. 250 MB pro Datei; zeigt an, was unbenutzt ist |
| **Anfragen** | Eingang aus dem Website-Formular, Status (neu / in Abklärung / bestätigt / abgelehnt), Antwort per Mail — **bestätigt legt automatisch einen gebuchten Termin im Kalender an** |
| **Publizieren** | Publizieren, Verlauf der letzten 20 Stände zum Zurückholen, JSON-Export/Import |
| **Einstellungen** | Build-Hook, Website-Adresse, Anthropic-API-Key für die KI-Übersetzung, Datenablage, Standard-Inhalt laden |

**Anmeldung:** ein Passwortfeld, kein Konto. Nach dem Anmelden bleibt das Gerät
freigeschaltet (auch nach einem Neuladen), bis du auf *Abmelden* klickst oder
das Passwort in Firebase geändert wird.

**Bilder, Videos und neue Einträge**

- **Bilder und Videos** werden angeklickt, nicht ausgewählt: die Vorschau *ist*
  der Knopf und öffnet die Medienbibliothek. Ein leeres Feld zeigt ein grosses
  **+**. Darunter stehen *Entfernen* und — eingeklappt — *Adresse von Hand* für
  Dateien, die nicht in der Bibliothek liegen.
- **Alles, wovon es mehrere gibt** (Produkte, Termine, Mixe, Referenzen,
  Galeriebilder, Social-Links …) kommt über die breite Fläche mit dem **+** am
  Ende der jeweiligen Liste dazu. In der Galerie führt sie direkt in die
  Mehrfach-Auswahl aus den Medien.

**Speichern vs. Publizieren**

- **Speichern** (auch `Strg`/`Cmd` + `S`) schreibt in die Datenbank. Öffentlich
  ändert sich noch nichts.
- **Publizieren** speichert, legt einen Stand im Verlauf ab und ruft den
  Netlify-Build-Hook auf. Nach 1–2 Minuten ist die Website aktuell.

Ungespeicherte Änderungen zeigt der Punkt oben links; beim Verlassen der Seite
warnt der Browser.

## Mehrere Seiten

Die Website muss keine One-Pager sein. Unter **Seiten** legst du fest, aus
welchen Seiten sie besteht und welcher Abschnitt auf welcher steht. Ausgeliefert
wird sie mit vier Seiten:

| Adresse | Abschnitte |
|---|---|
| `/` | About, Sound |
| `/shows/` | Shows (mit Kalender), Referenzen |
| `/gallery/` | Galerie |
| `/booking/` | Booking, Kontakt |

- Die **erste Seite ist immer die Startseite** (`/`), ihre Adresse lässt sich
  nicht ändern.
- Der **Kopfbereich** je Seite: *gross* (Hero mit Bild/Video über den ganzen
  Bildschirm), *schmal* (nur der Seitentitel) oder *keiner*.
- Hat eine Seite mehrere Abschnitte, blendet die Website automatisch eine
  Sprungleiste darunter ein.
- Sprungmarken wie „Book Sam“ finden ihr Ziel auch dann, wenn der Abschnitt
  inzwischen auf einer anderen Seite liegt — der Generator schreibt daraus
  automatisch `/booking/#booking`.
- Wird eine Seite gelöscht, räumt der nächste Build ihr Verzeichnis weg.
- Ist ein sichtbarer Abschnitt **auf keiner Seite** eingeplant, warnt die
  Verwaltung oben in der Seiten-Ansicht (er wäre sonst unsichtbar).

Bleibt die Liste leer, wird wieder eine einzelne Seite mit allen Abschnitten
gebaut — der frühere Zustand.

## Kalender und gebuchte Anfragen

Die Shows-Ansicht zeigt einen Monatskalender: Punkte sind Termine, „Nächster
Termin“ springt zum nächsten Auftritt. Auf der Website erscheint derselbe
Kalender über der Terminliste; unter *Shows → Darstellung* lässt er sich
abschalten (dann bleibt nur die Liste).

Die Liste bleibt in beiden Fällen im HTML — sie ist das, was Google liest. Der
Kalender wird im Browser aufgebaut.

**Anfrage bestätigen → Termin gebucht.** Setzt du unter *Anfragen* eine Anfrage
auf **bestätigt**, legt die Verwaltung daraus automatisch einen Termin mit dem
Status `booked` an (Datum, Event, Ort aus der Anfrage) und speichert sofort. Im
Website-Kalender ist der Tag danach blau eingefärbt und mit „Gebucht“
beschriftet, in der Liste steht statt des Ticket-Knopfs ebenfalls „Gebucht“ —
gebucht heisst schliesslich noch nicht, dass es Tickets gibt.

Der Knopf **„in den Kalender“ / „✓ im Kalender“** auf jeder Anfrage macht
dasselbe von Hand und nimmt den Termin auch wieder heraus (z. B. nach einer
Absage). Ohne Datum in der Anfrage geht es nicht — dann den Termin unter *Shows*
selbst eintragen.

Sichtbar auf der Website wird das Ganze erst mit dem nächsten **Publizieren**.

## Sprachen (Deutsch, Englisch, Französisch)

Deutsch ist die Hauptsprache und der gepflegte Stand. Englisch und Französisch
liegen als Übersetzungstabelle daneben; der Generator baut daraus `/en/…` und
`/fr/…` mit `hreflang`-Verweisen und einem Umschalter im Kopf der Website.
**Fehlt eine Übersetzung, steht dort der deutsche Text** — nie eine Lücke.

Steht in der Datenbank noch ein älterer Stand mit einer anderen Hauptsprache
(z. B. die frühere englische Fassung), zeigt die Ansicht *Sprachen* oben einen
Hinweis mit dem Knopf **„Texte auf Deutsch umstellen"**: er holt alle Texte und
Übersetzungen aus der mitgelieferten Vorlage nach und lässt Bilder, Videos,
Termine, Farben, Links und Einstellungen unangetastet.

In der Ansicht *Sprachen*:

- oben anhaken, welche Sprachen die Website überhaupt baut,
- pro Sprache der Stand: `übersetzt` / `fehlt` / `veraltet`,
- jede Stelle lässt sich von Hand überschreiben,
- **„Fehlende mit KI übersetzen“** schickt genau die offenen Stellen an Claude
  (`claude-opus-5`) und trägt die Antworten ein; **„Alles neu übersetzen“**
  macht das für alle Texte.

*Veraltet* heisst: der deutsche Text wurde geändert, nachdem übersetzt wurde.
Dafür merkt sich die Verwaltung zu jeder Übersetzung einen Fingerabdruck des
deutschen Originals (`i18nHash`). Solche Stellen zählt der KI-Lauf zu den
offenen — eine Änderung am deutschen Text zieht die Übersetzungen also nach.

**API-Key.** Für die KI-Übersetzung brauchst du einen Anthropic-API-Key
(console.anthropic.com → API Keys, Guthaben nötig). Er kommt unter
*Einstellungen → KI-Übersetzung* hinein und liegt im geschützten
`samsparking/config`-Knoten — lesbar nur mit dem Verwaltungs-Passwort. Der
Aufruf geht direkt aus dem Browser an `api.anthropic.com`. Wer das Passwort
kennt, kann den Key benutzen; bei Verdacht in der Anthropic-Konsole neu
erzeugen. Ohne Key funktioniert alles andere weiter, nur der KI-Knopf nicht.

Übersetzt werden nur Texte — keine URLs, Farben, Daten, Dateinamen und keine
Eigennamen (Clubs, Festivals, Geräte im Rider, Genre-Bezeichnungen). Welche
Felder das sind, steht in `public/js/i18n.js` und muss mit `collectStrings()`
in `s-mi/scripts/build.mjs` übereinstimmen.

## Videos im Hero

Ein Video als Hintergrund des ersten Bildschirms: unter *Start & Design →
Hero-Hintergrund* die Art auf **Video** stellen und die Datei wählen. Wird im
Auswahldialog ein Video gewählt, springt die Art automatisch mit.

Was die Website daraus macht: `autoplay muted loop playsinline` — das ist die
einzige Kombination, die Browser ohne Klick abspielen. **Ton geht nicht**,
weder auf dem Handy noch am Desktop; unmuted Autoplay ist überall gesperrt.

Drei Dinge, die den Unterschied machen:

- **Poster setzen.** Es erscheint sofort und bleibt stehen, solange das Video
  lädt. Ohne Poster ist der Hero am Anfang schwarz — bei einem grossen Video
  mehrere Sekunden lang.
- **Kurz halten.** 5–15 Sekunden als nahtloser Loop wirken besser als ein
  langer Clip und laden schneller. Ab 12 MB warnt die Verwaltung — die harte
  Grenze liegt bei 250 MB, aber ein Hero-Video in dieser Grössenordnung ist auf
  dem Handy unbrauchbar und verbrennt das Firebase-Übertragungskontingent.
- **Komprimieren.** 1920×1080, H.264, ~2–4 Mbit/s reicht für einen
  Hintergrund völlig:
  ```bash
  ffmpeg -i original.mov -vf scale=1920:-2 -c:v libx264 -crf 26 -preset slow \
         -an -movflags +faststart hero.mp4
  ```
  (`-an` wirft die Tonspur raus — sie wird ohnehin nie abgespielt und macht
  die Datei nur grösser.)

Wer „Bewegung reduzieren" im Betriebssystem eingestellt hat, sieht statt des
Videos das Poster. Im Hintergrund-Tab pausiert das Video.

Videos lassen sich auch in der Galerie verwenden (Feld-URL von Hand einsetzen);
sie spielen dort stumm, sobald sie ins Bild scrollen, und sind von der Lightbox
ausgenommen.

## Website ansehen und Wünsche an Quantus schicken

Unter **Übersicht → Website & Wünsche** läuft die veröffentlichte Website in
einem Rahmen — beim Öffnen im mobilen Prüfformat **393 × 852**, danach
umschaltbar zwischen Desktop und Handy sowie zwischen den Sprachen.

Mit **Wunsch-Modus an** wird die Vorschau zur Auswahl: In ihr wird dann nicht
mehr navigiert, ein Klick meldet stattdessen die angetippte Stelle. Die
Verwaltung fragt nach einem Text und legt daraus eine Aufgabe an — in
**Quantus** (Repo `ai-sync`), zusammen mit Abschnitt, angetipptem Element,
Sprache und Adresse.

Der Weg dorthin:

```
Verwaltung  ──push──▶  Realtime Database  /quantus_task_inbox
                              │ child_added
                              ▼
                       Quantus (ai-sync/public/index.html)
                              │ createEntity("task", …)
                              └── entfernt den Eintrag wieder
```

Quantus holt den Eintrag also erst ab, wenn es das nächste Mal offen ist —
solange steht in der Liste „wartet auf Quantus", danach „in Quantus angelegt".

Damit die Vorschau überhaupt eingebettet werden darf, erlaubt die Website in
`s-mi/netlify.toml` per `Content-Security-Policy: frame-ancestors` genau die
eigenen Netlify-Adressen. Die Website selbst schaltet den Wunsch-Modus nur
frei, wenn sie in einem Rahmen läuft *und* `?wunsch=1` in der Adresse steht —
für normale Besucherinnen und Besucher passiert dort nichts.

## Lokal starten

```bash
npx http-server -p 8080 public
```

Für den Bild-Upload muss `http://localhost:8080` in `firebase/cors.json` stehen
(ist voreingestellt). Das Hash-Werkzeug und die Anmeldung brauchen einen
sicheren Kontext — `localhost` gilt als sicher, eine LAN-IP wie `192.168.x.x`
nicht (dort fehlt `crypto.subtle`).

## Aufbau

```
public/
  index.html         Hülle, lädt Firebase-compat-SDK
  passwort.html      erzeugt den Passwort-Hash für samsparking/gate/pw
  admin.css          Oberfläche (helles Arbeitslicht — die Website bleibt dunkel)
  defaults/site.json Auslieferungs-Inhalt (identisch mit s-mi/content/site.json)
  js/
    config.js        Firebase-Werte, Datenbank-Pfade
    util.js          DOM-Helfer, Pfad-Zugriff, Toasts, Dialoge
    store.js         Anmeldung, Laden/Speichern, Publizieren, Versionen
    fields.js        Formular-Bausteine (Text, Liste, Bildfeld, Karten-Liste)
    media.js         Upload, Medienbibliothek, Bild-Auswahl
    content.js       Editoren je Website-Abschnitt
    inbox.js         Booking-Anfragen, bestätigt → Termin im Kalender
    i18n.js          Sprachen: Stand, Editor, Auswahl der übersetzbaren Texte
    ai.js            Aufruf der Anthropic-API (Claude) für die Übersetzung
    wish.js          Website-Vorschau, Wunsch-Modus, Aufgabe an Quantus
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
liegen in der Realtime Database und sind nur mit gültiger Sitzung lesbar — also
nur für Geräte, die das Passwort nachgewiesen haben. Löschen geht in der
Verwaltung unter *Anfragen* pro Eintrag.

Weil alle mit demselben Passwort arbeiten, ist im Verlauf und bei
`updatedBy`/`createdBy` nicht erkennbar, wer eine Änderung gemacht hat. Wer das
braucht, kommt an echten Benutzerkonten nicht vorbei.
