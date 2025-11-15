import fs from "fs";
import fetch from "node-fetch";
import { Octokit } from "@octokit/rest";

const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf-8"));

const IUCN_TOKEN = process.env.IUCN_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Personal Access Token
const REPO_OWNER = "DEIN_USERNAME";
const REPO_NAME = "DEIN_REPO";

export default async function handler(req, res) {
  const speciesData = [];

  for (const sp of speciesList) {
    try {
      const response = await fetch(
        `https://apiv3.iucnredlist.org/api/v3/species/${encodeURIComponent(sp.scientific)}?token=${IUCN_TOKEN}`
      );

      if (!response.ok) throw new Error(`IUCN request failed: ${response.status}`);

      const json = await response.json();
      const data = json.result[0] || {};

      speciesData.push({
        german: sp.german,
        scientific: sp.scientific,
        status: data.category || null,
        population: data.population || null
      });
    } catch (e) {
      console.error(`Failed for ${sp.scientific}:`, e.message);
      speciesData.push({ ...sp, status: null, population: null });
    }
  }

  // Push to GitHub
  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  const content = Buffer.from(JSON.stringify(speciesData, null, 2)).toString("base64");

  try {
    const { data: file } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: "speciesData.json"
    });

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: "speciesData.json",
      message: "Update IUCN data",
      content,
      sha: file.sha
    });
  } catch {
    // Wenn die Datei noch nicht existiert
    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: "speciesData.json",
      message: "Create IUCN data",
      content
    });
  }

  res.status(200).json({ success: true, updated: speciesData.length });
}
