import fs from "fs";
import puppeteer from "puppeteer";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));
const speciesData = [];

const IUCN_TOKEN = process.env.IUCN_TOKEN;
if (!IUCN_TOKEN) {
  console.error("Error: IUCN_TOKEN not set");
  process.exit(1);
}

async function fetchSpecies(species) {
  const url = `https://apiv3.iucnredlist.org/api/v3/species/${species.scientific}?token=${IUCN_TOKEN}`;
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const content = await page.content();
  
  await browser.close();

  try {
    // IUCN gibt JSON zurück, wir extrahieren es
    const jsonMatch = content.match(/\{.*\}/s);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return data.result[0];
    }
  } catch (e) {
    console.error(`Failed to parse ${species.scientific}:`, e);
  }
  return null;
}

(async () => {
  for (const sp of speciesList) {
    console.log("Fetching:", sp.scientific);
    const data = await fetchSpecies(sp);
    if (data) {
      speciesData.push({ ...sp, iucn: data });
    }
  }

  fs.writeFileSync("speciesData.json", JSON.stringify(speciesData, null, 2));
  console.log("speciesData.json updated!");
})();
