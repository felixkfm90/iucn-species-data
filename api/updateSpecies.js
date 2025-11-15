import fs from "fs";
import fetch from "node-fetch";

export default async function handler(req, res) {
  const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));
  const speciesData = [];
  const IUCN_TOKEN = process.env.IUCN_TOKEN;

  for (const sp of speciesList) {
    try {
      const response = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(sp.scientific)}?token=${IUCN_TOKEN}`);
      const json = await response.json();
      const data = json.result?.[0] || { category: null, population: null };
      speciesData.push({ ...sp, iucn: { status: data.category, population: data.population } });
    } catch (e) {
      speciesData.push({ ...sp, iucn: { status: null, population: null } });
    }
  }

  fs.writeFileSync("api/speciesData.json", JSON.stringify(speciesData, null, 2));
  res.status(200).json({ message: "speciesData.json updated", speciesData });
}
