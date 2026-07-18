import assert from "node:assert/strict";
import test from "node:test";

import { formatSpectrogramPipelineLog } from "./pipeline-log.mjs";

test("Spektrogramm-Prozessausgabe wird für die App lesbar zusammengefasst", () => {
  const output = formatSpectrogramPipelineLog(JSON.stringify({
    results: [
      {
        safeName: "Amsel",
        status: "skip",
        inputBytes: 2048,
        outputBytes: 512,
      },
      {
        safeName: "Grüner Leguan",
        status: "missing-mp3",
      },
      {
        safeName: "Bachstelze",
        status: "generated",
        inputBytes: 4096,
        outputBytes: 700,
      },
    ],
    hashRegistry: { updated: 2, changed: true },
  }));
  assert.match(output, /Amsel\n  Sound: vorhanden\n  Spektrogramm: vorhanden/);
  assert.match(output, /Grüner Leguan\n  Sound: fehlt\n  Spektrogramm: übersprungen/);
  assert.match(output, /Bachstelze\n  Sound: vorhanden\n  Spektrogramm: wurde erstellt/);
  assert.match(output, /Zusammenfassung: 1 erstellt, 1 vorhanden, 1 ohne Sound, 0 Fehler/);
  assert.doesNotMatch(output, /"safeName"/);
});

test("Leere und nicht strukturierte Spektrogramm-Ausgaben bleiben verständlich", () => {
  assert.equal(formatSpectrogramPipelineLog(""), "");
  assert.equal(formatSpectrogramPipelineLog("ffmpeg nicht erreichbar"), "ffmpeg nicht erreichbar");
  assert.equal(
    formatSpectrogramPipelineLog(JSON.stringify({ error: "ffmpeg fehlt" })),
    "Spektrogramm-Abgleich: Fehler - ffmpeg fehlt",
  );
});

test("Fehlerhafte Spektrogramm-Jobs werden gezählt und erklärt", () => {
  const output = formatSpectrogramPipelineLog(JSON.stringify({
    jobs: [{ safeName: "Amsel", status: "failed", inputBytes: 100, stderr: "Renderfehler" }],
  }));

  assert.match(output, /Amsel\n  Sound: vorhanden\n  Spektrogramm: Fehler - Renderfehler/);
  assert.match(output, /0 erstellt, 0 vorhanden, 0 ohne Sound, 1 Fehler/);
});
