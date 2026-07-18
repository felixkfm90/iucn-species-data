export function formatSpectrogramPipelineLog(stdoutText) {
  const raw = String(stdoutText ?? "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  const entries = Array.isArray(parsed.results)
    ? parsed.results
    : Array.isArray(parsed.jobs)
      ? parsed.jobs
      : [];
  if (!entries.length) {
    return parsed.error
      ? `Spektrogramm-Abgleich: Fehler - ${parsed.error}`
      : "Spektrogramm-Abgleich: Keine Arten verarbeitet.";
  }

  const counts = {
    generated: 0,
    skipped: 0,
    missingSound: 0,
    failed: 0,
  };
  const lines = ["Spektrogramm-Abgleich:"];
  for (const entry of entries) {
    const status = String(entry.status ?? entry.action ?? "");
    const reason = String(entry.stderr || entry.reason || "").trim();
    const hasSound = status !== "missing-mp3" && Number(entry.inputBytes ?? 0) > 0;
    let spectrogramStatus = status || "geprüft";
    if (status === "generated") {
      counts.generated += 1;
      spectrogramStatus = "wurde erstellt";
    } else if (status === "skip") {
      counts.skipped += 1;
      spectrogramStatus = "vorhanden";
    } else if (status === "missing-mp3") {
      counts.missingSound += 1;
      spectrogramStatus = "übersprungen";
    } else if (status === "failed") {
      counts.failed += 1;
      spectrogramStatus = `Fehler${reason ? ` - ${reason}` : ""}`;
    } else if (status === "generate") {
      spectrogramStatus = "würde erstellt";
    }
    lines.push(
      `${entry.safeName ?? "Unbekannte Art"}`,
      `  Sound: ${hasSound ? "vorhanden" : "fehlt"}`,
      `  Spektrogramm: ${spectrogramStatus}`,
    );
  }
  lines.push(
    `Zusammenfassung: ${counts.generated} erstellt, ${counts.skipped} vorhanden, ${counts.missingSound} ohne Sound, ${counts.failed} Fehler.`,
  );
  if (parsed.hashRegistry) {
    lines.push(
      `Hashregister: ${parsed.hashRegistry.updated ?? 0} geprüft${parsed.hashRegistry.changed ? " und aktualisiert" : ""}.`,
    );
  }
  return lines.join("\n");
}
