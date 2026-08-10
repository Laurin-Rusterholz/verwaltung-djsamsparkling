# Website-Audit — Anteil der Verwaltung (10.08.2026)

Der vollständige Audit mit allen Punkten, Nachweisen und den extern zu
erledigenden Schritten steht im Website-Repo:
`Laurin-Rusterholz/s-mi` → `AUDIT.md` (Zweig
`claude/website-audit-implementation-rgnv02`).

Hier steht nur, was sich in der Verwaltung geändert hat und warum.

## Masken, die es nicht mehr gibt

**„Sound & Genres“ und „Erlebnis“.** Die Website baut beide Abschnitte nicht
mehr (siehe `BAUBAR` in `scripts/build.mjs` der Website). Eine Eingabemaske
für einen Abschnitt, den niemand je zu sehen bekommt, macht nur Arbeit, die
nirgends ankommt. Die Inhalte bleiben in der Datenbank stehen und werden
schlicht nicht mehr gelesen.

**Hero → „Genre-Zeile“.** Stand neben dem Anspruch und wiederholte, was der
Sound-Abschnitt ohnehin sagte. Unter dem Namen steht jetzt eine einzige
Zeile, in der Akzentfarbe.

**Shop → „Link (optional)“ je Artikel.** Ein eigener Bezahllink je Artikel
hätte die Kundschaft am Bestellformular vorbeigeführt — die Bestellung käme
dann ohne Lieferadresse an.

## Was neu einstellbar ist

**Referenzen** haben zwei neue Felder: *Ganz oben hervorheben* (die
hervorgehobenen stehen als grosse Zeilen zuoberst und behalten die
Reihenfolge dieser Liste — das ist die Rangfolge) und *Bündel* („Ostschweiz“,
„Schweiz“, „International“ …) für alle übrigen, die darunter kleiner und
innerhalb ihres Bündels alphabetisch stehen.

**Kanäle:** Das Zeichen oben im Kopfbereich ist jetzt eine bewusste Ausnahme
statt der Vorgabe — der Kopf trägt den Namen und das Menü, sonst nichts. Im
Fussbereich und im Kontakt-Abschnitt steht jeder Kanal weiterhin immer.

## Was nicht mehr einzustellen ist

**„Ziel der Anfragen“** (`site.bookingApi`) ist weg. Das Formular schrieb
damit direkt in die Datenbank — die Adresse stand im Quelltext jeder Seite,
und eine E-Mail ging nie raus. Anfragen und Bestellungen gehen jetzt an die
Website selbst (`/api/booking`, `/api/order`); dort werden sie geprüft, in
denselben Eingang gelegt wie bisher und per E-Mail an `info@samsparking.ch`
gemeldet. Am Eingang ändert sich für die Verwaltung nichts.

Eingestellt wird das über Umgebungsvariablen bei Netlify
(`INBOX_API_URL`, `MAIL_TO`, `RESEND_API_KEY`) — siehe `AUDIT.md` im
Website-Repo. Das Formular selbst schaltest du weiterhin unter Booking an
und aus.

**Bezahlung im Shop:** TWINT-Nummer, IBAN und QR-Code sind weg. Dabei wusste
niemand, ob und wann Geld kam. Bezahlt wird über Stripe
(`STRIPE_PAYMENT_LINK_URL`, `STRIPE_WEBHOOK_SECRET`).

## Vorgabe-Inhalt (`public/defaults/site.json`)

Drei Seiten statt einer (Start, Booking, Shop), die neue Referenzliste, die
Kennzahl „Shows“ statt „Clubs & Festivals“, Währung `CHF` statt `CHF 5`,
keine Genre-Zeile, und TikTok sowie Spotify als leere Kanal-Einträge — ohne
Adresse verlinkt die Website einen Kanal nicht, so fällt beim Einrichten auf,
dass die zwei Adressen noch fehlen.

## Test

Die Verwaltung ist eine reine statische Seite ohne Build und ohne
Test-Aufbau. Geprüft wurde: alle Module in `public/js/` bestehen
`node --check`, jeder relative Import lässt sich auflösen und jeder
importierte Name wird an seiner Quelle auch exportiert. Die entfernten
Masken haben keine Verweise hinterlassen (`renderSound`, `renderExperience`,
`sections.sound`, `sections.experience` kommen in `public/js/` nicht mehr
vor).
