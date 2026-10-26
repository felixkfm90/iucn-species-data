import { validateRepositoryMedia } from "../scripts/validate-media-assets.mjs";

// Same media gate as CI, before staging/commit/push. Never modifies assets.
export async function checkPipelinePublication(repoRoot, validate = validateRepositoryMedia) {
  const result = await validate(repoRoot);
  if (result.ok) return { ok: true, message: "Lokale Medienprüfung bestanden." };
  const errors = result.errors || [];
  return { ok: false, message: "Übertragung angehalten: Die lokale Medienprüfung ist fehlgeschlagen. "
    + errors.slice(0, 5).join(" ") + (errors.length > 5 ? ` Weitere ${errors.length - 5} Befunde.` : "")
    + " Lokale Änderungen bleiben erhalten. Fehlende oder ungültige Dateien bitte im Arten-Explorer ergänzen und anschließend Änderungen übertragen." };
}
