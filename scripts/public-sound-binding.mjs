import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeAssetName } from "../species-explorer/species-model.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function matchesPublicSoundBinding(binding, soundHash, spectrogramHash) {
  return Boolean(binding?.stale === false && typeof soundHash === "string" && typeof spectrogramHash === "string"
    && binding.soundSha256 === soundHash && binding.spectrogramSha256 === spectrogramHash);
}

async function readMedia(filename) {
  try { return await readFile(filename); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function checkPublicSpeciesSoundBinding(repoRoot, assetName, binding) {
  const folder = path.join(repoRoot, "species-assets", assetName);
  const [sound, spectrogram] = await Promise.all([
    readMedia(path.join(folder, "sound.mp3")),
    readMedia(path.join(folder, "spectrogram.webp")),
  ]);
  if (!sound && !spectrogram && !binding) return null;
  if (!sound?.length || !spectrogram?.length || !matchesPublicSoundBinding(binding, sha256(sound), sha256(spectrogram))) {
    return `${assetName}: Tierstimme und Spektrogramm brauchen eine aktuelle, zu beiden Dateien passende Prüfsummenbindung.`;
  }
  return null;
}

async function checkPublicCatalogSounds(repoRoot) {
  const [catalog, registry] = await Promise.all(["speciesData.json", "species-assets-overrides.json"]
    .map(async filename => JSON.parse(await readFile(path.join(repoRoot, filename), "utf8"))));
  const issues = [];
  for (const entry of catalog) {
    const assetName = sanitizeAssetName(entry["Deutscher Name"]);
    const issue = await checkPublicSpeciesSoundBinding(repoRoot, assetName, registry.assets?.[assetName]?.spectrogram);
    if (issue) issues.push(issue);
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const issues = await checkPublicCatalogSounds(process.cwd());
    if (issues.length) throw new Error(issues.join("\n"));
    console.log("Die öffentlichen Tierstimmen und Spektrogramme stimmen mit ihren Prüfsummenbindungen überein.");
  } catch (error) {
    console.error(`Prüfung der öffentlichen Tonpakete fehlgeschlagen. ${error.message}`);
    process.exitCode = 1;
  }
}
