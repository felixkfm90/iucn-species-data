import { identityDigest, identitySnapshotHash, normalizeIdentitySnapshot } from "./lightroom-identity-snapshot.mjs";
import { normalizeIdentityInventory } from "./lightroom-identity-inventory.mjs";

// Read-only scheduling. The Lightroom caller must recheck the same live state
// under catalog write access; this token is NOT permission to skip that check.
export function previewIdentityBlock(run, { direction = "apply", observed, favoriteInventory, packageStamp }) {
  if (!["apply", "undo"].includes(direction)) throw new Error("Unbekannte Artänderungsaktion.");
  if (direction === "apply" && identityDigest(run.plan.package) !== identityDigest(packageStamp)) {
    throw new Error("Der Datenbankstand hat sich geändert. Keine weitere Übernahme mit der alten Vorschau.");
  }
  if (!Array.isArray(observed) || observed.length > 20000) throw new Error("Die aktuelle Foto-Rücklesung fehlt.");
  const snapshots = new Map();
  for (const value of observed) {
    const snapshot = normalizeIdentitySnapshot(value);
    if (snapshots.has(snapshot.photoUuid)) throw new Error("Ein Foto wurde mehrfach zurückgelesen.");
    snapshots.set(snapshot.photoUuid, snapshot);
  }
  const { photos, revision } = normalizeIdentityInventory(favoriteInventory);
  const pendingState = direction === "apply" ? "prepared" : "undo-prepared";
  const otherState = direction === "apply" ? "undo-prepared" : "prepared";
  if (run.photos.some((photo) => photo.state === otherState)) {
    throw new Error("Zuerst die andere offene Schreibrichtung des Journals klären.");
  }
  const pending = run.photos.filter((photo) => photo.state === pendingState);
  const from = (photo) => direction === "apply" ? photo.before : photo.after;
  const to = (photo) => direction === "apply" ? photo.after : photo.before;
  // Do not silently skip an uncertain photo. It may be a prerequisite favorite
  // demotion for a later photo. Explicit reconciliation comes first.
  for (const photo of pending) {
    const snapshot = snapshots.get(photo.photoUuid);
    const inventory = photos.get(photo.photoUuid);
    const expected = from(photo);
    if (!snapshot || identitySnapshotHash(snapshot) !== identitySnapshotHash(expected)) {
      throw new Error("Ein vorbereiteter Fotozustand ist unklar. Zuerst den unterbrochenen Lauf prüfen.");
    }
    if (!inventory || inventory.snapshotHash !== identitySnapshotHash(snapshot)
        || inventory.masterTaxonId !== snapshot.values.masterTaxonId
        || inventory.referenceImage !== (snapshot.values.referenceImage === "yes" ? "yes" : "no")) {
      throw new Error("Foto-Rücklesung und aktuelle Favoritenprüfung passen nicht zusammen.");
    }
  }
  const counts = new Map();
  for (const photo of photos.values()) {
    if (photo.referenceImage === "yes") counts.set(photo.masterTaxonId, (counts.get(photo.masterTaxonId) || 0) + 1);
  }
  const changeCount = (snapshot, delta) => {
    const { masterTaxonId, referenceImage } = snapshot.values;
    if (referenceImage === "yes") counts.set(masterTaxonId, (counts.get(masterTaxonId) || 0) + delta);
  };
  const createsFavorite = (photo) => to(photo).values.referenceImage === "yes"
    && (from(photo).values.referenceImage !== "yes" || from(photo).values.masterTaxonId !== to(photo).values.masterTaxonId);
  const ordered = [...pending].sort((a, b) => Number(createsFavorite(a)) - Number(createsFavorite(b))
    || a.photoUuid.localeCompare(b.photoUuid));
  const changes = [];
  const blocked = [];
  // Favoriten zuerst abwählen, erst danach auf das Ziel übertragen. Thus every
  // committed prefix (including a pause at 250 photos) remains conflict-free.
  for (const photo of ordered) {
    if (changes.length === 250) break;
    const target = to(photo).values;
    if (createsFavorite(photo) && (counts.get(target.masterTaxonId) || 0) > 0) {
      blocked.push(photo.photoUuid);
      continue;
    }
    changeCount(from(photo), -1);
    changeCount(to(photo), 1);
    changes.push(photo);
  }
  if (blocked.length) throw new Error("Ein aktueller Art-Favorit verhindert die Fortsetzung. Bitte den Konflikt ausdrücklich klären.");
  const body = { runId: run.runId, direction, journalRevision: identityDigest(run),
    inventoryRevision: revision, package: direction === "apply" ? packageStamp : null,
    changes, remainingPhotoCount: pending.length - changes.length };
  return { ...body, token: identityDigest(body), ready: changes.length > 0, changesPhotos: false };
}
