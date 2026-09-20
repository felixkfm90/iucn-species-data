import crypto from "node:crypto";
import { normalizeIdentityInventory } from "./lightroom-identity-inventory.mjs";

const idPattern = /^mtx_[a-f0-9]{32}$/;
const text = (value) => typeof value === "string" ? value.trim() : "";
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const MAX_IDENTITY_PHOTOS = 10000;

export function identityPackageStamp(store) {
  const status = store.status();
  if (!status.available || !status.packageId || !status.masterVersion || !store.identityRevision) {
    throw new Error("Für die Artänderung fehlt ein gültiger Paket-/Identitätsstand.");
  }
  return { packageId: status.packageId, masterVersion: status.masterVersion,
    correctionRevision: status.correctionRevision || "", identityRevision: store.identityRevision };
}

// Input is a Lightroom read snapshot, not a list obtained from keyword names.
// Exact snapshots are retained in the journal; the plan only identifies effects.
function selectedPhotos(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_IDENTITY_PHOTOS) {
    throw new Error(`Bitte 1 bis ${MAX_IDENTITY_PHOTOS} ausdrücklich ausgewählte Fotos prüfen.`);
  }
  const seen = new Set();
  return value.map((photo) => {
    const result = { photoUuid: text(photo?.photoUuid), masterTaxonId: text(photo?.masterTaxonId),
      germanName: text(photo?.germanName), scientificName: text(photo?.scientificName),
      referenceImage: photo?.referenceImage === "yes" ? "yes" : "no", snapshotHash: text(photo?.snapshotHash) };
    if (!result.photoUuid || result.photoUuid.length > 100 || seen.has(result.photoUuid)
        || !["", "yes", "no"].includes(photo.referenceImage)
        || !idPattern.test(result.masterTaxonId) || !/^[a-f0-9]{64}$/.test(result.snapshotHash)) {
      throw new Error("Foto-UUID, bisherige Master-ID und unveränderter FN-Schnappschuss sind erforderlich.");
    }
    seen.add(result.photoUuid);
    return result;
  }).sort((a, b) => a.photoUuid.localeCompare(b.photoUuid));
}

// Traverse only explicitly confirmed registry edges. Every branch remains a
// choice, even if a later merge happens to reduce the set to one current target.
export function identitySuccessorOptions(store, masterTaxonId) {
  const source = store.identityResolution(masterTaxonId);
  if (source.state !== "historical") return { source, targets: [], events: [], containsSplit: false };
  const targets = new Map();
  const events = new Map();
  const seen = new Set();
  const queue = [masterTaxonId];
  let containsSplit = false;
  let unresolved = false;
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (seen.size > 1000) throw new Error("Die Nachfolgerkette ist zu umfangreich. Bitte den Fall im Arten-Explorer prüfen.");
    const relation = store.identityResolution(id);
    if (relation.state === "historical") {
      containsSplit ||= relation.type === "split";
      events.set(`${relation.eventId}|${id}`, { eventId: relation.eventId, type: relation.type,
        sourceMasterTaxonId: id, successorIds: [...relation.successorIds] });
      queue.push(...relation.successorIds);
    } else {
      const taxon = relation.state === "current" ? store.taxon(id) : null;
      if (!taxon || taxon.lifecycleState !== "active") unresolved = true;
      else targets.set(id, { masterTaxonId: id, germanName: taxon.germanName || "",
        scientificName: taxon.acceptedScientificName, rank: taxon.rank });
    }
  }
  return { source, targets: [...targets.values()].sort((a, b) => a.masterTaxonId.localeCompare(b.masterTaxonId)),
    events: [...events.values()].sort((a, b) => a.eventId.localeCompare(b.eventId)
      || a.sourceMasterTaxonId.localeCompare(b.sourceMasterTaxonId)), containsSplit, unresolved };
}

function choicesBySource(value, sources) {
  if (!Array.isArray(value) || value.length > sources.size) throw new Error("Ungültige Nachfolgerauswahl.");
  const choices = new Map();
  for (const entry of value) {
    const sourceId = text(entry?.sourceMasterTaxonId);
    const targetId = text(entry?.targetMasterTaxonId);
    if (!sources.has(sourceId) || choices.has(sourceId) || !idPattern.test(targetId)) {
      throw new Error("Jede gewählte Ausgangsart benötigt genau einen ausdrücklich gewählten Nachfolger.");
    }
    choices.set(sourceId, targetId);
  }
  return choices;
}

function favoriteEffects(transfers, photos, inventory, decisions) {
  const targetIds = [...new Set(transfers.map((entry) => entry.targetMasterTaxonId))].sort();
  if (!targetIds.length) return { effects: [], conflicts: [] };
  // A complete, explicitly requested catalog read is necessary: the persistent
  // statistics index can miss favorite changes made outside the plug-in.
  if (!Array.isArray(decisions)) throw new Error("Ungültige Favoritenentscheidung.");
  const { photos: byUuid, revision } = normalizeIdentityInventory(inventory);
  for (const photo of photos) {
    const current = byUuid.get(photo.photoUuid);
    if (!current || current.masterTaxonId !== photo.masterTaxonId || current.referenceImage !== photo.referenceImage
        || current.snapshotHash !== photo.snapshotHash) {
      throw new Error("Fotoauswahl und Katalogprüfung passen nicht zusammen. Bitte neu prüfen.");
    }
  }
  const decisionMap = new Map();
  for (const decision of decisions) {
    if (!targetIds.includes(decision?.targetMasterTaxonId) || decisionMap.has(decision.targetMasterTaxonId)
        || !text(decision.photoUuid)) throw new Error("Ungültige Favoritenentscheidung.");
    decisionMap.set(decision.targetMasterTaxonId, decision.photoUuid);
  }
  const moved = new Map(transfers.map((entry) => [entry.photoUuid, entry.targetMasterTaxonId]));
  const effects = [];
  const conflicts = [];
  const favoritesByTarget = new Map(targetIds.map((id) => [id, []]));
  for (const photo of byUuid.values()) {
    const target = moved.get(photo.photoUuid) || photo.masterTaxonId;
    if (photo.referenceImage === "yes") favoritesByTarget.get(target)?.push(photo.photoUuid);
  }
  for (const targetId of targetIds) {
    const favorites = favoritesByTarget.get(targetId).sort();
    const winner = decisionMap.get(targetId);
    if (winner && (!favorites.includes(winner) || favorites.length < 2)) throw new Error("Die Favoritenwahl passt nicht mehr zum geprüften Konflikt.");
    if (favorites.length > 1 && !winner) conflicts.push({ targetMasterTaxonId: targetId, photoUuids: favorites });
    for (const photoUuid of favorites) effects.push({ photoUuid, targetMasterTaxonId: targetId,
      referenceImage: winner && winner !== photoUuid ? "no" : "yes", changesFavorite: Boolean(winner && winner !== photoUuid),
      snapshotHash: byUuid.get(photoUuid).snapshotHash });
  }
  return { effects, conflicts, revision };
}

export function previewLightroomIdentity(store, request) {
  const catalogKey = text(request?.catalogKey);
  if (!catalogKey || catalogKey.length > 1000) throw new Error("Eine eindeutige Katalogkennung ist erforderlich.");
  const photos = selectedPhotos(request.photos);
  const sources = new Set(photos.map((photo) => photo.masterTaxonId));
  const choices = choicesBySource(request.choices || [], sources);
  const cases = [...sources].sort().map((id) => {
    const relation = identitySuccessorOptions(store, id);
    const selected = choices.get(id);
    if (selected && !relation.targets.some((target) => target.masterTaxonId === selected)) {
      throw new Error("Der gewählte Nachfolger ist nicht durch die bestätigte Identitätshistorie belegt.");
    }
    return { ...relation, photos: photos.filter((photo) => photo.masterTaxonId === id),
      targetMasterTaxonId: selected || null };
  });
  const transfers = cases.flatMap((entry) => entry.targetMasterTaxonId ? entry.photos.map((photo) => ({
    photoUuid: photo.photoUuid, sourceMasterTaxonId: photo.masterTaxonId,
    targetMasterTaxonId: entry.targetMasterTaxonId, snapshotHash: photo.snapshotHash })) : []);
  const favorites = favoriteEffects(transfers, photos, request.favoriteInventory, request.favoriteDecisions || []);
  const body = { catalogKey, package: identityPackageStamp(store), photos, cases, transfers,
    favoriteInventoryRevision: favorites.revision || "",
    favoriteEffects: favorites.effects, favoriteConflicts: favorites.conflicts,
    skippedPhotoCount: photos.length - transfers.length };
  return { ...body, token: digest(body), ready: transfers.length > 0 && !favorites.conflicts.length,
    changesPhotos: false, changesLocationTime: false };
}

export function confirmLightroomIdentity(store, request) {
  const preview = previewLightroomIdentity(store, request);
  if (request.confirmed !== true || request.token !== preview.token || !preview.ready) {
    throw new Error("Die Artänderung benötigt eine aktuelle, konfliktfreie Vorschau und ausdrückliche Bestätigung.");
  }
  return preview;
}
