# 🐦 IUCN Species Data Updater

Dieses Repository ruft automatisch aktuelle Daten aus der **IUCN Red List API** ab und stellt sie als `speciesData.json` bereit.  
Die Daten können z. B. auf einer Website (wie Squarespace) eingebunden werden.

---

## 🔍 Funktionen

- Automatischer monatlicher Datenabruf von der [IUCN Red List API](https://apiv3.iucnredlist.org/api/v3/docs)
- Speicherung der Daten als `speciesData.json` im Repository
- Automatisches Commit & Push durch GitHub Actions

---

## 📁 Ordnerstruktur
├── .github/

│ └── workflows/

│ └── update.yml # GitHub Action für monatliche Updates

├── species_list.json # Liste der zu überwachenden Arten

├── update.js # Script zum Abrufen der Daten

├── speciesData.json # Automatisch erzeugte Datendatei

└── package.json # Node.js-Konfiguration
