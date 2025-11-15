import puppeteer from "puppeteer";
import fs from "fs/promises";

export default async function handler(req, res) {
  try {
    const speciesList = JSON.parse(await fs.readFile("species_list.json", "utf-8"));
    const speciesData = [];
    const IUCN_TOKEN = process.env.IUCN_TOKEN;

    if (!IUCN_TOKEN) throw new Error("IUCN_TOKEN not set");

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();

    for (const sp of speciesList) {
      try {
        const data = await page.evaluate(async (species, token) => {
          const response = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${token}`);
          if (!response.ok) throw new Error("Request failed");
          const json = await response.json();
          return json.result[0];
        }, sp.scientific, IUCN_TOKEN);

        speciesData.push({
          german: sp.german,
          scientific: sp.scientific,
          status: data?.category || null,
          population: data?.population || null,
        });
      } catch (e) {
        console.error(`Failed for ${sp.scientific}:`, e.message);
        speciesData.push({
          german: sp.german,
          scientific: sp.scientific,
          status: null,
          population: null,
        });
      }
    }

    await browser.close();
    await fs.writeFile("speciesData.json", JSON.stringify(speciesData, null, 2));

    res.status(200).json({ message: "speciesData.json updated", count: speciesData.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
