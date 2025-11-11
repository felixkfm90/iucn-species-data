import fs from "fs";

// Artenliste
const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// Platzhalter-Daten für Test
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
  },
  "Merops apiaster": {
    status: "LC",
    trend: "zunehmend",
    mature_individuals: "500.000–1.000.000",
    habitat: "Lebt in offenen Landschaften mit Bäumen und Buschwerk, oft in der Nähe von Flüssen.",
    range_map: "https://example.com/merops_apiaster_range_map.png"
  }
};

// Mapping Status auf Deutsch
const statusMap = {
  "LC": "nicht gefährdet",
  "NT": "gering gefährdet",
  "VU": "gefährdet",
  "EN": "stark gefährdet",
  "CR": "vom Aussterben bedroht"
};

// Generiere JSON für alle Arten
const data = {};
for (const species of speciesList) {
  data[species] = { ...exampleData[species], updated: new Date().toISOString().slice(0,10) };
}

fs.writeFileSync("speciesData.json", JSON.stringify(data, null, 2));
console.log("✅ speciesData.json mit Testdaten erstellt!");
