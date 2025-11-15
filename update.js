import fs from "fs";
import puppeteer from "puppeteer";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));
const speciesData = [];
const IUCN_TOKEN = process.env.IUCN_TOKEN; // Dein Token in der Umgebung setzen

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // headless: false -> echter Browser
  const page = await browser.newPage();

  for (const sp of speciesList) {
    console.log("Fetching:", sp.scientific);
    try {
      await page.goto(`https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(sp.scientific)}?token=${IUCN_TOKEN}`, { waitUntil: "networkidle2" });
      
      const data = await page.evaluate(() => {
        try {
          const text = document.querySelector("body").innerText;
          const json = JSON.parse(text);
          return json.result?.[0] || null;
        } catch {
          return null;
        }
      });

      speciesData.push({
        german: sp.german,
        scientific: sp.scientific,
        iucn: {
          status: data?.category || null,
          population: data?.population || null
        }
      });
    } catch (e) {
      console.error(`Failed for ${sp.scientific}:`, e.message);
      speciesData.push({
        german: sp.german,
        scientific: sp.scientific,
        iucn: null,
        error: e.message
      });
    }
  }

  await browser.close();
  fs.writeFileSync("speciesData.json", JSON.stringify(speciesData, null, 2));
  console.log("speciesData.json updated!");
})();
