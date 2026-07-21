# Anni 2026 · Maturalerner

Lernplattform für die mündliche Reife- und Diplomprüfung im Fach
**Ernährung und Lebensmitteltechnologie** (HLW, Haupttermin 2027).

👉 **[Zur Lernplattform](https://chris-dev-at.github.io/anni2026_maturalerner/)**

Die App läuft komplett im Browser. Es gibt keinen Server, kein Konto und keine Anmeldung –
und damit auch nichts, was jemand missbrauchen könnte.

---

## Was drin ist

- **Fragen zum gesamten Maturastoff**, aufgeteilt auf die zehn Themenbereiche des Stoffzettels.
- **Die Lern-PDF** mit der vollständigen Ausarbeitung des Stoffs (240 Seiten) – direkt in der
  App unter „Lernunterlage“ erreichbar.
- Zu jeder Frage eine **Erklärung**, die passenden **Buchkapitel** zum Nachlesen und
  **YouTube-Suchlinks** für Erklärvideos zum Thema.

## Die Lernmodi

| Modus | Wofür |
|---|---|
| **Quiz** | Frage mit vier Antwortmöglichkeiten, sofortiges Feedback und Erklärung. |
| **Karteikarte** | Frage lesen, laut antworten, umdrehen, selbst einschätzen. Gut fürs mündliche Üben. |
| **Einmal alles durch** | Jede Frage bleibt in der Runde, bis du sie mehrmals hintereinander kannst. Mit Gruppen und dauerhaftem Fortschritt. |
| **Schwere Fragen** | Trainiert gezielt, was du markiert hast oder oft falsch beantwortest. |
| **Prüfungsmodus** | Ein zufälliger Themenbereich wie bei der Matura, ohne Hilfen, Auswertung am Ende. |

Du kannst den Umfang immer frei wählen: alles, ein einzelner Themenbereich oder einzelne Themen.

## Fortschritt zwischen Geräten mitnehmen

Der Fortschritt liegt im Speicher des jeweiligen Browsers (`localStorage`) – also **pro Gerät
getrennt**. Damit du am PC und am Tablet mit demselben Stand lernen kannst, gibt es unter
**Daten** einen Export und einen Import:

1. Am alten Gerät auf **Daten → Exportieren**. Du bekommst eine JSON-Datei.
2. Diese Datei aufs andere Gerät bringen (Cloud, Mail, USB – egal wie).
3. Dort **Daten → Importieren** und die Datei auswählen.

Beim Import kannst du wählen:

- **Zusammenführen** – dein bisheriger Fortschritt bleibt erhalten und wird ergänzt.
  Serien und markierte Fragen werden zum jeweils besseren Wert zusammengeführt,
  doppelte Antworten werden nicht doppelt gezählt.
- **Ersetzen** – alles auf diesem Gerät wird durch die Datei überschrieben.

Gesichert werden: markierte schwere Fragen, ausgeblendete Fragen, der Fortschritt aus
„Einmal alles durch“, alle Gruppen, die Statistik und die Einstellungen.

> Achtung: Wenn du die Browserdaten löschst oder im privaten Fenster lernst, ist der
> Fortschritt weg. Exportiere ab und zu.

## Fragen ausblenden

Findest du eine Frage unpassend oder irrelevant, blendest du sie über das 🚫-Symbol auf der
Karte aus – sie kommt dann in keinem Lernmodus mehr vor. Das gilt nur für dich, auf deinem
Gerät. Unter **Daten → Ausgeblendete Fragen** oder im **Archiv** holst du sie jederzeit zurück.

---

## Technisches

Reines HTML, CSS und JavaScript – kein Build-Schritt, keine Abhängigkeiten, kein Framework.

```
index.html      Alle Screens als einzelne Views
style.css       Design-System, Light und Dark Mode, responsiv ab 320 px
app.js          Lernlogik, Statistik, Speicherung, Export/Import
data/
  questions.json  Die Fragen mit Erklärung, Buchkapitel und YouTube-Suchbegriffen
Maturastoff_Ernaehrung.pdf   Die Lernunterlage
```

Lokal ausprobieren:

```bash
python -m http.server 8000
# dann http://localhost:8000 öffnen
```

Ein direkter Doppelklick auf `index.html` funktioniert nicht, weil der Browser
`data/questions.json` dann aus Sicherheitsgründen nicht laden darf.

### Datenformat

```jsonc
{
  "themenbereiche": [{ "nr": 1, "titel": "Grundlagen der Ernährung", "anzahl": 52 }],
  "fragen": [{
    "id": "tb01-001",
    "nr": 1,
    "tb": 1,                        // Themenbereich
    "thema": "Ernährungspyramide",  // Feinthema, wird zum Filter
    "frage": "…",
    "antworten": ["…", "…", "…", "…"],
    "richtig": 2,                   // Index in antworten
    "erklaerung": "…",
    "buch": [{ "band": "Grundlagen", "kapitel": "Vollwertig essen und trinken" }],
    "yt": ["Ernährungspyramide Österreich einfach erklärt"],
    "rechnen": true,                // optional
    "grafik": true,                 // optional
    "aussagen": ["…"]               // optional, für Mehrfachauswahl
  }]
}
```

---

## Grundlage

Die Inhalte sind aus dem Stoffzettel und der Stoffbesprechung vom 06.07.2026 erarbeitet,
fachlich gestützt auf die drei Bände der Reihe *Ernährung – bewusst, aktuell, lebensnah*
(TRAUNER Verlag): Band II *Grundlagen und Inhaltsstoffe*, Band III *Lebensmittel*,
Band IV *Prävention und Therapie*.

Private Lernhilfe, kein offizielles Unterrichtsmaterial.
