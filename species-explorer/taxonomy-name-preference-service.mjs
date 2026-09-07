import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { readTaxonomyDataVersions } from "./taxonomy-data-versions.mjs";
import { taxonomyCorrectionsRevision } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyCorrectionReleaseUnlocked, prepareTaxonomyCorrectionRelease } from "./taxonomy-correction-release.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { readProviderGermanName } from "./taxonomy-provider-standard.mjs";

const text = (value) => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function germanNameChoices(taxon) {
  return [...new Set([text(taxon?.germanName), ...(taxon?.names || [])
    .filter((entry) => entry.language === "de" && ["vernacular", "project"].includes(entry.kind))
    .map((entry) => text(entry.name))].filter(Boolean))];
}

export function createTaxonomyNamePreferenceService({
  searchRoot,
  taxonomyRoot = path.join(path.dirname(path.resolve(searchRoot)), "taxonomy"),
  correctionsPath = fileURLToPath(new URL("../taxonomy-reference-corrections.json", import.meta.url)),
  openStore = openLightroomSearchStore,
  readVersions = readTaxonomyDataVersions,
  activate = activateTaxonomyCorrectionReleaseUnlocked,
  prepare = prepareTaxonomyCorrectionRelease,
  readProviderStandard = readProviderGermanName,
} = {}) {
  async function inspect(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Die Namenswahl-Anfrage ist ungültig.");
    const versions = await readVersions({ searchRoot, taxonomyRoot });
    if (versions.state !== "current") throw new Error(versions.message || "Die aktiven Datenstände passen nicht zusammen.");
    let document;
    try { document = JSON.parse(await fs.readFile(correctionsPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; document = { schemaVersion: 1, entries: [] }; }
    if (document.schemaVersion !== 1 || !Array.isArray(document.entries)) throw new Error("Die gespeicherten Namenskorrekturen sind nicht lesbar.");
    const store = await openStore({ searchRoot });
    try {
      const taxon = store.taxon(text(payload.masterTaxonId));
      const status = store.status();
      if (status.packageId !== versions.packageId || status.masterVersion !== versions.masterVersion
          || (status.correctionRevision || "") !== (versions.correctionRevision || "")) {
        throw new Error("Das Suchpaket wurde während der Prüfung geändert. Bitte erneut versuchen.");
      }
      if (!taxon || taxon.rank !== "species" || !taxon.kingdom || taxon.lifecycleState === "deprecated") {
        throw new Error("Für die Namenswahl muss eine eindeutige aktive Art ausgewählt sein.");
      }
      const entry = document.entries.find((item) => text(item.scientificName) === text(taxon.acceptedScientificName));
      const choices = germanNameChoices(taxon);
      const previous = entry?.namePreference?.masterTaxonId === taxon.masterTaxonId
        ? text(entry.namePreference.previousGermanName) : "";
      if (previous && !choices.includes(previous)) choices.push(previous);
      if (payload.usePrevious === true && !previous) throw new Error("Für diese Art ist keine vorherige Namenswahl gespeichert.");
      const useProviderStandard = payload.useProviderStandard === true;
      if (useProviderStandard && payload.usePrevious === true) throw new Error("Bitte genau eine Namenswahl-Aktion auswählen.");
      const providerStandard = useProviderStandard
        ? await readProviderStandard({ taxonomyRoot, masterTaxonId: taxon.masterTaxonId }) : null;
      if (providerStandard) {
        const after = await readVersions({ searchRoot, taxonomyRoot });
        if (after.state !== "current" || ["masterVersion", "packageId", "correctionRevision"].some((key) => after[key] !== versions[key])) {
          throw new Error("Die Datenbank wurde während der Prüfung geändert. Bitte erneut prüfen.");
        }
      }
      const germanName = providerStandard ? text(providerStandard.germanName)
        : payload.usePrevious === true ? previous : text(payload.germanName);
      if (!germanName || germanName.length > 120 || (!providerStandard && !choices.includes(germanName))) throw new Error("Bitte einen belegten deutschen Namen dieser Art auswählen.");
      const protectedName = Boolean(entry?.germanName || entry?.germanNameMode === "provider" || taxon.projectLinked || (taxon.names || []).some((name) => (
        name.language === "de" && text(name.name) === text(taxon.germanName)
        && ["Eigene Korrektur", "Arten-Explorer"].includes(name.source)
      )));
      const sameMode = useProviderStandard === (entry?.germanNameMode === "provider");
      const unchanged = germanName === text(taxon.germanName) && sameMode
        && taxonomyCorrectionsRevision(document.entries) === versions.masterCorrectionRevision;
      const selection = {
        masterTaxonId: taxon.masterTaxonId, scientificName: taxon.acceptedScientificName,
        kingdom: taxon.kingdom, previousGermanName: text(taxon.germanName), germanName,
        requiresConfirmation: !unchanged && (protectedName || useProviderStandard), unchanged, choices,
        ...(useProviderStandard ? { useProviderStandard: true, providerStandard } : {}),
      };
      const snapshot = { selection, packageStatus: store.status(), document };
      return { document, taxon, entry, versions, selection, token: digest(snapshot) };
    } finally { store.close(); }
  }

  return {
    async preview(payload) {
      const value = await inspect(payload);
      if (!value.selection.unchanged && taxonomyCorrectionsRevision(value.document.entries) !== value.versions.masterCorrectionRevision) {
        throw new Error("Es gibt noch nicht aktivierte Namenskorrekturen. Bitte diese zuerst im Arten-Explorer bearbeiten.");
      }
      return { ...value.selection, token: value.token };
    },
    async save(payload) {
      return withTaxonomyCorrectionLock(taxonomyRoot, async () => {
        const value = await inspect(payload);
        const { selection, document, entry, taxon, versions } = value;
        // Exact replay of an already published operation is harmless.
        if (payload.token && selection.unchanged && entry?.namePreference?.operationToken === payload.token) return { saved: true, unchanged: true };
        if (payload.token && entry?.namePreference?.operationToken === payload.token
            && (entry.germanNameMode === "provider" ? selection.useProviderStandard === true : entry.germanName === selection.germanName)
            && taxonomyCorrectionsRevision(document.entries) === entry.namePreference.publicationRevision) {
          if (selection.useProviderStandard && (digest(entry.namePreference.providerStandard) !== digest(selection.providerStandard)
              || entry.namePreference.previousMasterVersion !== versions.masterVersion)) {
            throw new Error("Der Anbieterstand wurde verändert. Bitte die ausstehende Rücksetzung im Arten-Explorer prüfen.");
          }
          await activate({ taxonomyRoot, searchRoot, corrections: document.entries });
          return { saved: true, germanName: selection.germanName };
        }
        if (!payload.token || payload.token !== value.token) throw new Error("Der Namensstand wurde verändert. Bitte die Auswahl erneut prüfen und bestätigen.");
        if (selection.requiresConfirmation && payload.confirmed !== true) throw new Error("Das Ersetzen der eigenen Namenspräferenz muss bestätigt werden.");
        if (selection.unchanged) return { saved: true, unchanged: true };
        const revision = taxonomyCorrectionsRevision(document.entries);
        if (revision !== versions.masterCorrectionRevision) throw new Error("Es gibt noch nicht aktivierte Namenskorrekturen. Bitte diese zuerst im Arten-Explorer bearbeiten.");
        const nextEntry = {
          ...entry, scientificName: taxon.acceptedScientificName, rank: "species", kingdom: taxon.kingdom,
          germanName: selection.useProviderStandard ? "" : selection.germanName,
          englishName: entry?.englishName || "", note: entry?.note || "Bewusst gewählte deutsche Namensvariante",
          updatedAt: new Date().toISOString(),
          namePreference: {
            masterTaxonId: taxon.masterTaxonId, previousGermanName: selection.previousGermanName, operationToken: payload.token,
            previousSources: (taxon.names || []).filter((name) => name.language === "de" && text(name.name) === selection.previousGermanName),
            previousMasterVersion: versions.masterVersion, previousCorrectionRevision: versions.masterCorrectionRevision,
            ...(selection.useProviderStandard ? { providerStandard: selection.providerStandard } : {}),
          },
        };
        if (selection.useProviderStandard) nextEntry.germanNameMode = "provider";
        else delete nextEntry.germanNameMode;
        const next = { ...document, entries: [...document.entries.filter((item) => item !== entry), nextEntry] };
        nextEntry.namePreference.publicationRevision = taxonomyCorrectionsRevision(next.entries);
        // Resolve identity in both databases before changing the editable correction document.
        await prepare({ taxonomyRoot, searchRoot, corrections: next.entries });
        // Persist the user's decision before publishing; an activation error is a visible pending correction.
        await atomicWriteJson(correctionsPath, next);
        try {
          await activate({ taxonomyRoot, searchRoot, corrections: next.entries });
        } catch (error) {
          return { saved: false, pending: true, message: `Namenswahl gespeichert, aber noch nicht aktiviert: ${error.message}. Im Arten-Explorer „Datenbank aktualisieren“ verwenden.` };
        }
        return { saved: true, germanName: selection.germanName };
      });
    },
  };
}
