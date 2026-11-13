import { createHash } from "node:crypto";
import { sanitizeAssetName } from "../species-model.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { parseWebsiteEditorialPage, parseWebsiteAltPage, canonicalWebsiteImageSource } from "../website-alt-parser.mjs";
import { reportedMediaOmissions } from "../../scripts/validate-media-assets.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const taxonomyKeys = new Set(["Kingdom", "Phylum", "Class", "Order", "Family", "Genus", "Species"]);
// The public catalog uses seven taxonomic ranks and excludes IUCN lookup metadata.
const sourceOnlyKeys = new Set(["URLSlug", "Subphylum", "Taxon ID", "IUCN-Zuordnung"]);

/** Independent source-to-DTO parity check, using explicit bound source inputs only. */
export async function validateSpeciesSnapshot({ snapshot, speciesData, pages, readAsset, missingMediaReport }) {
  const issues = [], rows = [];
  const verify = (condition, code, details = {}) => { if (!condition) issues.push({ code, ...details }); return Boolean(condition); };
  let catalog;
  try { catalog = buildCatalog(snapshot.catalog); }
  catch { return { passed: false, issues: [{ code: "catalog-schema-invalid" }], rows: [] }; }
  verify(snapshot.complete === true, "export-incomplete");
  verify(JSON.stringify(catalog.species.map((entry) => entry.id).sort()) === JSON.stringify(speciesData.map((entry) => entry.URLSlug).sort()), "species-set-mismatch");
  for (const record of speciesData) {
    const slug = record.URLSlug, before = issues.length, data = catalog.species.find((entry) => entry.id === slug), source = pages.get(slug);
    if (!verify(data && source, "species-source-missing", { slug })) continue;
    const germanName = record["Deutscher Name"], assetName = sanitizeAssetName(germanName);
    const omissions = missingMediaReport ? reportedMediaOmissions(missingMediaReport, { germanName, safeName: assetName }) : null;
    if (omissions) verify(!omissions.errors.length, "inconsistent-media-omission-report", { slug });
    const editorial = parseWebsiteEditorialPage(source.html, source.url), images = parseWebsiteAltPage(source.html, source.url).images;
    verify(editorial.complete, "source-editorial-incomplete", { slug });
    verify(data.websiteUrl === source.url, "website-url-mismatch", { slug });
    verify(data.scientificName === record["Wissenschaftlicher Name"], "scientific-name-mismatch", { slug });
    const speciesRank = data.taxonomy.find((entry) => entry.rank === "species");
    verify(!record.Species || speciesRank?.name === data.scientificName, "species-rank-not-full-name", { slug });
    for (const key of taxonomyKeys) {
      if (key === "Species" || !record[key]) continue;
      verify(data.taxonomy.find((entry) => entry.rank === key.toLowerCase())?.name === record[key], "taxonomy-value-mismatch", { slug, key });
    }
    const general = data.sections.find((entry) => entry.title.trim().toLowerCase() === "allgemein");
    for (const [key, value] of Object.entries(record)) {
      if (sourceOnlyKeys.has(key) || taxonomyKeys.has(key) || value === null || value === undefined || value === "") continue;
      verify(general?.text.includes(`${key}: ${value}`), "structured-value-missing", { slug, key });
    }
    const expectedTitles = editorial.sections.map((entry) => entry.heading || "Einleitung"), actual = data.sections.filter((entry) => entry.id !== "structured-general");
    verify(JSON.stringify(actual.map((entry) => entry.title)) === JSON.stringify(expectedTitles), "editorial-heading-order-mismatch", { slug });
    for (const [index, section] of editorial.sections.entries()) {
      const text = section.paragraphs.map((entry) => entry.kind === "list-item" ? `• ${entry.text}` : entry.text).join("\n\n");
      const target = actual[index];
      verify(target && (target.title.trim().toLowerCase() === "allgemein" ? target.text.startsWith(text) : target.text === text), "editorial-paragraph-parity-mismatch", { slug, index });
      if (!text && target?.title === "Verbreitungskarte") {
        verify((Boolean(data.media.map) || omissions?.allowMissingMap) && target.intentionallyEmpty, "dynamic-map-misclassified", { slug });
      }
    }
    verify(JSON.stringify(data.media.gallery.map((entry) => canonicalWebsiteImageSource(entry.url))) === JSON.stringify(editorial.gallerySources), "gallery-order-or-source-mismatch", { slug });
    for (const [order, gallery] of data.media.gallery.entries()) {
      const canonical = canonicalWebsiteImageSource(gallery.url), matching = images.filter((entry) => entry.context === "content" && entry.kind === "image" && entry.sourceUrl === canonical);
      const captions = [...new Set(matching.flatMap((entry) => entry.captionVariants).filter(Boolean))];
      verify(gallery.order === order && gallery.id === `${slug}:gallery:${sha(canonical).slice(0, 24)}`, "gallery-identity-mismatch", { slug, order });
      verify(gallery.alt === matching[0]?.alt && gallery.caption === (captions[0] ?? ""), "public-gallery-text-mismatch", { slug, order });
      verify(!("bytes" in gallery) && !("sha256" in gallery), "unmeasured-gallery-integrity-claim", { slug, order });
    }
    let mediaChecked = 0;
    for (const [key, filename, entries] of [["portrait", "portrait.webp", data.media.portrait ? [data.media.portrait] : []],
      ["map", "map.jpg", data.media.map ? [data.media.map] : []], ["sound", "sound.mp3", data.media.sounds]]) {
      if (omissions) {
        const documentedMissing = omissions[key === "portrait" ? "allowMissingPortrait" : key === "map" ? "allowMissingMap" : "allowMissingSound"];
        verify(entries.length === (documentedMissing ? 0 : 1), "media-omission-mismatch", { slug, key });
      } else if (key !== "sound") verify(entries.length === 1, "required-media-missing", { slug, key });
      for (const entry of entries) {
        verify(entry.url === `https://felixkfm90.github.io/iucn-species-data/species-assets/${encodeURIComponent(assetName)}/${filename}`,
          "asset-url-mismatch", { slug, key });
        if (readAsset) {
          const bytes = await readAsset(`${assetName}/${filename}`);
          verify(bytes.length === entry.bytes && sha(bytes) === entry.sha256, "actual-asset-integrity-mismatch", { slug, key }); mediaChecked++;
        }
      }
    }
    const evidence = snapshot.results.find((entry) => entry.slug === slug)?.evidence;
    verify(evidence?.htmlSha256 === sha(Buffer.from(source.html)), "html-source-binding-mismatch", { slug });
    rows.push({ slug, passed: issues.length === before, sections: editorial.sections.length,
      paragraphs: editorial.sections.reduce((sum, entry) => sum + entry.paragraphs.length, 0), galleryImages: data.media.gallery.length, mediaChecked });
  }
  return { passed: issues.length === 0 && rows.length === speciesData.length, speciesCount: rows.length,
    sourcePagesChecked: pages.size, galleryImagesChecked: rows.reduce((sum, entry) => sum + entry.galleryImages, 0),
    editorialParagraphsChecked: rows.reduce((sum, entry) => sum + entry.paragraphs, 0),
    localMediaFilesChecked: rows.reduce((sum, entry) => sum + entry.mediaChecked, 0), issues, rows };
}
