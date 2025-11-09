import fs from "fs";
import fetch from "node-fetch";

const token = process.env.IUCN_TOKEN;
if (!token) {
  console.error("IUCN_TOKEN nicht gesetzt");
  process.exit(1);
}

const list = JSON.parse(fs.readFileSync("species_list.json", "utf8"));

async function fetchSpeciesData(name) {
  const url = `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(name)}?token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Fetch failed for ${name}: ${res.status}`);
    return { name, status: "n/a", trend: "n/a", updated: new Date().toISOString().slice(0,10) };
  }
  const data = await res.json();
  const result = data.result?.[0];
  return {
    name,
    status: result?.category || "n/a",
    trend: result?.population_trend || "n/a",
    updated: new Date().toISOString().slice(0,10)
  };
}

const output = {};
for (const name of list) {
  console.log(`Fetching: ${name}`);
  // eslint-disable-next-line no-await-in-loop
  output[name] = await fetchSpeciesData(name);
}

fs.writeFileSync("speciesData.json", JSON.stringify(output, null, 2));
console.log("✅ speciesData.json erstellt!");
