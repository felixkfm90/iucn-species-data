import fs from "fs";
import puppeteer from "puppeteer";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));
const speciesData = [];
const IUCN_TOKEN = process.env.IUCN_TOKEN;

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();

  for (const sp of speciesList) {
    console.log("Fetching:", sp.scientific);

    try {
      // Navigiere zu einer kleinen HTML-Seite in Puppeteer, um fetch auszuführen
      const data = await page.evaluate(async (species, token) => {
        const response = await fetch(`https://apiv3.iucnredlist.org/api/v3/species/${species}?token=${token}`);
        if (!response.ok) throw new Error("Request failed");
        const json = await response.json();
        if (!json.result || json.result.length === 0) return null;
        const { category, population } = json.result[0];
        return { status: category, population };
      }, sp.scientific, IUCN_TOKEN);

      speciesData.push({ ...sp, iucn: data });
    } catch (e) {
      console.error(`Failed for ${sp.scientific}:`, e.message);
      speciesData.push({ ...sp, iucn: null });
    }
  }

  await browser.close();

  if (!fs.existsSync("api")) fs.mkdirSync("api");
  fs.writeFileSync("api/speciesData.json", JSON.stringify(speciesData, null, 2));
  console.log("api/speciesData.json updated!");
})();
