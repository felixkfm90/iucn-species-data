import { createHash } from "node:crypto";

const hash = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
const checksum = (value) => /^sha256:[a-f0-9]{64}$/.test(String(value || ""));

// UI eligibility only: use manifests already loaded for status. Never scan SQLite,
// fingerprint a multi-GB file, or grant incremental reuse from this cheap check.
export function taxonomyBaselineSetupStatus({ lifecycle = {}, lightroomPackage = {}, reference = {},
  corrections = {}, identities = {}, buildJob = {}, active = false } = {}) {
  const master = lifecycle.active;
  const pkg = lightroomPackage?.active;
  const inputs = master?.buildInputs;
  const masterRecorded = inputs?.available === true && inputs.file === "build-inputs.sqlite"
    && hash(inputs.fingerprint) && hash(inputs.masterSha256);
  const packageRecorded = hash(pkg?.exportContract) && checksum(pkg?.sourceChecksum);
  const needed = Boolean(master && (!masterRecorded || !packageRecorded));
  let blockedReason = "";
  if (needed) {
    if (lifecycle.error || reference.status !== "current" || lightroomPackage?.status !== "current"
      || !pkg?.packageId || pkg.masterVersion !== (master.candidateId || master.masterVersion)) {
      blockedReason = "Zuerst den Datenbankstatus über die reguläre Aktualisierung angleichen oder den angezeigten Lesefehler beheben.";
    } else if (buildJob.available && buildJob.status !== "ready") {
      blockedReason = "Zuerst den gespeicherten Masteraufbau fortsetzen oder dessen veralteten Stand über einen neuen Aufbau behandeln.";
    } else if (lifecycle.candidate) {
      blockedReason = "Es liegt bereits ein Kandidat vor. Bitte dessen Prüfungen und Übernahme abschließen.";
    }
  }
  const revision = createHash("sha256").update(JSON.stringify({
    masterVersion: master?.candidateId || master?.masterVersion || "",
    masterSchema: master?.schemaVersion || null,
    inputs: inputs ? { available: inputs.available, file: inputs.file, fingerprint: inputs.fingerprint,
      masterSha256: inputs.masterSha256 } : null,
    packageId: pkg?.packageId || "", packageChecksum: pkg?.checksum || "",
    sourceChecksum: pkg?.sourceChecksum || "", exportContract: pkg?.exportContract || "",
    reference: reference.activeRelease || "", corrections: corrections.currentRevision || "",
    identities: identities.revision || "",
  })).digest("hex");
  return { needed, canStart: needed && !blockedReason && !active, blockedReason, revision,
    masterRecorded, packageRecorded, check: "manifest-only" };
}

export function assertBaselineSetup(status, revision) {
  const setup = status.baselineSetup;
  if (!setup?.needed || setup.blockedReason || !revision || revision !== setup.revision) {
    const error = new Error(setup?.blockedReason || (!setup?.needed
      ? "Eine einmalige Vergleichsgrundlage ist nicht erforderlich. Bitte den Datenbankstatus neu laden."
      : "Der bestätigte Datenbankstand hat sich geändert. Bitte die Vergleichsgrundlage erneut bestätigen."));
    error.statusCode = 409;
    throw error;
  }
}
