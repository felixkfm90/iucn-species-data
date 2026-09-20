import crypto from "node:crypto";

const RANKS = "domain superkingdom kingdom subkingdom infrakingdom superphylum phylum subphylum infraphylum parvphylum superclass megaclass class subclass infraclass parvclass superorder order suborder infraorder parvorder superfamily family subfamily tribe subtribe genus subgenus section species subspecies variety form".split(" ");
export const IDENTITY_FIELDS = Object.freeze(["masterTaxonId", "projectTaxonId", "germanName", "englishName",
  "scientificName", "taxonRank", "taxonomyPath", "taxonomyKeywordIds", "assignedAt", "referenceImage",
  ...RANKS.map((rank) => `taxonomy${rank[0].toUpperCase()}${rank.slice(1)}`)].sort());
export const identityDigest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const managed = (name) => / \(FN\)\*?$/.test(name);

// Exact strings, including whitespace, are significant for optimistic undo.
// No location/time fields, general Lightroom fields or unowned keywords enter
// the writable snapshot. Their values must never be restored by this action.
export function normalizeIdentitySnapshot(value) {
  if (!value || typeof value.photoUuid !== "string" || !value.photoUuid || value.photoUuid.length > 100
      || !value.values || Array.isArray(value.values) || typeof value.values !== "object"
      || Object.keys(value.values).some((key) => !IDENTITY_FIELDS.includes(key))
      || !Array.isArray(value.keywords) || value.keywords.length > 500) {
    throw new Error("Der FN-Taxonomieschnappschuss ist ungültig oder enthält fremde Felder.");
  }
  const values = {};
  for (const field of IDENTITY_FIELDS) {
    if (typeof value.values[field] !== "string" || value.values[field].length > 4000) {
      throw new Error(`Das FN-Feld ${field} fehlt oder ist nicht vollständig lesbar.`);
    }
    values[field] = value.values[field];
  }
  if (!/^mtx_[a-f0-9]{32}$/.test(values.masterTaxonId) || !["", "yes", "no"].includes(values.referenceImage)) {
    throw new Error("Master-ID oder Art-Favoritenstand ist ungültig.");
  }
  const keywords = value.keywords.map((entry) => {
    if (typeof entry?.id !== "string" || !entry.id || entry.id.length > 200
        || typeof entry.name !== "string" || entry.name.length > 500 || !managed(entry.name)) {
      throw new Error("Nur vorhandene, eindeutig mit (FN) oder (FN)* markierte Stichwörter sind rücknehmbar.");
    }
    return { id: entry.id, name: entry.name };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(keywords.map((entry) => entry.id)).size !== keywords.length) throw new Error("Ein Stichwort wurde mehrfach protokolliert.");
  return { photoUuid: value.photoUuid, values, keywords };
}

export function identitySnapshotHash(snapshot) {
  return identityDigest(normalizeIdentitySnapshot(snapshot));
}

export function prepareIdentityJournalChanges(plan, changes) {
  if (plan?.ready !== true || !/^[a-f0-9]{64}$/.test(plan.token || "")
      || !Array.isArray(changes) || !changes.length || changes.length > 20000) {
    throw new Error("Das Änderungsjournal benötigt eine bestätigbare Vorschau und vollständige Fotoschnappschüsse.");
  }
  const transfers = new Map(plan.transfers.map((entry) => [entry.photoUuid, entry]));
  const favorites = new Map(plan.favoriteEffects.map((entry) => [entry.photoUuid, entry]));
  const expected = new Set([...transfers.keys(), ...plan.favoriteEffects.filter((entry) => entry.changesFavorite).map((entry) => entry.photoUuid)]);
  if (changes.length !== expected.size) throw new Error("Die Journalfotos stimmen nicht mit der bestätigten Vorschau überein.");
  return changes.map((change) => {
    const before = normalizeIdentitySnapshot(change.before);
    const after = normalizeIdentitySnapshot(change.after);
    const uuid = before.photoUuid;
    if (uuid !== after.photoUuid || !expected.delete(uuid)) throw new Error("Fremdes oder doppeltes Foto im Änderungsjournal.");
    const transfer = transfers.get(uuid);
    const favorite = favorites.get(uuid);
    if (favorite && (favorite.snapshotHash !== identitySnapshotHash(before) || before.values.referenceImage !== "yes"
        || (!transfer && before.values.masterTaxonId !== favorite.targetMasterTaxonId))) {
      throw new Error("Der bisherige Art-Favorit wurde seit der Vorschau verändert.");
    }
    if (transfer && (transfer.snapshotHash !== identitySnapshotHash(before)
        || before.values.masterTaxonId !== transfer.sourceMasterTaxonId || after.values.masterTaxonId !== transfer.targetMasterTaxonId)) {
      throw new Error("Die Fotoidentität wurde seit der Vorschau verändert.");
    }
    const referenceImage = favorite?.referenceImage || before.values.referenceImage;
    if (after.values.referenceImage !== referenceImage) throw new Error("Die Favoritenänderung wurde nicht so bestätigt.");
    if (!transfer && identityDigest({ ...before, values: { ...before.values, referenceImage } }) !== identityDigest(after)) {
      throw new Error("Ein zusätzliches Favoritenfoto darf ausschließlich seine bestätigte Favoritenmarkierung ändern.");
    }
    return { photoUuid: uuid, before, after, beforeHash: identityDigest(before), afterHash: identityDigest(after) };
  }).sort((a, b) => a.photoUuid.localeCompare(b.photoUuid));
}
