import crypto from "node:crypto";

export class MasterBuildPaused extends Error {
  constructor() { super("Masteraufbau pausiert. Der letzte bestätigte Schreibblock bleibt erhalten."); this.code = "MASTER_BUILD_PAUSED"; }
}

// The cursor and the taxa it counts live in the SAME SQLite transaction. A
// process crash can never acknowledge rows that SQLite subsequently rolls back.
// Only private candidates use this metadata; readers ignore the extra key.
export function openMasterCheckpoint(database, { revision, timestamp, groups, shouldPause = () => false,
  onCheckpoint = () => {}, blockSize = 500 }) {
  if (!/^[a-f0-9]{64}$/.test(revision) || !Number.isInteger(blockSize) || blockSize < 1) {
    throw new Error("Ungültiger Master-Aufbaucheckpoint.");
  }
  const digest = crypto.createHash("sha256").update(revision).update(timestamp);
  for (const key of groups.keys()) digest.update(JSON.stringify(key) + "\n");
  const contract = digest.digest("hex");
  const total = groups.size;
  const read = database.prepare("SELECT value FROM master_schema_info WHERE key='buildCheckpoint'");
  const save = database.prepare("INSERT OR REPLACE INTO master_schema_info(key,value) VALUES('buildCheckpoint',?)");
  const previous = read.get();
  const cursor = previous ? JSON.parse(previous.value) : { contract, written: 0, reused: 0 };
  if (cursor.contract !== contract || !Number.isInteger(cursor.written) || cursor.written < 0
      || cursor.written > groups.size || !Number.isInteger(cursor.reused) || cursor.reused < 0 || cursor.reused > cursor.written) {
    throw new Error("Der Master-Zwischenstand gehört nicht zu diesen Eingängen oder Regeln. Ein neuer Aufbau ist erforderlich.");
  }
  if (previous && database.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
    throw new Error("Der gespeicherte Master-Zwischenstand ist beschädigt.");
  }
  database.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
  return {
    written: cursor.written,
    reused: cursor.reused,
    manifest: cursor.manifest || null,
    async advance(written, reused, force = false) {
      if (!force && written % blockSize !== 0) return;
      save.run(JSON.stringify({ contract, written, reused }));
      database.exec("COMMIT");
      await onCheckpoint({ written, reused, total });
      if (shouldPause()) throw new MasterBuildPaused();
      database.exec("BEGIN IMMEDIATE");
    },
    finish(manifest) {
      save.run(JSON.stringify({ contract, written: total, reused: manifest.buildInputs.reuse?.reusedTaxa || 0, manifest }));
    },
  };
}
