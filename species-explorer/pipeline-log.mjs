import { StringDecoder } from "node:string_decoder";

// Decode byte sequences across chunks and keep partial lines out of the visible log.
export function createPipelineTextReader(onText) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  function emit(text, final = false) {
    pending += text;
    const boundary = final ? pending.length : pending.lastIndexOf("\n") + 1;
    if (boundary > 0) {
      onText(pending.slice(0, boundary));
      pending = pending.slice(boundary);
    }
  }
  return {
    write(chunk) { emit(typeof chunk === "string" ? chunk : decoder.write(chunk)); },
    end() { emit(decoder.end(), true); },
  };
}

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
    `Spektrogramm-Ergebnis: ${counts.generated} erstellt, ${counts.skipped} vorhanden, ${counts.missingSound} ohne Sound, ${counts.failed} Fehler.`,
  );
  if (parsed.hashRegistry) {
    lines.push(
      `Hashregister: ${parsed.hashRegistry.updated ?? 0} geprüft${parsed.hashRegistry.changed ? " und aktualisiert" : ""}.`,
    );
  }
  return lines.join("\n");
}

export function formatPipelineSummary(state, report) {
  const success = state.exitCode === 0;
  const lines = ["Gesamtzusammenfassung", success ? "Verarbeitung abgeschlossen." : "Lauf nicht vollständig abgeschlossen."];
  if (state.error) lines.push(`Hinweis: ${state.error}`);
  lines.push(state.gitPublished
    ? "Änderungen wurden an GitHub übertragen. Die dortige Qualitätsprüfung und das Pages-Deployment sind separat."
    : state.gitNoChanges ? "Keine Übertragung erforderlich; keine neuen versionierbaren Änderungen."
      : "Keine erfolgreiche Übertragung bestätigt. Vorhandene lokale Änderungen bleiben erhalten.");
  if (report?.counts) {
    const c = report.counts;
    lines.push(`Letzter gespeicherter Gesamtbestand: ${c.totalSpecies} Arten; fehlende Karten: ${c.missingMap}; fehlende Tierstimmen: ${c.missingSoundMp3}.`);
    if (c.missingMap || c.missingSoundMp3) lines.push("Fehlstellen sind keine erfolgreichen Downloads; Details stehen im Fehlstellenbericht.");
  }
  return lines.join("\n");
}
