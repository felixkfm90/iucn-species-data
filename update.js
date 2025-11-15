import fs from "fs";
import fetch from "node-fetch";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));
const speciesData = [];
const IUCN_TOKEN = process.env.IUCN_TOKEN;

async function fetchSpecies(sp) {
  try {
    const res = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(sp.scientific)}?token=${IUCN_TOKEN}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    if (!json.result || json.result.length === 0) return { status: null, population: null };
    const { category, population } = json.result[0];
    return { status: category, population };
  } catch (e) {
    console.error(`Failed for ${sp.scientific}:`, e.message);
    return { status: null, population: null };
  }
}

(async () => {
  for (const sp of speciesList) {
    console.log("Fetching:", sp.scientific);
    const iucn = await fetchSpecies(sp);
    speciesData.push({ ...sp, iucn });
  }

  if (!fs.existsSync("api")) fs.mkdirSync("api");
  fs.writeFileSync("api/speciesData.json", JSON.stringify(speciesData, null, 2));
  console.log("api/speciesData.json updated!");
})();
