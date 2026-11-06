# assessment-web

Angular-Anwendung, die Testhefte der AF-Aufgabensprache im Browser durchführt. Der aktuelle Stand läuft **ohne Server**:
Antworten und Zustand bleiben im Browser, am Ende lassen sich die Ergebnisse als Datei herunterladen.

## Starten

```sh
npm start -w @answerfield/assessment-web     # Index erzeugen, Entwicklungsserver auf http://localhost:4200
npm run build -w @answerfield/assessment-web # Index erzeugen, Produktions-Build nach dist/assessment-web
npm test -w @answerfield/assessment-web      # Index erzeugen, Komponententests (ng test)
```

Die App braucht weder CLI noch Compiler: `scripts/index.mjs` liest alle `*.bundle.json` unter `public/bundles/` und
schreibt `public/bundles/index.json`. Mitgeliefert ist das Beispiel `public/bundles/example/booklet.bundle.json`.

Der Entwicklungsserver nimmt Änderungen in `packages/` sofort mit: `npm start` hält deren Ausgabe mit `tsc --watch`
aktuell, und `ng serve` bündelt die `@answerfield`-Pakete nicht vor (`prebundle.exclude` in `angular.json`). Ein Löschen von
`.angular/cache` ist nicht mehr nötig.

Voraussetzung: Die Pakete unter `packages/` sind gebaut (`npm run build` im Root).

## Vorschau

Auf dem Startbildschirm öffnet **Vorschau** das gewählte Testheft zum Durchsehen, ohne Testcode, Zeitlimit,
Teilgrenzen und Speicherung:

- links alle Aufgaben nach Teilen (mit Zahl der Teilaufgaben), frei anklickbar; oben „Vorige/Nächste Aufgabe“
- jede Aufgabe ist bedienbar; Antworten bleiben beim Blättern erhalten, solange die Seite offen ist
- Bedarfsprofil umschaltbar (Vergrößerung, Kontrast, Umbruch, Leichte Sprache, Bildbeschreibungen)
- Hörtexte: **Phase überspringen** beendet Lesezeit, Wiedergabe oder Pause sofort
- **Kodierung anzeigen** (standardmäßig aus): Antworten, Codes, Missings, offene manuelle Fragen und Scores live

## Woher die Aufgaben kommen

Die App hat keine Aufgabenbank. Sie liest Bundles aus `public/bundles/`:

```
public/bundles/example/booklet.bundle.json   eingechecktes Beispiel (Brüche, ohne Rückmeldungen)
public/bundles/…/*.bundle.json                weitere Bundles, die du dort ablegst
        │  node scripts/index.mjs
        ▼
public/bundles/index.json              Liste der Testhefte: Datei, Name, Titel, SHA-256 (nach Datei sortiert)
        │  Angular kopiert public/ unverändert in die gebaute App
        ▼
fetch('bundles/index.json')            füllt die Auswahl auf dem Startbildschirm
fetch(<gewähltes Bundle>)              nach „Test starten“ → <af-booklet [bundle]="…">
```

- Ein eigenes Testheft kompilierst du mit der CLI (`af compile … --no-feedback --out public/bundles/<ordner>`) und
  startest die App neu. Bundles ohne Rückmeldungen liefern keine Lösungen aus.
- Außer dem Beispiel steht `public/bundles/` in der `.gitignore`.
- Der SHA-256 in `index.json` gehört zum ausgelieferten Bundle.

## Ablauf in der App

| Bildschirm | Was passiert |
|---|---|
| Start (`start.ts`) | Testcode (pseudonym), Testheft, Bedarfsprofil. Das Profil stellt vorerst die Testleitung hier ein. |
| Durchführung (`run.ts`) | Kopfzeile mit Teil, Fortschritt, Restzeit und Navigation; darunter `<af-booklet>` aus `@answerfield/angular`. Navigation und Zeitlimits folgen dem Testheft. |
| Ende (`app.ts`) | „Ergebnisse herunterladen“ speichert `results-<booklet>-<code>.json`. |

**Speichern und Fortsetzen** (`session-store.ts`): Bei jeder Antwort, jedem Seiten- oder Aufgabenwechsel und alle 10 s
(für die verbrauchte Zeit) landet der Snapshot des Testhefts im `localStorage` (Position, Antworten, verbrauchte Zeit,
Protokoll). Nach einem Neuladen geht es an derselben Stelle weiter; derselbe Testcode setzt eine unterbrochene Sitzung
fort. Ist der Speicher gesperrt oder voll, läuft die Testung weiter, nur ohne Wiederaufnahme.

- **Ergebnisse bleiben:** Beim Beenden kommen die Ergebnisse in die gespeicherte Sitzung. Nach einem Neuladen erscheint
  der Endbildschirm mit dem Download; derselbe Testcode überschreibt einen beendeten Test nicht.
- **Neues Bundle:** Die Sitzung merkt sich die Prüfsumme des Testhefts. Wurde es seitdem neu ausgeliefert, wird der alte
  Zustand nicht auf das geänderte Heft gelegt; der Test beginnt mit Hinweis neu.
- **Geprüfte Bundles:** Die Runtime lehnt Bundles mit fremdem Format oder anderer Version ab; ein gespeicherter Zustand,
  der nicht zum Heft passt (Stelle, Seite, Hörtext), wird auf einen gültigen Anfang gesetzt statt abzustürzen.

**Ergebnisdatei** (`format: "af-results"`): Testcode, Testheft, Start- und Endzeit, wirksame Anpassungen und Zeitfaktor,
Antworten je Aufgabe (`ResponseSet`), Kodierung mit dem eigenen Kodierer (`CodingResult`, inkl. Missing-Codes)
sowie das Protokoll von Testheft und Aufgaben.

## Grenzen des aktuellen Stands

- **Aufgaben sind öffentlich:** Die Bundles liegen als statische Dateien neben der App. Für Aufgaben, die vor der Testung
  geheim bleiben müssen, reicht das nicht.
- **Neue Testhefte brauchen einen neuen Build.**
- **Nur lokale Speicherung:** kein Server, kein Offline-Puffer mit Nachsenden (IndexedDB), keine Testleitungsübersicht.
- **Bedarfsprofil auf dem Startbildschirm** statt aus der Sitzung.

## Mit Server (geplant: `apps/assessment-server`)

- Bundles kommen aus einer Aufgabenbank, nur nach Anmeldung und über signierte URLs; jede Sitzung bekommt ihr Testheft
  und ihr Bedarfsprofil zugewiesen.
- Der SHA-256 aus `af compile` stellt sicher, dass genau das freigegebene Bundle ausgeführt wird.
- Antworten, Snapshots und Protokolle gehen regelmäßig an den Server; ohne Verbindung werden sie im Browser gepuffert und nachgereicht.

Die App selbst ändert sich dabei kaum: Statt `bundles/index.json` fragt sie den Server; `<af-booklet>` bleibt gleich.

## Aufbau

```
scripts/index.mjs       erzeugt public/bundles/index.json (ohne CLI)
src/app/app.ts          Bildschirme, Laden der Bundles, Wiederaufnahme, Export
src/app/start.ts        Startbildschirm
src/app/run.ts          Kopfzeile und <af-booklet>
src/app/session-store.ts lokaler Speicher
src/styles.css          Rahmen der App; die Aufgaben nutzen das Runtime-Theme (--af-*)
```

`@answerfield/angular` wird im selben Repository direkt aus dem Quelltext genutzt (`paths` in `tsconfig.json`). Die App verwendet nur die
öffentlichen Exporte der Pakete.
