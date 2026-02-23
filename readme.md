\# IUCN Species Data (Squarespace + GitHub Pages)



Dieses Repository erzeugt und hostet eine Arten-Datenbank (JSON + Assets) für die Einbindung in eine Squarespace-Website.



\## Was liegt hier?

\- `speciesData.json` – generierte Datenbank (wird von Squarespace geladen)

\- `species\_list.json` – Eingabeliste der Arten

\- `update.mjs` – Update-Skript: IUCN-Daten abrufen, Sounds (Xeno-Canto) \& Verbreitungskarten (IUCN) aktualisieren, Report erzeugen

\- `Verbreitungskarten/` – Karten pro Art (`<sanitisierter deutscher Name>.jpg`)

\- `sounds/` – Sounds pro Art (`<Art>/<Art>.mp3` + `credits.json`)

\- JS-Module für Squarespace: `species-\*.js`, `map-loader.js`, `search.js`, `sort.js`

\- `fehlende\_elemente\_report.json` – Report über fehlende Assets/Daten (wird lokal erzeugt)

