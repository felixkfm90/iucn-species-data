import { check } from "./errors.mjs";
import { canonicalJson, digest } from "./security.mjs";
import { validateReaderSpecies } from "./reader-catalog.mjs";
import { readerMediaRequirements } from "./reader-projection.mjs";

/** Validate the full server projection against the person and exact source actually reviewed. */
export function validateReaderApprovalPreview(value, expected) {
  const encoded = canonicalJson(value, { maxBytes: 4 * 1024 * 1024 + 16 * 1024, maxNodes: 300000 });
  const result = JSON.parse(encoded);
  const keys = ["schemaVersion", "projectId", "user", "speciesId", "revision", "dataHash", "readerHash", "readerSpecies", "missingMedia", "internalOnly", "externalPublication"];
  check(result && Object.keys(result).length === keys.length && keys.every(key => Object.hasOwn(result, key))
    && result.schemaVersion === 1 && result.projectId === expected.projectId && result.user?.id === expected.userId
    && result.user.role === expected.role && Object.keys(result.user).sort().join(",") === "id,role"
    && result.speciesId === expected.speciesId && result.revision === expected.revision && result.dataHash === expected.dataHash
    && typeof result.readerHash === "string" && /^[a-f0-9]{64}$/.test(result.readerHash)
    && result.internalOnly === true && result.externalPublication === "not-performed",
  502, "invalid_reader_approval_response", "Die Leserprüfung gehört nicht eindeutig zur geprüften Artfassung und Anmeldung.");
  const reader = validateReaderSpecies(result.readerSpecies, { projectId: expected.projectId });
  check(reader.id === expected.speciesId && digest(canonicalJson(reader, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 })) === result.readerHash
    && canonicalJson(readerMediaRequirements(reader)) === canonicalJson(result.missingMedia),
  502, "invalid_reader_approval_response", "Die Leserprüfung besitzt keinen passenden vollständigen Inhalts- und Medienbeleg.");
  return result;
}
