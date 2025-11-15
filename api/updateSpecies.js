import fetch from "node-fetch";

const speciesList = [
  { german: "Amsel", scientific: "Turdus merula" },
  { german: "Bachstelze", scientific: "Motacilla alba" },
  { german: "Bartmeise", scientific: "Panurus biarmicus" }
  // ... restliche Arten
];

export default async function handler(req, res) {
  const IUCN_TOKEN = process.env.IUCN_TOKEN;
  const speciesData = [];

  for (const sp of speciesList) {
    try {
      const response = await fetch(
        `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(sp.scientific)}?token=${IUCN_TOKEN}`,
        { headers: { "User-Agent": "Mozilla/5.0" } } // simuliert Browser
      );
      const json = await response.json();
      const data = json.result?.[0] || null;
      speciesData.push({ ...sp, iucn: data });
    } catch (e) {
      speciesData.push({ ...sp, iucn: null, error: e.message });
    }
  }

  res.status(200).json(speciesData);
}
