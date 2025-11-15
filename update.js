import puppeteer from "puppeteer";
import fs from "fs/promises";

const speciesList = JSON.parse(await fs.readFile("species_list.json", "utf-8"));
const speciesData = [];
const IUCN_TOKEN = process.env.IUCN_TOKEN;

if (!IUCN_TOKEN) throw new Error("IUCN_TOKEN not set");

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

for (const sp of speciesList) {
  console.log("Fetching:", sp.scientific);
  try {
    const data = await page.evaluate(async (species, token) => {
      const res = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${token}`);
      if (!res.ok) throw new Error("Request failed");
      const json = await res.json();
      return json.result[0];
    }, sp.scientific, IUCN_TOKEN);

    speciesData.push({
      german: sp.german,
      scientific: sp.scientific,
      status: data?.category || null,
      population: data?.population || null
    });

  } catch (err) {
    console.error(`Failed for ${sp.scientific}:`, err.message);
    speciesData.push({
      german: sp.german,
      scientific: sp.scientific,
      status: null,
      population: null
    });
  }
}

await browser.close();
await fs.writeFile("api/speciesData.json", JSON.stringify(speciesData, null, 2));
console.log("speciesData.json updated!");
