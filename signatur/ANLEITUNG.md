# E-Mail-Signatur für das klassische Outlook (Desktop)

Zwei Dateien, beide in diesem Ordner:

| Datei | wofür |
|---|---|
| `sam-sparking-signatur.htm` | die Signatur für HTML-Mails |
| `sam-sparking-signatur.txt` | dieselbe Signatur als reiner Text (für Nur-Text-Mails) |

Diese Dateien sind **nicht Teil der Website**: Netlify veröffentlicht in diesem
Repository nur den Ordner `public/`. Sie liegen hier, weil sie zum Betrieb
gehören, nicht zum öffentlichen Auftritt.

---

## Vor dem Einbau: zwei Angaben bitte bestätigen

Beide Werte stammen aus dem bestehenden Projekt — geraten wurde nichts. An zwei
Stellen sagt das Projekt allerdings Verschiedenes:

1. **Ort.** Im Impressum steht „Herisau, Schweiz", im Kontaktblock der Website
   „St. Gallen, Switzerland". In der Signatur steht **Herisau, Schweiz**
   (Impressum). Soll dort St. Gallen stehen, eine Zeile in beiden Dateien
   ändern.
2. **Adresse der Website.** In der Signatur steht die im Projekt hinterlegte
   Adresse `djsamsparkling.netlify.app`. Sobald die eigene Domain live ist
   (z. B. `samsparking.ch`), an beiden Stellen ersetzen — im `href` **und** im
   sichtbaren Text.

Eine **Telefonnummer** steht bewusst nicht drin: im Projekt ist keine
hinterlegt. Soll eine hinein, sag welche — erfunden wird hier nichts.

Ein **Logo** ist bewusst nicht eingebaut. Klassisches Outlook blockiert
entfernte Bilder oft, bis der Empfänger sie erlaubt; bis dahin steht dort ein
leerer Rahmen. Wenn ein Logo hinein soll, braucht es eine dauerhaft erreichbare
Adresse und feste Masse:

```html
<img src="https://…/logo.png" width="120" height="120" alt="Sam Sparking"
     style="display:block;border:0;outline:none;text-decoration:none;" />
```

---

## Warum die Datei so gebaut ist

Klassisches Outlook rendert HTML mit der **Word-Engine**. Sie kennt weder
Flexbox noch Grid, ignoriert externe Stylesheets und bricht CSS-Kurzschreib-
weisen unterschiedlich um. Die Signatur verwendet deshalb ausschliesslich:

* **Tabellen** für das Layout (kein `div`-Raster, kein Flex/Grid),
* **Inline-Stile** an jedem Element (keine Klassen, kein `<style>`-Block),
* **feste Pixelmasse** (auch für die blaue Linie: `height`, `line-height` und
  `font-size` gemeinsam — sonst wird sie in Outlook höher als gewollt),
* Standardschriften (`Arial, Helvetica, sans-serif`),
* keine Bilder ohne ausdrückliche `width`/`height`.

---

## Einbau — Windows (klassisches Outlook, Microsoft 365 / 2019 / 2021)

Der verlässlichste Weg führt über den Signaturen-Ordner. Das Einfügen per
Copy-and-paste aus dem Browser funktioniert zwar oft, bringt aber fremde
Formatierung mit.

1. `sam-sparking-signatur.htm` im **Browser** öffnen (Doppelklick), alles
   markieren (`Strg`+`A`) und kopieren (`Strg`+`C`).
2. In Outlook: **Datei → Optionen → E-Mail → Signaturen…**
3. **Neu**, Namen vergeben (z. B. `Sam Sparking`), ins grosse Feld klicken und
   einfügen mit `Strg`+`V`.
4. Rechts oben unter **Standardsignatur auswählen** festlegen, für welches
   Konto sie gilt und ob sie bei **Neuen Nachrichten** und bei
   **Antworten/Weiterleitungen** erscheinen soll.
5. **OK**, dann eine Testmail an die eigene Adresse schicken und dort ansehen.

**Alternative (sauberer, wenn das Einfügen die Formatierung verändert):** die
Dateien direkt in den Signaturen-Ordner legen. Ordner öffnen mit
`Windows`+`R` → `%APPDATA%\Microsoft\Signatures` → OK. Dort gehören drei
Dateien mit **demselben Namen**:

* `Sam Sparking.htm` (Inhalt aus `sam-sparking-signatur.htm`)
* `Sam Sparking.txt` (Inhalt aus `sam-sparking-signatur.txt`)
* `Sam Sparking.rtf` (darf fehlen; Outlook legt sie bei Bedarf selbst an)

Outlook muss dabei geschlossen sein. Nach dem Start steht die Signatur unter
**Signaturen…** zur Auswahl.

## Einbau — macOS (klassisches Outlook, „Neues Outlook" ausgeschaltet)

Auf dem Mac gibt es keinen Signaturen-Ordner zum Hineinlegen; dort führt nur
der Weg über die Oberfläche:

1. `sam-sparking-signatur.htm` im **Safari** öffnen, alles markieren
   (`Cmd`+`A`), kopieren (`Cmd`+`C`).
2. In Outlook: **Outlook → Einstellungen → Signaturen** (im neueren Aufbau:
   **Extras → Konten → Signaturen**).
3. **+**, Namen vergeben, in den Bearbeitungsbereich klicken und einfügen mit
   `Cmd`+`V`.
4. Unter **Standardsignaturen** dem richtigen Konto zuweisen.
5. Fenster schliessen, Testmail an sich selbst.

> Läuft auf dem Mac das **„Neue Outlook"** (Schalter oben rechts im Fenster),
> gilt dieser Weg nicht — dort ist der Aufbau ein anderer. In dem Fall bitte
> kurz sagen, dann kommt die passende Beschreibung dazu.

## Nur-Text-Mails

Wer Mails als reinen Text schreibt, bekommt die HTML-Signatur nicht zu sehen.
Dafür ist `sam-sparking-signatur.txt` da — unter Windows als gleichnamige
`.txt` im Signaturen-Ordner, auf dem Mac als zweite Signatur mit demselben
Inhalt.

## Prüfen, ob es wirklich sitzt

Eine Testmail an die eigene Adresse und dort ansehen:

* Stehen Name, Rolle, E-Mail, Web und Ort untereinander (nicht nebeneinander)?
* Ist die blaue Linie eine dünne Linie — nicht ein dicker Balken?
* Sind E-Mail und Web anklickbar?
* Beim Antworten: steht die Signatur da, wo sie hingehört?

---

## Was hier NICHT passiert ist

Der Einbau selbst ist **nicht** erfolgt: Zugriff auf Sämis Outlook-Konto ist
nicht bestätigt, und ohne Konto lässt sich eine Signatur nicht einrichten.
Diese Dateien sind die Vorlage dafür.

Die automatischen **Website-Mails** (Booking-Anfragen, Bestellungen) sind davon
unberührt: sie sind kurze Benachrichtigungen an `info@samsparking.ch` und
tragen bewusst keine persönliche Signatur. Absender und Antwortadresse dieser
Mails sind eine eigene Sache — siehe den Bericht zum Mailversand.
