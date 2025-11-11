import fs from "fs";

// Beispiel-Artenliste
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// Mapping IUCN-Codes auf deutsche Beschreibung
const statusMap = {
  "LC": "nicht gefährdet",
  "NT": "gering gefährdet",
  "VU": "gefährdet",
  "EN": "stark gefährdet",
  "CR": "vom Aussterben bedroht"
};

// Simulierte IUCN-Daten für Test (später echtes API)
const exampleData = {
  "Alcedo atthis": {
    status: "LC",
    trend: "zunehmend",
    mature_individuals: "3.000.000–6.000.000",
    habitat: "Lebt in der Nähe von sauberen, langsam fließenden Gewässern mit reichlich Fischvorkommen.",
    range_map: "https://example.com/alcedo_atthis_range_map.png"
  },
  "Turdus merula": {
    status: "LC",
    trend: "stabil",
    mature_individuals: "7.900.000–9.550.000 Brutpaare in Deutschland",
    habitat: "In Gärten, Parks und Wäldern weit verbreitet.",
    range_map: "https://example.com/turdus_merula_range_map.png"
  }
};

// Generiere HTML-Datei pro Art
for (const name of speciesList) {
  const info = exampleData[name] || {
    status: "n/a",
    trend: "n/a",
    mature_individuals: "n/a",
    habitat: "n/a",
    range_map: ""
  };

  const htmlContent = `
<div style="padding:16px; border:1px solid #ccc; border-radius:12px; background:#f8f9fa; font-family:sans-serif; max-width:600px;">
  <h3 style="margin-top:0;">${name}</h3>
  ${info.range_map ? `<img src="${info.range_map}" alt="Verbreitungskarte ${name}" style="max-width:100%; border-radius:8px; margin-bottom:8px;">` : ""}
  <p><strong>Status:</strong> ${statusMap[info.status] || info.status}</p>
  <p><strong>Populationstrend:</strong> ${info.trend}</p>
  <p><strong>Erwachsene Individuen:</strong> ${info.mature_individuals}</p>
  <p><strong>Habitat & Ecology:</strong> ${info.habitat}</p>
  <p style="font-size:0.85em; color:#666;">Letztes Update: ${new Date().toISOString().slice(0,10)}</p>
</div>
`;

  // Datei abspeichern: name in Kleinbuchstaben + Unterstriche
  const filename = name.toLowerCase().replace(/ /g, "_") + ".html";
  fs.writeFileSync(filename, htmlContent);
  console.log(`✅ HTML für ${name} erstellt: ${filename}`);
}
