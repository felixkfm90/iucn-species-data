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
      const data = await page.evaluate(async (species, token) => {
        const response = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${token}`);
        if (!response.ok) throw new Error("Request failed");
        const json = await response.json();
        return json.result[0];
      }, sp.scientific, IUCN_TOKEN);

      speciesData.push({ ...sp, iucn: data });
    } catch (e) {
      console.error(`Failed for ${sp.scientific}:`, e.message);
    }
  }

  await browser.close();

  fs.writeFileSync("speciesData.json", JSON.stringify(speciesData, null, 2));
  console.log("speciesData.json updated!");
})();
