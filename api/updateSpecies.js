import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const speciesListPath = path.join(process.cwd(), "species_list.json");
const speciesDataPath = path.join(process.cwd(), "speciesData.json");

export default async function handler(req, res) {
  const speciesList = JSON.parse(fs.readFileSync(speciesListPath, "utf-8"));
  const speciesData = [];

  const IUCN_TOKEN = process.env.IUCN_TOKEN;
  if (!IUCN_TOKEN) {
    res.status(500).json({ error: "IUCN_TOKEN not set in environment variables" });
    return;
  }

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  for (const sp of speciesList) {
    try {
      console.log("Fetching:", sp.scientific);

      const data = await page.evaluate(
        async (species, token) => {
          const response = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${token}`);
          if (!response.ok) throw new Error("Request failed");
          const json = await response.json();
          return json.result[0] || null;
        },
        sp.scientific,
        IUCN_TOKEN
      );

      speciesData.push({
        german: sp.german,
        scientific: sp.scientific,
        status: data?.category || null,
        population: data?.population || null
      });

    } catch (e) {
      console.error(`Failed for ${sp.scientific}:`, e.message);
      speciesData.push({ german: sp.german, scientific: sp.scientific, status: null, population: null });
    }
  }

  await browser.close();
  fs.writeFileSync(speciesDataPath, JSON.stringify(speciesData, null, 2));

  res.status(200).json({ message: "speciesData.json updated", speciesCount: speciesData.length });
}
