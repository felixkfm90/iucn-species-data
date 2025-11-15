import fs from "fs";
import puppeteer from "puppeteer";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));
const speciesData = [];

const IUCN_TOKEN = process.env.IUCN_TOKEN;

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  for (const sp of speciesList) {
    console.log("Fetching:", sp.scientific);

    try {
      // Species Data
      const speciesInfo = await page.evaluate(async (species, token) => {
        const res = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${token}`);
        if (!res.ok) throw new Error("Species request failed");
        const json = await res.json();
        return json.result[0]; // enthält scientific_name, category etc.
      }, sp.scientific, IUCN_TOKEN);

      // Population Data
      const populationInfo = await page.evaluate(async (species, token) => {
        const res = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/population/${species}?token=${token}`);
        if (!res.ok) throw new Error("Population request failed");
        const json = await res.json();
        return json.result || [];
      }, sp.scientific, IUCN_TOKEN);

      speciesData.push({
        german: sp.german,
        scientific: sp.scientific,
        status: speciesInfo?.category || "unknown",
        population: populationInfo.length ? populationInfo : null
      });

    } catch (e) {
      console.error(`Failed for ${sp.scientific}:`, e.message);
      speciesData.push({
        german: sp.german,
        scientific: sp.scientific,
        status: "error",
        population: null
      });
    }
  }

  await browser.close();

  fs.writeFileSync("speciesData.json", JSON.stringify(speciesData, null, 2));
  console.log("speciesData.json updated!");
})();
