import { identityDigest, identitySnapshotHash, normalizeIdentitySnapshot } from "./lightroom-identity-snapshot.mjs";

// Lightroom reads identity/favorite fields for the entire catalog, but full FN
// snapshots only for selected/journal photos and favorites. No invented hash for
// unrelated non-favorite photos; consumers require an exact hash when affected.
export function identityInventoryFromRead(rows, observed) {
  if (!Array.isArray(rows) || rows.length > 1000000 || !Array.isArray(observed) || observed.length > 20000) {
    throw new Error("Die Katalogrücklesung ist unvollständig oder zu groß.");
  }
  const snapshots = new Map();
  for (const value of observed) {
    const snapshot = normalizeIdentitySnapshot(value);
    if (snapshots.has(snapshot.photoUuid)) throw new Error("Doppelte Foto-Rücklesung.");
    snapshots.set(snapshot.photoUuid, snapshot);
  }
  const taxonomyPhotos = rows.map((row) => {
    const snapshot = snapshots.get(row.photoUuid);
    if (snapshot && (snapshot.values.masterTaxonId !== row.masterTaxonId
        || snapshot.values.referenceImage !== row.referenceImage)) throw new Error("Foto und Katalogrücklesung widersprechen sich.");
    snapshots.delete(row.photoUuid);
    return { photoUuid: row.photoUuid, masterTaxonId: row.masterTaxonId, referenceImage: row.referenceImage,
      snapshotHash: snapshot ? identitySnapshotHash(snapshot) : null };
  });
  if (snapshots.size) throw new Error("Zurückgelesene Fotos fehlen im Kataloginventar.");
  const inventory = { complete: true, taxonomyPhotos };
  normalizeIdentityInventory(inventory);
  return inventory;
}

// The Lightroom caller must freshly read the relevant FN metadata for the
// explicit action. A stale statistics cache is not evidence of no other favorite.
export function normalizeIdentityInventory(inventory) {
  if (inventory?.complete !== true || !Array.isArray(inventory.taxonomyPhotos)
      || inventory.taxonomyPhotos.length > 1000000) {
    throw new Error("Art-Favoriten müssen vor der Übernahme vollständig im Katalog geprüft werden.");
  }
  const photos = new Map();
  for (const photo of inventory.taxonomyPhotos) {
    if (typeof photo?.photoUuid !== "string" || !photo.photoUuid || photo.photoUuid.length > 100
        || !/^mtx_[a-f0-9]{32}$/.test(photo.masterTaxonId || "") || photos.has(photo.photoUuid)
        || !["", "yes", "no"].includes(photo.referenceImage)
        || !(photo.snapshotHash === null && photo.referenceImage !== "yes") && !/^[a-f0-9]{64}$/.test(photo.snapshotHash || "")) {
      throw new Error("Die Katalogprüfung ist unvollständig oder widersprüchlich.");
    }
    photos.set(photo.photoUuid, { photoUuid: photo.photoUuid, masterTaxonId: photo.masterTaxonId,
      referenceImage: photo.referenceImage === "yes" ? "yes" : "no", snapshotHash: photo.snapshotHash });
  }
  return { photos, revision: identityDigest([...photos.values()].sort((a, b) => a.photoUuid.localeCompare(b.photoUuid))) };
}

export function undoFavoriteConflicts(eligible, inventory) {
  const { photos, revision } = normalizeIdentityInventory(inventory);
  for (const photo of eligible) {
    const actual = photos.get(photo.photoUuid);
    if (!actual || actual.snapshotHash !== photo.afterHash || actual.masterTaxonId !== photo.after.values.masterTaxonId
        || actual.referenceImage !== (photo.after.values.referenceImage === "yes" ? "yes" : "no")) throw new Error("Rücklesung und Favoritenprüfung passen nicht zusammen.");
  }
  const remaining = new Map(eligible.map((photo) => [photo.photoUuid, photo]));
  const conflicts = [];
  // Removing a conflicted restoration can reveal another conflict (for example
  // when a planned favorite demotion is also removed). Iterate to a stable set.
  while (remaining.size) {
    const counts = new Map();
    for (const current of photos.values()) {
      const restored = remaining.get(current.photoUuid)?.before.values || current;
      if (restored.referenceImage === "yes") counts.set(restored.masterTaxonId, (counts.get(restored.masterTaxonId) || 0) + 1);
    }
    const blocked = [...remaining.values()].filter((photo) => photo.before.values.referenceImage === "yes"
      && counts.get(photo.before.values.masterTaxonId) > 1);
    if (!blocked.length) break;
    for (const photo of blocked) {
      remaining.delete(photo.photoUuid);
      conflicts.push({ photoUuid: photo.photoUuid, reason: "Die Rücknahme würde mehrere Art-Favoriten ergeben. Bitte den Favoritenkonflikt zuerst ausdrücklich klären." });
    }
  }
  return { eligible: [...remaining.values()], conflicts, revision };
}
