import fs from "fs";

const list = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

// Simulierte IUCN-Daten (ohne API)
function fakeSpeciesData(name) {
  const examples = {
    "Alcedo atthis": { status: "LC", trend: "Increasing" },
    "Upupa epops": { status: "LC", trend: "Stable" },
    "Merops apiaster": { status: "LC", trend: "Increasing" }
  };
  const data = examples[name] || { status: "n/a", trend: "n/a" };
  return {
    name,
    status: data.status,
    trend: data.trend,
    updated: new Date().toISOString().slice(0, 10)
  };
}

const output = {};
for (const name of list) {
  console.log(`Simuliere Daten für: ${name}`);
  output[name] = fakeSpeciesData(name);
}

// JSON-Datei schreiben
fs.writeFileSync("speciesData.json", JSON.stringify(output, null, 2));
console.log("✅ speciesData.json (Testversion) erstellt!");
