import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { extname, join, resolve, sep } from "node:path";
import { buildPipelinePlan } from "../scripts/pipeline-selection.mjs";
import { buildCleanupPlan } from "../scripts/species-cleanup.mjs";
import { cleanupManagedExplorerTemp } from "./temp-retention.mjs";
import { prunePipelineLogs } from "./asset-backups.mjs";
import {
  publicCleanupPlan,
  publicPipelinePlan,
  sanitizeAssetName,
} from "./species-model.mjs";
import { synchronizeManualMapDocumentation } from "./manual-map-documentation.mjs";
import { formatSpectrogramPipelineLog } from "./pipeline-log.mjs";
import { isNonCommercialLicense } from "./media-assets.mjs";
import { closeActiveFileStreams, sendFile, sendText } from "./http-routing.mjs";
import { isPathInside } from "./request-security.mjs";

export function createPipelineController({
  repoRoot,
  speciesListPath,
  assetOverridesPath,
  assessmentIdsPath,
  manualMapOverridesPath,
  pipelineLogDir,
  pipelineAssetBackupRoot,
  pendingAssetReviewPath,
  previewTokens,
  previewTokenTtlMs,
  pipelineLogLineLimit,
  runtime,
  getModel,
  refreshModel,
  cleanupPreviewTokens,
  readPendingProjectChanges,
  pendingAssetSpeciesFromFiles,
  isPipelineActive,
  isBackupActive,
  isAssetWriteActive,
  hashText,
  compactTimestamp,
  readJson,
}) {
  async function readPipelinePlan(mode, targetSlugs = []) {
    const [speciesListText, speciesDataText] = await Promise.all([
      readFile(speciesListPath, "utf8"),
      readFile(join(repoRoot, "speciesData.json"), "utf8"),
    ]);
    const speciesList = JSON.parse(speciesListText);
    const existingSpeciesData = JSON.parse(speciesDataText);
    const plan = mode === "cleanup"
      ? buildCleanupPlan(repoRoot)
      : buildPipelinePlan({
        speciesList,
        existingSpeciesData,
        repoRoot,
        sanitizeAssetName,
        mode,
        targetSlugs,
      });
    let pendingProjectChanges = { files: [], count: 0, error: "" };
    if (mode === "transfer") {
      pendingProjectChanges = await readPendingProjectChanges();
      const pendingAssetSpecies = pendingAssetSpeciesFromFiles(pendingProjectChanges.files, speciesList);
      const affectedSpeciesKeys = new Set([
        ...(plan.targets ?? []).map((target) => String(target.safeName ?? target.slug ?? "").toLocaleLowerCase("de")),
        ...pendingAssetSpecies.map((entry) => entry.safeName.toLocaleLowerCase("de")),
      ].filter(Boolean));
      plan.pendingFiles = pendingProjectChanges.files;
      plan.pendingFileCount = pendingProjectChanges.count;
      plan.pendingFileError = pendingProjectChanges.error;
      plan.pendingAssetSpecies = pendingAssetSpecies;
      plan.pendingAssetSpeciesCount = pendingAssetSpecies.length;
      plan.affectedSpeciesCount = affectedSpeciesKeys.size;
      plan.hasWork = plan.hasWork || pendingProjectChanges.count > 0;
    }
    return {
      plan,
      sourceRevision: hashText(
        `${speciesListText}\n${speciesDataText}\n${JSON.stringify(
          {
            targetSlugs,
            pendingProjectChanges,
            plan: mode === "cleanup" ? publicCleanupPlan(plan) : publicPipelinePlan(plan),
          },
        )}`,
      ),
    };
  }

  async function pendingChangesPayload() {
    const { plan } = await readPipelinePlan("transfer", []);
    const publicPlan = publicPipelinePlan(plan);
    return {
      hasPendingChanges: publicPlan.hasWork,
      manualChangeCount: publicPlan.targetCount,
      pendingFileCount: publicPlan.pendingFileCount,
      pendingFiles: publicPlan.pendingFiles,
      pendingAssetSpeciesCount: publicPlan.pendingAssetSpeciesCount,
      pendingAssetSpecies: publicPlan.pendingAssetSpecies,
      affectedSpeciesCount: publicPlan.affectedSpeciesCount,
      targets: publicPlan.targets,
      error: plan.pendingFileError || "",
    };
  }

  async function previewPipeline(payload) {
    cleanupPreviewTokens();
    const mode = String(payload?.mode ?? "");
    if (!["all", "missing", "manual-maps", "nc-sounds", "cleanup", "transfer"].includes(mode)) {
      const error = new Error(
        "Pipeline-Modus muss all, missing, manual-maps, nc-sounds, transfer oder cleanup sein",
      );
      error.statusCode = 400;
      throw error;
    }
    if (isPipelineActive()) {
      const error = new Error("Es läuft bereits eine Datenbank-Aktion. Bitte den laufenden Prozess abwarten.");
      error.statusCode = 409;
      throw error;
    }
    if (isBackupActive()) {
      const error = new Error("Während eines laufenden NAS-Backups kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    if (isAssetWriteActive()) {
      const error = new Error("Während eines laufenden Schreibvorgangs kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }

    const targetSlugs = Array.isArray(payload?.targetSlugs)
      ? payload.targetSlugs.map((slug) => String(slug ?? "").trim().toLocaleLowerCase("de")).filter(Boolean)
      : [];
    const { plan, sourceRevision } = await readPipelinePlan(mode, targetSlugs);
    const token = randomUUID();
    const expiresAt = Date.now() + previewTokenTtlMs;
    previewTokens.set(token, {
      type: "pipeline",
      mode,
      targetSlugs,
      sourceRevision,
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      ...(mode === "cleanup" ? publicCleanupPlan(plan) : publicPipelinePlan(plan)),
      tokensAvailable:
        mode === "cleanup"
        || mode === "transfer"
        || (mode === "manual-maps" && Boolean(process.env.IUCN_TOKEN))
        || (mode === "nc-sounds" && Boolean(process.env.XENO_TOKEN))
        || Boolean(process.env.IUCN_TOKEN && process.env.XENO_TOKEN),
      warnings: [
        "Nach erfolgreichem Lauf werden die Pipeline-Dateien automatisch committed und gepusht.",
        mode === "cleanup"
          ? "Die aufgelisteten Alt-Daten und Assetordner werden dauerhaft gelöscht und sind danach nicht wiederherstellbar."
          : mode === "manual-maps"
            ? "Nur manuell geschützte Karten werden erneut bei IUCN gesucht und vor einer Übernahme angezeigt."
            : mode === "nc-sounds"
              ? "Vorhandene NC-Sounds werden auf freie Alternativen geprüft; fehlende Sounds werden erneut gesucht und vor einer Übernahme angehört."
          : mode === "transfer"
            ? "Geaenderte manuelle Eingabefelder und lokal gespeicherte Asset-Dateien werden ohne externe Suche uebertragen."
          : mode === "all"
            ? "Der vollständige Lauf fragt alle Arten erneut bei den externen Diensten ab."
            : "Der gezielte Lauf verarbeitet neue oder unvollständige Arten und übernimmt übrige Bestandsdaten.",
      ],
    };
  }

  function appendPipelineLog(text) {
    const tokenValues = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN].filter(Boolean);
    let sanitized = String(text ?? "");
    for (const token of tokenValues) sanitized = sanitized.split(token).join("[TOKEN]");
    const lines = sanitized.split(/\r?\n/).filter((line) => line.length > 0);
    runtime.state.log.push(...lines);
    if (runtime.state.log.length > pipelineLogLineLimit) {
      runtime.state.log.splice(0, runtime.state.log.length - pipelineLogLineLimit);
    }
  }

  function assetOnlyNoChangeMessage(mode) {
    const logText = runtime.state.log.join("\n");
    if (/Sounddatei .*gesperrt|noch geöffnet oder gesperrt|Datei gesperrt/i.test(logText)) {
      return "Sounddatei war noch geöffnet oder gesperrt; gefundene Alternative konnte nicht gespeichert werden. Bitte Wiedergabe/Fenster schließen und Suchlauf erneut starten.";
    }
    if (/Abgelehnte Soundquelle wird übersprungen/i.test(logText)) {
      return "Bereits abgelehnte Soundquellen wurden übersprungen; keine weitere geeignete Soundalternative gefunden.";
    }
    if (mode === "nc-sounds") {
      return "Keine neue geeignete Soundalternative gefunden; bestehende Sounds bleiben unverändert.";
    }
    if (mode === "manual-maps") {
      return "Keine neue automatisch abrufbare Karte gefunden; bestehende Karten bleiben unverändert.";
    }
    return "Keine neue automatische Alternative gefunden; bestehende Assets bleiben unverändert.";
  }

  function isWindowsFileLockError(error) {
    const code = String(error?.code ?? "").toUpperCase();
    const message = String(error?.message ?? "").toLowerCase();
    return (
      ["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(code)
      || message.includes("operation not permitted")
      || message.includes("permission denied")
      || message.includes("access is denied")
      || message.includes("zugriff verweigert")
    );
  }

  async function synchronizeStoredManualMapDocumentation(registry) {
    const source = await readFile(manualMapOverridesPath, "utf8");
    const next = synchronizeManualMapDocumentation(source, registry);
    if (next === source) return;
    const tempPath = `${manualMapOverridesPath}.tmp-${randomUUID()}`;
    await writeFile(tempPath, next, "utf8");
    await rename(tempPath, manualMapOverridesPath);
  }

  function assetCompositeHash(assetDir, type) {
    const names = type === "sound" ? ["sound.mp3", "credits.json"] : ["map.jpg"];
    const hash = createHash("sha256");
    let found = false;
    for (const name of names) {
      const filePath = join(assetDir, name);
      if (!existsSync(filePath)) continue;
      found = true;
      hash.update(name);
      try {
        hash.update(readFileSync(filePath));
      } catch (error) {
        if (!isWindowsFileLockError(error)) throw error;
        let fallback = "locked";
        try {
          const details = statSync(filePath);
          fallback = `locked:${details.size}:${details.mtimeMs}`;
        } catch {}
        hash.update(fallback);
        appendPipelineLog(
          `Warnung: Assetdatei konnte wegen Windows-Sperre nicht vollständig gelesen werden und wurde per Metadaten bewertet: ${filePath}`,
        );
      }
    }
    return found ? hash.digest("hex") : "";
  }

  function wasAssetSavedInCurrentPipelineLog(safeName, type) {
    const fileName = type === "map" ? "map.jpg" : "sound.mp3";
    const expectedPath = `species-assets/${safeName}/${fileName}`.toLocaleLowerCase("de");
    const savedMarker = type === "map" ? "karte gespeichert" : "sound gespeichert";
    return runtime.state.log.some((line) => {
      const normalizedLine = String(line ?? "")
        .replaceAll("\\", "/")
        .toLocaleLowerCase("de");
      return normalizedLine.includes(savedMarker) && normalizedLine.includes(expectedPath);
    });
  }

  function readAssetCredits(assetDir) {
    const creditsPath = join(assetDir, "credits.json");
    if (!existsSync(creditsPath)) return {};
    try {
      return JSON.parse(readFileSync(creditsPath, "utf8"));
    } catch {
      return {};
    }
  }

  function soundRejectionKeyFromCredits(credits) {
    const explicit = String(credits?.rejectionKey ?? "").trim();
    if (explicit) return explicit;
    const source = String(credits?.source ?? "").toLocaleLowerCase("de");
    const url = String(credits?.url ?? "").trim();
    const notes = String(credits?.notes ?? "").trim();
    const xenoMatch = url.match(/xeno-canto\.org\/(\d+)/i) || notes.match(/xeno-canto\.org\/(\d+)/i);
    if (source.includes("xeno") && xenoMatch) return `xeno-canto:${xenoMatch[1]}`;
    if (source.includes("wikimedia")) return `wikimedia-commons:${url || notes}`;
    if (source.includes("inaturalist")) {
      const observation = notes.match(/Observation=([^|\s]+)/i)?.[1] ?? "";
      const sound = notes.match(/sound=([^|\s]+)/i)?.[1] ?? "";
      if (observation || sound) return `inaturalist:${observation}:${sound || url}`;
    }
    return `${source || "unknown"}:${url || notes || "unknown"}`;
  }

  function rejectedSoundSourceFromCredits(asset) {
    const creditsPath = join(repoRoot, "species-assets", asset.safeName, "credits.json");
    let credits = {};
    if (existsSync(creditsPath)) {
      try {
        credits = JSON.parse(readFileSync(creditsPath, "utf8"));
      } catch {
        credits = {};
      }
    }
    return {
      key: soundRejectionKeyFromCredits(credits),
      source: String(credits.source ?? "").trim() || "Unbekannt",
      url: String(credits.url ?? "").trim() || "",
      recordist: String(credits.recordist ?? "").trim() || "",
      license: String(credits.license ?? "").trim() || "",
      rejectedAt: new Date().toISOString(),
    };
  }

  function addRejectedSoundSource(soundOverride, rejectedSource) {
    const next = soundOverride && typeof soundOverride === "object"
      ? structuredClone(soundOverride)
      : {};
    const existing = Array.isArray(next.rejectedSources) ? next.rejectedSources : [];
    const byKey = new Map(existing
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [String(entry.key ?? ""), entry]));
    byKey.set(rejectedSource.key, rejectedSource);
    next.rejectedSources = [...byKey.values()].filter((entry) => String(entry.key ?? "").trim());
    return next;
  }

  function capturePipelineAssets(plan) {
    const snapshot = new Map();
    const keepBackups = !["cleanup", "transfer"].includes(plan.mode);
    const runBackupRoot = join(pipelineAssetBackupRoot, runtime.state.runId);
    const registry = existsSync(assetOverridesPath)
      ? JSON.parse(readFileSync(assetOverridesPath, "utf8"))
      : { version: 1, assets: {} };
    if (keepBackups) mkdirSync(runBackupRoot, { recursive: true });
    for (const target of plan.targets ?? []) {
      const assetDir = join(repoRoot, "species-assets", target.safeName);
      for (const [type, fileName] of [["map", "map.jpg"], ["sound", "sound.mp3"]]) {
        const filePath = join(assetDir, fileName);
        const backupFiles = {};
        const previousCredits = type === "sound" ? readAssetCredits(assetDir) : {};
        const relevantBackup = keepBackups && ["map", "sound"].includes(type);
        if (keepBackups && relevantBackup && existsSync(filePath)) {
          const names = type === "sound"
            ? ["sound.mp3", "credits.json", "spectrogram.webp"]
            : ["map.jpg"];
          const targetBackupDir = join(runBackupRoot, target.safeName);
          mkdirSync(targetBackupDir, { recursive: true });
          for (const name of names) {
            const source = join(assetDir, name);
            if (!existsSync(source)) continue;
            const backup = join(targetBackupDir, name);
            try {
              copyFileSync(source, backup);
              backupFiles[name] = backup;
            } catch (error) {
              if (!isWindowsFileLockError(error)) throw error;
              appendPipelineLog(
                `Warnung: Assetdatei konnte wegen Windows-Sperre nicht für die Rücksicherung kopiert werden: ${source}`,
              );
            }
          }
        }
        snapshot.set(`${target.safeName}:${type}`, {
          exists: existsSync(filePath),
          hash: assetCompositeHash(assetDir, type),
          backupFiles,
          previousIsNc: type === "sound" ? isNonCommercialLicense(previousCredits.license) : false,
          previousSourceLabel: type === "sound"
            ? (isNonCommercialLicense(previousCredits.license) ? "NC" : "frei")
            : "",
          previousLicense: type === "sound"
            ? String(previousCredits.license ?? "").trim()
            : "",
          previousManual: registry.assets?.[target.safeName]?.[type]?.manual === true,
          override: structuredClone(registry.assets?.[target.safeName]?.[type] ?? null),
          spectrogramOverride: type === "sound"
            ? structuredClone(registry.assets?.[target.safeName]?.spectrogram ?? null)
            : null,
        });
      }
    }
    return snapshot;
  }

  function detectNewPipelineAssets(plan) {
    const additions = [];
    const backupFileUrl = (safeName, fileName) =>
      `/api/pipeline/assets/backup-file?runId=${encodeURIComponent(runtime.state.runId)}`
      + `&safeName=${encodeURIComponent(safeName)}&file=${encodeURIComponent(fileName)}`;
    for (const target of plan.targets ?? []) {
      const assetDir = join(repoRoot, "species-assets", target.safeName);
      for (const [type, fileName, label] of [
        ["map", "map.jpg", "Karte"],
        ["sound", "sound.mp3", "Sound"],
      ]) {
        const key = `${target.safeName}:${type}`;
        const before = runtime.assetSnapshot.get(key) ?? { exists: false, hash: "", backupFiles: {} };
        const currentPath = join(assetDir, fileName);
        const exists = existsSync(currentPath);
        const currentHash = exists ? assetCompositeHash(assetDir, type) : "";
        const reviewVersion = `${runtime.state.runId}-${currentHash.slice(0, 16)}`;
        const changed = exists && before.exists && before.hash !== currentHash;
        const refreshedByPipeline = exists
          && before.exists
          && !changed
          && plan.mode === "manual-maps"
          && type === "map"
          && wasAssetSavedInCurrentPipelineLog(target.safeName, type);
        if ((!before.exists && exists) || changed || refreshedByPipeline) {
          const credits = type === "sound" ? readAssetCredits(assetDir) : {};
          const isNc = type === "sound" ? isNonCommercialLicense(credits.license) : false;
          additions.push({
            safeName: target.safeName,
            germanName: target.germanName,
            scientificName: target.scientificName,
            type,
            label,
            file: `species-assets/${target.safeName}/${fileName}`,
            url: `/assets/${encodeURIComponent(target.safeName)}/${fileName}?review=${encodeURIComponent(reviewVersion)}`,
            spectrogramUrl: type === "sound" && existsSync(join(assetDir, "spectrogram.webp"))
              ? `/assets/${encodeURIComponent(target.safeName)}/spectrogram.webp?review=${encodeURIComponent(reviewVersion)}`
              : "",
            changed,
            refreshed: refreshedByPipeline,
            previouslyExisting: before.exists,
            previousIsNc: type === "sound" ? Boolean(before.previousIsNc) : false,
            previousSourceLabel: type === "sound"
              ? String(before.previousSourceLabel ?? "").trim()
              : "",
            previousLicense: type === "sound"
              ? String(before.previousLicense ?? "").trim()
              : "",
            previousManual: Boolean(before.previousManual),
            reviewMode: plan.mode,
            isNc,
            sourceLabel: type === "sound"
              ? (isNc ? "NC" : "frei")
              : "",
            license: type === "sound"
              ? String(credits.license ?? "").trim()
              : "",
            source: type === "sound"
              ? String(credits.source ?? "").trim()
              : "",
            backupFiles: before.backupFiles,
            previousUrl: type === "map" && existsSync(before.backupFiles?.["map.jpg"] || "")
              ? backupFileUrl(target.safeName, "map.jpg")
              : type === "sound" && existsSync(before.backupFiles?.["sound.mp3"] || "")
                ? backupFileUrl(target.safeName, "sound.mp3")
              : "",
            previousSpectrogramUrl: type === "sound" && existsSync(before.backupFiles?.["spectrogram.webp"] || "")
              ? backupFileUrl(target.safeName, "spectrogram.webp")
              : "",
          });
        }
      }
    }
    return additions;
  }

  async function sendPipelineBackupFile(url, request, response) {
    const runId = String(url.searchParams.get("runId") ?? "");
    const safeName = String(url.searchParams.get("safeName") ?? "");
    const fileName = String(url.searchParams.get("file") ?? "");
    const allowedFiles = new Set(["map.jpg", "sound.mp3", "spectrogram.webp"]);
    if (
      !runId
      || runId !== runtime.state.runId
      || runtime.state.status !== "awaiting-review"
      || sanitizeAssetName(safeName) !== safeName
      || !allowedFiles.has(fileName)
    ) {
      sendText(response, 404, "Nicht gefunden");
      return;
    }

    const expectedType = fileName === "map.jpg" ? "map" : "sound";
    const asset = runtime.state.reviewAssets.find((entry) =>
      entry.safeName === safeName && entry.type === expectedType
    );
    const backupPath = asset?.backupFiles?.[fileName] ?? "";
    const resolvedBackupPath = resolve(backupPath);
    const allowedRoot = `${resolve(pipelineAssetBackupRoot, runId, safeName)}${sep}`;
    if (!backupPath || !isPathInside(allowedRoot, resolvedBackupPath)) {
      sendText(response, 404, "Nicht gefunden");
      return;
    }

    await sendFile(request, response, resolvedBackupPath);
  }

  function runPipelineChild(command, args, phase, { stdoutFormatter = null } = {}) {
    runtime.state.phase = phase;
    appendPipelineLog(`--- ${phase} ---`);
    return new Promise((resolveRun) => {
      let stdoutBuffer = "";
      const child = spawn(command, args, {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      });
      runtime.process = child;
      child.stdout.on("data", (chunk) => {
        if (stdoutFormatter) stdoutBuffer += chunk.toString("utf8");
        else appendPipelineLog(chunk);
      });
      child.stderr.on("data", (chunk) => appendPipelineLog(chunk));
      child.on("error", (error) => {
        appendPipelineLog(`Prozessfehler: ${error.message}`);
        runtime.process = null;
        resolveRun(1);
      });
      child.on("close", (code) => {
        if (stdoutFormatter && stdoutBuffer.trim()) {
          try {
            appendPipelineLog(stdoutFormatter(stdoutBuffer));
          } catch {
            appendPipelineLog(stdoutBuffer);
          }
        }
        runtime.process = null;
        resolveRun(Number.isInteger(code) ? code : 1);
      });
    });
  }

  async function publishPipelineChanges() {
    let code = await runPipelineChild("git", ["diff", "--cached", "--quiet"], "Git-Vorprüfung");
    if (code !== 0) {
      runtime.state.error = "Vor dem Pipeline-Lauf waren bereits Dateien vorgemerkt. Automatischer Commit wurde abgebrochen.";
      appendPipelineLog(runtime.state.error);
      return 1;
    }

    code = await runPipelineChild(
      process.execPath,
      [join(repoRoot, "scripts", "project-status.mjs")],
      "Projektstatus synchronisieren",
    );
    if (code !== 0) return code;

    code = await runPipelineChild(
      "git",
      [
        "add",
        "--",
        "species_list.json",
        "speciesData.json",
        "fehlende_elemente_report.json",
        "lastSavedAssessmentId.json",
        "species-assets-overrides.json",
        "docs/manual-map-overrides.md",
        "docs/project-status.md",
        "species-assets",
      ],
      "Git-Dateien vormerken",
    );
    if (code !== 0) return code;

    code = await runPipelineChild("git", ["diff", "--cached", "--quiet"], "Git-Änderungen prüfen");
    if (code === 0) {
      appendPipelineLog("Keine versionierbaren Pipeline-Änderungen vorhanden.");
      runtime.state.gitPublished = true;
      return 0;
    }
    if (code !== 1) return code;

    const publishMode = runtime.state.initialMode || runtime.state.mode;
    const message = publishMode === "cleanup"
      ? "Clean obsolete species data"
      : publishMode === "transfer"
        ? "Transfer pending Explorer changes"
      : publishMode === "manual-maps"
        ? "Refresh automatic distribution maps"
        : publishMode === "nc-sounds"
          ? "Refresh sound assets"
      : publishMode === "all"
        ? "Refresh all species data"
        : "Update incomplete species data";
    code = await runPipelineChild("git", ["commit", "-m", message], "Git-Commit");
    if (code !== 0) return code;
    code = await runPipelineChild("git", ["push"], "Git-Push");
    if (code === 0) runtime.state.gitPublished = true;
    return code;
  }

  async function continueAfterAssetReview() {
    const exitCode = await publishPipelineChanges();
    await finishPipelineRun(exitCode);
  }

  function manualFieldUpdatesForEntry(inputEntry) {
    return {
      "Deutscher Name": inputEntry.german,
      "Wissenschaftlicher Name": `${inputEntry.genus} ${inputEntry.species}`.trim(),
      "Größe": inputEntry.size,
      Gewicht: inputEntry.weight,
      Lebenserwartung: inputEntry.life_expectancy,
      URLSlug: `${inputEntry.genus}${inputEntry.species}`.toLocaleLowerCase("de"),
      Genus: inputEntry.genus,
      Species: inputEntry.species,
    };
  }

  async function transferManualSpeciesEdits(plan) {
    const speciesDataPath = join(repoRoot, "speciesData.json");
    const speciesData = JSON.parse(await readFile(speciesDataPath, "utf8"));
    const dataBySlug = new Map(
      speciesData.map((entry) => [String(entry.URLSlug ?? "").toLocaleLowerCase("de"), entry]),
    );
    let changedSpeciesCount = 0;
    const changedFields = [];
    for (const target of plan.targets ?? []) {
      const dataEntry = dataBySlug.get(String(target.slug ?? "").toLocaleLowerCase("de"));
      if (!dataEntry || !target.entry) continue;
      const updates = manualFieldUpdatesForEntry(target.entry);
      const fieldsForSpecies = [];
      for (const [field, expectedValue] of Object.entries(updates)) {
        const nextValue = expectedValue ?? "";
        if (String(dataEntry[field] ?? "").trim() === String(nextValue).trim()) continue;
        dataEntry[field] = nextValue;
        fieldsForSpecies.push(field);
      }
      if (fieldsForSpecies.length) {
        changedSpeciesCount += 1;
        changedFields.push(`${target.germanName}: ${fieldsForSpecies.join(", ")}`);
      }
    }
    if (!changedSpeciesCount) {
      appendPipelineLog("Keine geaenderten manuellen Eingabefelder mehr gefunden.");
      return 0;
    }
    const tempPath = `${speciesDataPath}.tmp-${randomUUID()}`;
    await writeFile(tempPath, `${JSON.stringify(speciesData, null, 2)}\n`, "utf8");
    await rename(tempPath, speciesDataPath);
    appendPipelineLog(
      `Manuelle Eingabefelder in speciesData.json uebertragen: ${changedSpeciesCount} Art(en).`,
    );
    for (const line of changedFields) appendPipelineLog(`- ${line}`);
    return 0;
  }

  async function removePipelineAssetBackupRun(runId) {
    if (!runId) return;
    const runBackupPath = join(pipelineAssetBackupRoot, runId);
    if (!existsSync(runBackupPath)) return;
    try {
      await rm(runBackupPath, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 250,
      });
    } catch (error) {
      appendPipelineLog(
        `Warnung: Temporärer Pipeline-Backupordner konnte nicht entfernt werden und bleibt zur späteren Bereinigung liegen: ${error.message}`,
      );
    }
  }

  async function finishPipelineRun(exitCode) {
    await unlink(pendingAssetReviewPath).catch(() => {});
    runtime.state.status = exitCode === 0 ? "completed" : "failed";
    runtime.state.exitCode = exitCode;
    runtime.state.completedAt = new Date().toISOString();
    if (exitCode !== 0 && !runtime.state.error) {
      runtime.state.error = `Pipeline wurde mit Code ${exitCode} beendet`;
    }
    if (runtime.state.runId) {
      await removePipelineAssetBackupRun(runtime.state.runId);
    }
    await mkdir(pipelineLogDir, { recursive: true });
    const logName = `pipeline-${compactTimestamp(new Date(runtime.state.startedAt))}-${runtime.state.runId.slice(0, 8)}.log`;
    const logPath = join(pipelineLogDir, logName);
    await writeFile(logPath, `${runtime.state.log.join("\n")}\n`, "utf8");
    runtime.state.logFile = `species-explorer/logs/${logName}`;
    await prunePipelineLogs(pipelineLogDir).catch(() => {});
    await cleanupManagedExplorerTemp({ repoRoot, phase: "maintenance" }).catch(() => {});
    await refreshModel({ force: true });
  }

  async function executePipelineRun(plan) {
    if (runtime.state.mode === "cleanup") {
      const exitCode = await runPipelineChild(
        process.execPath,
        [join(repoRoot, "scripts", "species-cleanup.mjs")],
        "Dauerhafte Bereinigung",
      );
      if (exitCode === 0) await continueAfterAssetReview();
      else await finishPipelineRun(exitCode);
      return;
    }

    if (plan.mode === "transfer") {
      const exitCode = await transferManualSpeciesEdits(plan);
      if (exitCode === 0) await continueAfterAssetReview();
      else await finishPipelineRun(exitCode);
      return;
    }

    const updateArgs = [join(repoRoot, "update.mjs"), `--mode=${plan.mode}`];
    if (Array.isArray(plan.targetSlugs) && plan.targetSlugs.length > 0) {
      updateArgs.push(`--species=${plan.targetSlugs.join(",")}`);
    }

    let exitCode = await runPipelineChild(
      process.execPath,
      updateArgs,
      "Datenpipeline",
    );

    const assetOnlyMode = plan.mode === "manual-maps" || plan.mode === "nc-sounds";
    let reviewAssets = exitCode === 0 ? detectNewPipelineAssets(plan) : [];

    if (
      exitCode === 0
      && (
        plan.mode === "all"
        || plan.mode === "missing"
        || (plan.mode === "nc-sounds" && reviewAssets.some((asset) => asset.type === "sound"))
      )
    ) {
      const spectrogramArgs = [join(repoRoot, "scripts", "generate-spectrograms.mjs")];
      if (plan.mode !== "all") {
        const spectrogramSpecies = plan.mode === "nc-sounds"
          ? reviewAssets.filter((asset) => asset.type === "sound").map((asset) => asset.safeName)
          : plan.targets.map((entry) => entry.safeName);
        spectrogramArgs.push(`--species=${spectrogramSpecies.join(",")}`);
      }
      const localFfmpeg = join(repoRoot, "local-tools", "ffmpeg", "bin", "ffmpeg.exe");
      if (existsSync(localFfmpeg)) spectrogramArgs.push(`--ffmpeg=${localFfmpeg}`);
      exitCode = await runPipelineChild(
        process.execPath,
        spectrogramArgs,
        "Spektrogramm-Abgleich",
        { stdoutFormatter: formatSpectrogramPipelineLog },
      );
    }

    if (exitCode === 0 && !assetOnlyMode) {
      exitCode = await runPipelineChild(
        process.execPath,
        [join(repoRoot, "update.mjs"), "--report-only"],
        "Report-Abgleich",
      );
    }

    if (exitCode !== 0) {
      await finishPipelineRun(exitCode);
      return;
    }

    reviewAssets = detectNewPipelineAssets(plan);
    if (reviewAssets.length > 0) {
      runtime.state.status = "awaiting-review";
      runtime.state.phase = "Neue Assets prüfen";
      runtime.state.reviewAssets = reviewAssets;
      appendPipelineLog(`${reviewAssets.length} neue Karte(n)/Sound(s) warten auf Pflegeentscheidung.`);
      await writeFile(pendingAssetReviewPath, `${JSON.stringify(runtime.state, null, 2)}\n`, "utf8");
      await refreshModel({ force: true });
      return;
    }

    if (assetOnlyMode) {
      appendPipelineLog(assetOnlyNoChangeMessage(plan.mode));
      if (runtime.state.publishAfterAssetOnlyNoAssets) {
        runtime.state.publishAfterAssetOnlyNoAssets = false;
        await continueAfterAssetReview();
        return;
      }
      runtime.state.gitPublished = true;
      await finishPipelineRun(0);
      return;
    }

    await continueAfterAssetReview();
  }

  async function startPipeline(payload) {
    cleanupPreviewTokens();
    if (runtime.state.status === "running" || runtime.state.status === "awaiting-review" || runtime.process) {
      const error = new Error("Es läuft bereits eine Pipeline");
      error.statusCode = 409;
      throw error;
    }
    if (isBackupActive()) {
      const error = new Error("Während eines laufenden NAS-Backups kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    if (isAssetWriteActive()) {
      const error = new Error("Während eines laufenden Schreibvorgangs kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "pipeline") {
      const error = new Error("Pipeline-Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const tokensMissing =
      (preview.mode === "manual-maps" && !process.env.IUCN_TOKEN)
      || (preview.mode === "nc-sounds" && !process.env.XENO_TOKEN)
      || (
        !["cleanup", "manual-maps", "nc-sounds", "transfer"].includes(preview.mode)
        && (!process.env.IUCN_TOKEN || !process.env.XENO_TOKEN)
      );
    if (tokensMissing) {
      const error = new Error("IUCN_TOKEN oder XENO_TOKEN fehlt in der Server-Umgebung");
      error.statusCode = 409;
      throw error;
    }

    const { plan, sourceRevision } = await readPipelinePlan(preview.mode, preview.targetSlugs ?? []);
    if (sourceRevision !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Artenliste oder Pipeline-Daten wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (preview.mode !== "all" && !plan.hasWork) {
      previewTokens.delete(token);
      const error = new Error(
        ({
          cleanup: "Es wurden keine verwaisten Daten oder Assetordner gefunden",
          transfer: "Es gibt keine geaenderten manuellen Eingabefelder oder lokalen Asset-Aenderungen",
          missing: "Es gibt keine neuen, fehlenden oder zu entfernenden Arten",
          "manual-maps": "Es gibt keine manuell gepflegten oder fehlenden Karten",
          "nc-sounds": "Es gibt keine ungeschützten NC-Sounds oder fehlenden Sounds",
        })[preview.mode] || "Für diesen Lauf wurden keine Zielarten gefunden",
      );
      error.statusCode = 400;
      throw error;
    }

    previewTokens.delete(token);
    runtime.state = {
      status: "running",
      phase: "Start",
      mode: preview.mode,
      initialMode: preview.mode,
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      completedAt: "",
      exitCode: null,
      targetCount: preview.mode === "cleanup"
        ? publicCleanupPlan(plan).targetCount
        : plan.targetCount,
      targets: preview.mode === "cleanup"
        ? plan.obsoleteAssetDirectories.map((entry) => ({
          safeName: entry.safeName,
          germanName: entry.safeName,
          scientificName: "",
          reasons: ["verwaister Assetordner wird dauerhaft gelöscht"],
        }))
        : publicPipelinePlan(plan).targets,
      removed: preview.mode === "cleanup" ? plan.obsoleteData : plan.removed,
      pendingFiles: preview.mode === "transfer" ? (plan.pendingFiles ?? []) : [],
      log: [],
      logFile: "",
      error: "",
      reviewAssets: [],
      gitPublished: false,
      publishAfterAssetOnlyNoAssets: false,
    };
    if (preview.mode === "nc-sounds") {
      closeActiveFileStreams((filePath) => extname(filePath).toLowerCase() === ".mp3");
      appendPipelineLog("Offene MP3-Streams im Explorer wurden vor dem Sound-Suchlauf geschlossen.");
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
    runtime.assetSnapshot = ["cleanup", "transfer"].includes(preview.mode) ? new Map() : capturePipelineAssets(plan);
    void executePipelineRun(plan).catch(async (error) => {
      appendPipelineLog(`Unerwarteter Pipelinefehler: ${error.message}`);
      runtime.state.error = error.message;
      await finishPipelineRun(1);
    });
    return runtime.state;
  }

  async function savePipelineAssetReview(payload) {
    if (runtime.state.status !== "awaiting-review") {
      const error = new Error("Es warten keine neuen Assets auf eine Pflegeentscheidung");
      error.statusCode = 409;
      throw error;
    }
    if (String(payload?.runId ?? "") !== runtime.state.runId) {
      const error = new Error("Assetprüfung gehört nicht zum aktuellen Pipeline-Lauf");
      error.statusCode = 409;
      throw error;
    }

    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const choicesByKey = new Map(
      choices.map((choice) => {
        const decision = String(
          choice.decision ?? (choice.manual === true ? "manual" : choice.manual === false ? "automatic" : ""),
        );
        return [`${choice.safeName}:${choice.type}`, { ...choice, decision }];
      }),
    );
    for (const asset of runtime.state.reviewAssets) {
      const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
      if (!choice || !["automatic", "manual", "reject"].includes(choice.decision)) {
        const error = new Error(`Pflegeentscheidung fehlt für ${asset.germanName} · ${asset.label}`);
        error.statusCode = 400;
        throw error;
      }
      if (choice.decision === "reject" && !["map", "sound"].includes(asset.type)) {
        const error = new Error(`Ablehnen ist für diesen Assettyp nicht möglich: ${asset.germanName}`);
        error.statusCode = 400;
        throw error;
      }
    }

    const registry = await readJson(assetOverridesPath).catch(() => ({ version: 1, assets: {} }));
    registry.version = 1;
    registry.assets ??= {};
    const updatedAt = new Date().toISOString();
    const retryMode = runtime.state.mode === "manual-maps" || runtime.state.mode === "nc-sounds";
    let registryChanged = false;
    let acceptedAny = false;
    let reportNeedsRefresh = false;
    const rejectedSoundAssets = [];
    const restoreOrRemovePipelineAsset = async (asset) => {
      const previous = runtime.assetSnapshot.get(`${asset.safeName}:${asset.type}`);
      const names = asset.type === "sound"
        ? ["sound.mp3", "credits.json", "spectrogram.webp"]
        : ["map.jpg"];
      for (const fileName of names) {
        const backupPath = asset.backupFiles?.[fileName];
        const allowedBackupRoot = `${resolve(pipelineAssetBackupRoot, runtime.state.runId)}${sep}`;
        const resolvedBackupPath = backupPath ? resolve(backupPath) : "";
        const allowedAssetRoot = `${resolve(repoRoot, "species-assets", asset.safeName)}${sep}`;
        const targetPath = resolve(repoRoot, "species-assets", asset.safeName, fileName);
        if (
          (backupPath && !isPathInside(allowedBackupRoot, resolvedBackupPath))
          || !isPathInside(allowedAssetRoot, targetPath)
        ) {
          throw new Error(`Unsicherer Wiederherstellungspfad für ${asset.germanName}`);
        }
        if (backupPath && existsSync(resolvedBackupPath)) copyFileSync(resolvedBackupPath, targetPath);
        else if (!previous?.exists && existsSync(targetPath)) await unlink(targetPath);
      }
      return previous;
    };
    for (const asset of runtime.state.reviewAssets) {
      const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
      const rejectAsset = choice.decision === "reject";
      const rejectSound = rejectAsset && asset.type === "sound";
      if ((retryMode && choice.decision === "manual") || rejectAsset) {
        const rejectedSource = rejectSound ? rejectedSoundSourceFromCredits(asset) : null;
        const previous = await restoreOrRemovePipelineAsset(asset);
        registry.assets[asset.safeName] ??= {};
        if (previous?.override) registry.assets[asset.safeName][asset.type] = previous.override;
        else delete registry.assets[asset.safeName][asset.type];
        if (asset.type === "sound") {
          if (previous?.spectrogramOverride) {
            registry.assets[asset.safeName].spectrogram = previous.spectrogramOverride;
          } else {
            delete registry.assets[asset.safeName].spectrogram;
          }
          if (rejectSound) {
            rejectedSoundAssets.push(asset);
            const restoredOverride = registry.assets[asset.safeName].sound ?? {
              manual: previous?.override?.manual === true,
              reason: previous?.override?.reason
                || "Automatische Soundquelle wurde manuell abgelehnt; Quelle wird kuenftig uebersprungen.",
            };
            registry.assets[asset.safeName].sound = {
              ...addRejectedSoundSource(restoredOverride, rejectedSource),
              updatedAt,
            };
            appendPipelineLog(`Soundquelle abgelehnt und gesperrt: ${asset.germanName} (${rejectedSource.key})`);
            reportNeedsRefresh = true;
          }
        } else if (rejectAsset && asset.type === "map") {
          appendPipelineLog(`Karte abgelehnt und entfernt: ${asset.germanName}`);
          reportNeedsRefresh = true;
        }
        if (Object.keys(registry.assets[asset.safeName]).length === 0) {
          delete registry.assets[asset.safeName];
        }
        registryChanged = true;
        continue;
      }

      acceptedAny = true;
      registry.assets[asset.safeName] ??= {};
      const previousAssetOverride = registry.assets[asset.safeName][asset.type];
      const preservedSoundRejections =
        asset.type === "sound" && Array.isArray(previousAssetOverride?.rejectedSources)
          ? previousAssetOverride.rejectedSources
          : [];
      registry.assets[asset.safeName][asset.type] = {
        ...(preservedSoundRejections.length ? { rejectedSources: preservedSoundRejections } : {}),
        manual: choice.decision === "manual",
        reason: choice.decision === "manual"
          ? "Nach Pipeline-Import von Felix als manuell gepflegt markiert."
          : "Automatisch durch die Pipeline gepflegt.",
        updatedAt,
      };
      registryChanged = true;
    }

    if (registryChanged) {
      const tempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
        await rename(tempPath, assetOverridesPath);
      } catch (error) {
        await unlink(tempPath).catch(() => {});
        throw error;
      }
    }

    if (runtime.state.mode === "manual-maps") {
      await synchronizeStoredManualMapDocumentation(registry);
    }

    if (runtime.state.mode === "manual-maps" && acceptedAny) {
      const assessmentIds = await readJson(assessmentIdsPath).catch(() => ({}));
      for (const asset of runtime.state.reviewAssets) {
        const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
        if (choice.decision === "manual" || choice.decision === "reject") continue;
        const species = getModel().species.find((entry) => entry.safeName === asset.safeName);
        if (species?.iucn?.assessmentId && species.iucn.assessmentId !== "Unbekannt") {
          assessmentIds[asset.safeName] = species.iucn.assessmentId;
        }
      }
      const tempPath = `${assessmentIdsPath}.tmp-${randomUUID()}`;
      await writeFile(tempPath, `${JSON.stringify(assessmentIds, null, 2)}\n`, "utf8");
      await rename(tempPath, assessmentIdsPath);
    }

    runtime.state.reviewAssets = [];
    runtime.state.status = "running";
    runtime.state.phase = "Git-Veröffentlichung";
    await unlink(pendingAssetReviewPath).catch(() => {});
    await refreshModel({ force: true });
    const continueReview = async () => {
      if (runtime.state.mode === "nc-sounds" || reportNeedsRefresh) {
        const reportExitCode = await runPipelineChild(
          process.execPath,
          [join(repoRoot, "update.mjs"), "--report-only"],
          "Report-Abgleich",
        );
        if (reportExitCode !== 0) {
          await finishPipelineRun(reportExitCode);
          return;
        }
      }
      if (rejectedSoundAssets.length) {
        const retrySafeNames = new Set(rejectedSoundAssets.map((asset) => asset.safeName));
        const retryTargetSlugs = runtime.state.targets
          .filter((target) => retrySafeNames.has(target.safeName))
          .map((target) => target.slug)
          .filter(Boolean);
        for (const asset of rejectedSoundAssets) {
          if (retryTargetSlugs.length) continue;
          const species = getModel().species.find((entry) => entry.safeName === asset.safeName);
          if (species?.id) retryTargetSlugs.push(species.id);
        }
        const { plan: retryPlan } = await readPipelinePlan(
          "nc-sounds",
          [...new Set(retryTargetSlugs)],
        );
        if (!retryPlan.hasWork) {
          appendPipelineLog("Keine weitere Soundquelle mehr gefunden; bisherige Änderungen werden veröffentlicht.");
          await continueAfterAssetReview();
          return;
        }
        runtime.state.mode = "nc-sounds";
        runtime.state.phase = "Weitere Soundquelle suchen";
        runtime.state.targetCount = retryPlan.targetCount;
        runtime.state.targets = publicPipelinePlan(retryPlan).targets;
        runtime.state.removed = retryPlan.removed;
        runtime.state.publishAfterAssetOnlyNoAssets = true;
        runtime.assetSnapshot = capturePipelineAssets(retryPlan);
        appendPipelineLog("Abgelehnter Sound wurde gesperrt. Suche automatisch nach der nächsten Soundquelle.");
        await executePipelineRun(retryPlan);
        return;
      }
      if (!acceptedAny && retryMode && !registryChanged) {
        runtime.state.gitPublished = true;
        await finishPipelineRun(0);
        return;
      }
      await continueAfterAssetReview();
    };
    void continueReview().catch(async (error) => {
      appendPipelineLog(`Git-Veröffentlichung fehlgeschlagen: ${error.message}`);
      runtime.state.error = error.message;
      await finishPipelineRun(1);
    });
    return runtime.state;
  }


  return {
    readPipelinePlan,
    pendingChangesPayload,
    previewPipeline,
    startPipeline,
    savePipelineAssetReview,
    sendPipelineBackupFile,
    rejectedSoundSourceFromCredits,
    addRejectedSoundSource,
  };
}
