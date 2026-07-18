import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Explorer-Oberflaeche zeigt Medien kompakt und kennzeichnet Datenquellen", async () => {
  const [
    appSource,
    appFoundationSource,
    appPresentationSource,
    appMeasurementsSource,
    appEditorFilesSource,
    appDialogsSource,
    appConfirmationSource,
    appFormFeedbackSource,
    appNewSpeciesFormSource,
    appNewSpeciesWorkflowSource,
    appEditorFormSource,
    appEditorGeneralSource,
    appEditorMapSource,
    appEditorSoundSource,
    appEditorPortraitSource,
    appSpeciesEditorSource,
    appSettingsSource,
    appMediaSource,
    appDetailMediaSource,
    appDetailViewSource,
    appSelectionSource,
    appAssetReviewSource,
    appAssetReviewWorkflowSource,
    appPipelineSource,
    appBackupWorkflowSource,
    appPipelineWorkflowSource,
    appDashboardSource,
    appLifecycleSource,
    appSpeciesActionsSource,
    appAssetMaintenanceSource,
    cssSource,
    htmlSource,
    serverSource,
    pipelineControllerSource,
    projectPublicationSource,
    backupServiceSource,
    speciesCreateSource,
    speciesDeleteSource,
    mapAssetWorkflowSource,
    soundAssetWorkflowSource,
    portraitAssetWorkflowSource,
    assetMaintenanceSource,
    updateSource,
    iucnDataAdapterSource,
    iucnMapAdapterSource,
    xenoAdapterSource,
    commonsAdapterSource,
    inaturalistAdapterSource,
    desktopLauncherSource,
    shortcutInstallerSource,
    desktopMainSource,
    serverLifecycleSource,
    restoreStartSource,
    nasBackupSource,
    cleanupSource,
    packageSource,
    gitignoreSource,
    assetOverrides,
    assetBackupsSource,
    speciesModelSource,
    httpRoutingSource,
    requestRouterSource,
    explorerModelSource,
    assetFilesSource,
    manualMapDocumentationSource,
    pipelineLogSource,
    mediaAssetsSource,
  ] = await Promise.all([
    readFile(new URL("./public/app.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-foundation.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-presentation.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-measurements.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-editor-files.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-dialogs.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-confirmation.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-form-feedback.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-new-species-form.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-new-species-workflow.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-editor-form.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-editor-general.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-editor-map.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-editor-sound.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-editor-portrait.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-species-editor.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-settings.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-media.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-detail-media.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-detail-view.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-selection.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-asset-review.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-asset-review-workflow.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-pipeline.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-backup-workflow.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-pipeline-workflow.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-dashboard.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-lifecycle.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-species-actions.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app-asset-maintenance.js", import.meta.url), "utf8"),
    readFile(new URL("./public/app.css", import.meta.url), "utf8"),
    readFile(new URL("./public/index.html", import.meta.url), "utf8"),
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("./pipeline-controller.mjs", import.meta.url), "utf8"),
    readFile(new URL("./project-publication.mjs", import.meta.url), "utf8"),
    readFile(new URL("./backup-service.mjs", import.meta.url), "utf8"),
    readFile(new URL("./species-create.mjs", import.meta.url), "utf8"),
    readFile(new URL("./species-delete.mjs", import.meta.url), "utf8"),
    readFile(new URL("./map-asset-workflow.mjs", import.meta.url), "utf8"),
    readFile(new URL("./sound-asset-workflow.mjs", import.meta.url), "utf8"),
    readFile(new URL("./portrait-asset-workflow.mjs", import.meta.url), "utf8"),
    readFile(new URL("./asset-maintenance.mjs", import.meta.url), "utf8"),
    readFile(new URL("../update.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/iucn-data-adapter.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/iucn-map-adapter.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/xeno-canto-adapter.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/wikimedia-commons-audio-adapter.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/inaturalist-audio-adapter.mjs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/start-explorer.vbs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/install-shortcut.ps1", import.meta.url), "utf8"),
    readFile(new URL("./desktop/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("./desktop/server-lifecycle.mjs", import.meta.url), "utf8"),
    readFile(new URL("../restore-start.cmd", import.meta.url), "utf8"),
    readFile(new URL("../scripts/nas-backup.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/species-cleanup.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../species-assets-overrides.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./asset-backups.mjs", import.meta.url), "utf8"),
    readFile(new URL("./species-model.mjs", import.meta.url), "utf8"),
    readFile(new URL("./http-routing.mjs", import.meta.url), "utf8"),
    readFile(new URL("./request-router.mjs", import.meta.url), "utf8"),
    readFile(new URL("./explorer-model.mjs", import.meta.url), "utf8"),
    readFile(new URL("./asset-files.mjs", import.meta.url), "utf8"),
    readFile(new URL("./manual-map-documentation.mjs", import.meta.url), "utf8"),
    readFile(new URL("./pipeline-log.mjs", import.meta.url), "utf8"),
    readFile(new URL("./media-assets.mjs", import.meta.url), "utf8"),
  ]);

  const assetWorkflowSource = [
    mapAssetWorkflowSource,
    soundAssetWorkflowSource,
    portraitAssetWorkflowSource,
    assetMaintenanceSource,
  ].join("\n");

  const modularAppSource = [
    appSource,
    appNewSpeciesWorkflowSource,
    appEditorGeneralSource,
    appEditorMapSource,
    appEditorSoundSource,
    appEditorPortraitSource,
    appSpeciesEditorSource,
    appDetailViewSource,
    appBackupWorkflowSource,
    appPipelineWorkflowSource,
    appAssetReviewWorkflowSource,
    appDashboardSource,
  ].join("\n");

  assert.match(appMediaSource, /class="map-image"/);
  assert.match(
    htmlSource,
    /<script src="\/app-foundation\.js" defer><\/script>[\s\S]*<script src="\/app-presentation\.js" defer><\/script>[\s\S]*<script src="\/app-measurements\.js" defer><\/script>[\s\S]*<script src="\/app-editor-files\.js" defer><\/script>[\s\S]*<script src="\/app-dialogs\.js" defer><\/script>[\s\S]*<script src="\/app-confirmation\.js" defer><\/script>[\s\S]*<script src="\/app-form-feedback\.js" defer><\/script>[\s\S]*<script src="\/app-new-species-form\.js" defer><\/script>[\s\S]*<script src="\/app-editor-form\.js" defer><\/script>[\s\S]*<script src="\/app-settings\.js" defer><\/script>[\s\S]*<script src="\/app-media\.js" defer><\/script>[\s\S]*<script src="\/app-detail-media\.js" defer><\/script>[\s\S]*<script src="\/app-selection\.js" defer><\/script>[\s\S]*<script src="\/app-asset-review\.js" defer><\/script>[\s\S]*<script src="\/app-asset-review-workflow\.js" defer><\/script>[\s\S]*<script src="\/app-pipeline\.js" defer><\/script>[\s\S]*<script src="\/filter\.js" defer><\/script>[\s\S]*<script src="\/app-dashboard\.js" defer><\/script>[\s\S]*<script src="\/app\.js" defer><\/script>/,
  );
  assert.match(
    htmlSource,
    /<script src="\/app-dashboard\.js" defer><\/script>[\s\S]*<script src="\/app-lifecycle\.js" defer><\/script>[\s\S]*<script src="\/app-species-actions\.js" defer><\/script>[\s\S]*<script src="\/app-asset-maintenance\.js" defer><\/script>[\s\S]*<script src="\/app\.js" defer><\/script>/,
  );
  assert.match(appFoundationSource, /function createInitialExplorerState\(\)/);
  assert.match(appFoundationSource, /function createExplorerApiClient\(/);
  assert.match(appPresentationSource, /function formatSexSpecificDataValue\(value\)/);
  assert.match(appPresentationSource, /function versionedAssetUrl\(/);
  assert.match(appMeasurementsSource, /function parseManualMeasurement\(/);
  assert.match(appMeasurementsSource, /function renderManualMeasurementEditor\(/);
  assert.match(appEditorFilesSource, /function iucnDistributionMapUrl\(/);
  assert.match(appEditorFilesSource, /function fileToBase64\(/);
  assert.match(appEditorFilesSource, /function waitForAudioMetadata\(/);
  assert.match(appDialogsSource, /function createDialogController\(/);
  assert.match(appDialogsSource, /function releaseMediaWithin\(/);
  assert.match(appConfirmationSource, /function createQuickConfirm\(/);
  assert.match(appFormFeedbackSource, /function createMessageSetter\(/);
  assert.match(appFormFeedbackSource, /function createFieldFeedbackController\(/);
  assert.match(appNewSpeciesFormSource, /function createNewSpeciesFormModel\(/);
  assert.match(appEditorFormSource, /function createEditorFormModel\(/);
  assert.match(appSettingsSource, /function createBackupSettingsController\(/);
  assert.match(appSettingsSource, /function setupBackupSettings\(/);
  assert.match(appMediaSource, /function createMediaRenderers\(/);
  assert.match(appMediaSource, /function bindAudioPlayer\(/);
  assert.match(appMediaSource, /function bindImageZoom\(/);
  assert.match(appDetailMediaSource, /function createDetailMediaController\(/);
  assert.match(appDetailMediaSource, /async function refreshOpenSoundEditor\(/);
  assert.match(appDetailMediaSource, /function bindExclusiveAudioPlayback\(/);
  assert.match(appSelectionSource, /function createSpeciesSelectionController\(/);
  assert.match(appSelectionSource, /function selectSpecies\(/);
  assert.match(appAssetReviewSource, /function createAssetReviewRenderer\(/);
  assert.match(appAssetReviewSource, /function createAssetReviewMediaController\(/);
  assert.match(appAssetReviewWorkflowSource, /function setupAssetReviewWorkflow\(/);
  assert.match(appPipelineSource, /function createPipelineStatusPresenters\(/);
  assert.match(appPipelineSource, /function createPipelinePreviewRenderer\(/);
  assert.match(appPipelineSource, /function renderProcessLog\(/);
  assert.match(appDashboardSource, /function createValidationPresentation\(/);
  assert.match(appDashboardSource, /function createSpeciesListItemPresentation\(/);
  assert.match(appDashboardSource, /function createDashboardController\(/);
  assert.match(appLifecycleSource, /function createExplorerLifecycleController\(/);
  assert.match(appLifecycleSource, /async function refreshExplorerModelOnly\(/);
  assert.match(appLifecycleSource, /async function monitorProjectRevision\(/);
  assert.match(appSpeciesActionsSource, /function refreshConfirmation\(/);
  assert.match(appSpeciesActionsSource, /function deleteModePresentation\(/);
  assert.match(appSpeciesActionsSource, /function createSpeciesActionsController\(/);
  assert.match(appAssetMaintenanceSource, /function assetMaintenancePresentation\(/);
  assert.match(appAssetMaintenanceSource, /function deletedAssetNotice\(/);
  assert.match(appAssetMaintenanceSource, /function restoredAssetNotice\(/);
  assert.match(appAssetMaintenanceSource, /function createAssetMaintenanceController\(/);
  assert.match(modularAppSource, /explorerFoundation\.createInitialExplorerState\(\)/);
  assert.match(modularAppSource, /window\.SpeciesExplorerPresentation/);
  assert.match(modularAppSource, /window\.SpeciesExplorerMeasurements/);
  assert.match(modularAppSource, /window\.SpeciesExplorerDialogs/);
  assert.match(modularAppSource, /window\.SpeciesExplorerFormFeedback/);
  assert.match(modularAppSource, /window\.SpeciesExplorerNewSpeciesForm/);
  assert.match(modularAppSource, /window\.SpeciesExplorerEditorForm/);
  assert.match(modularAppSource, /window\.SpeciesExplorerSettings/);
  assert.match(modularAppSource, /window\.SpeciesExplorerMedia/);
  assert.match(modularAppSource, /window\.SpeciesExplorerDetailMedia/);
  assert.match(modularAppSource, /window\.SpeciesExplorerSelection/);
  assert.match(modularAppSource, /window\.SpeciesExplorerAssetReview/);
  assert.match(modularAppSource, /window\.SpeciesExplorerAssetReviewWorkflow/);
  assert.match(modularAppSource, /window\.SpeciesExplorerPipeline/);
  assert.match(modularAppSource, /window\.SpeciesExplorerDashboard/);
  assert.match(modularAppSource, /window\.SpeciesExplorerLifecycle/);
  assert.match(modularAppSource, /window\.SpeciesExplorerSpeciesActions/);
  assert.match(modularAppSource, /window\.SpeciesExplorerAssetMaintenance/);
  assert.doesNotMatch(appSource, /async function ensureSessionToken\(\)/);
  assert.match(htmlSource, /class="header-logo"/);
  assert.match(htmlSource, /fn-wildlife-travel-logo-glow\.jpg/);
  assert.doesNotMatch(htmlSource, /IUCN Species Data/);
  assert.match(cssSource, /\.map-image\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(appMediaSource, /map-zoom-trigger/);
  assert.match(modularAppSource, /map-lightbox/);
  assert.match(appMediaSource, /function resetScrollableToTop\(element/);
  assert.match(appSelectionSource, /resetScrollableToTop\(elements\.detailPanel\)/);
  assert.match(appMediaSource, /species-image-placeholder/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns/s);
  assert.match(modularAppSource, /class="explorer-audio"/);
  assert.match(modularAppSource, /class="audio-visual"/);
  assert.match(modularAppSource, /audio-progress-marker/);
  assert.match(appMediaSource, /requestAnimationFrame/);
  assert.match(
    appMediaSource,
    /const seekFromPointer = async \(event\) => \{[\s\S]*audio\.currentTime = progress \* audio\.duration;[\s\S]*await audio\.play\(\)/,
  );
  assert.match(appPresentationSource, /Gefährdet/);
  assert.match(modularAppSource, /IUCN-Daten abgerufen/);
  assert.match(appPresentationSource, /function formatSexSpecificDataValue\(value\)/);
  assert.match(appPresentationSource, /class="sex-specific-value"/);
  assert.match(modularAppSource, /class="iucn-heading-status"/);
  assert.match(modularAppSource, /class="iucn-heading-trend"/);
  assert.match(appPresentationSource, /class="iucn-data-icon/);
  assert.match(appDashboardSource, /const createIndicatorIcon = \(\{ url, title, className \}\) =>/);
  assert.match(appDashboardSource, /species-list-indicator/);
  assert.match(appPresentationSource, /\/graphics\/catagory\/\$\{encodeURIComponent\(code\)\}\.png/);
  assert.match(appPresentationSource, /\/graphics\/trend\/\$\{encodeURIComponent\(fileName\)\}/);
  assert.match(modularAppSource, /class="audio-credits" open/);
  assert.match(modularAppSource, /Keine Karte vorhanden/);
  assert.doesNotMatch(appSource, /Keine bisherige Karte vorhanden/);
  assert.match(modularAppSource, /assetStatusText\(species\.assets\.map\)/);
  assert.match(appDashboardSource, /Portraits fehlen/);
  assert.match(appDashboardSource, /Artporträts: \$\{missingPortraitCount\} von/);
  assert.match(appDashboardSource, /Karte, Sound, Credits, Spektrogramm und Artporträt vorhanden/);
  assert.match(appDashboardSource, /function updateValidation\(validation\)/);
  assert.match(appFoundationSource, /validation: "\/api\/validation"/);
  assert.match(modularAppSource, /class="edit-dialog"/);
  assert.match(modularAppSource, /\/preview/);
  assert.match(modularAppSource, /\/save/);
  assert.match(modularAppSource, /Diff-Vorschau/);
  assert.match(appPresentationSource, /function backupRetentionText\(result\)/);
  assert.match(appPresentationSource, /if \(!retention\) return ""/);
  assert.match(modularAppSource, /function setupNewSpeciesCreator\(\)/);
  assert.match(appDialogsSource, /function setupSafeBackdropClose\(dialog, close\)/);
  assert.match(
    appDialogsSource,
    /startedOnBackdrop = event\.target === dialog;[\s\S]*startedOnBackdrop && event\.target === dialog/,
  );
  assert.doesNotMatch(
    appDialogsSource,
    /dialog\.addEventListener\("click",\s*\(event\)\s*=>\s*\{\s*if \(event\.target === dialog\)/,
  );
  assert.doesNotMatch(appSource, /function setupSafeBackdropClose\(/);
  assert.match(modularAppSource, /\/api\/species\/new\/preview/);
  assert.match(modularAppSource, /\/api\/species\/new\/save/);
  assert.match(modularAppSource, /\/api\/species\/new\/portrait-prompt/);
  assert.match(modularAppSource, /\/api\/species\/new\/portrait-preview/);
  assert.match(htmlSource, /name="sizeUnit"/);
  assert.match(htmlSource, /name="weightUnit"/);
  assert.match(htmlSource, /name="lifeExpectancyUnit"/);
  assert.match(htmlSource, /placeholder="23,5-29"/);
  assert.match(htmlSource, /placeholder="80-110"/);
  assert.match(htmlSource, /placeholder="3"/);
  assert.doesNotMatch(htmlSource, /placeholder="ca\. 23,5-29 cm"/);
  assert.match(appMeasurementsSource, /function formatManualMeasurement\(/);
  assert.match(appMeasurementsSource, /function singularManualAgeUnit\(/);
  assert.match(modularAppSource, /state\.renderPersistentPipelineStatus\?\.\(status\)/);
  assert.doesNotMatch(
    appSource,
    /async function pollInlinePipelineStatus\(\)[\s\S]*?[^.]renderPersistentPipelineStatus\(status\)/,
  );
  assert.match(modularAppSource, /let maxStepReached = 1/);
  assert.match(modularAppSource, /indicator\.addEventListener\("click"/);
  assert.match(
    modularAppSource,
    /beforeClose: \(\) => \{[\s\S]*newSpeciesPipelineActive\) return false;[\s\S]*form\.reset\(\);[\s\S]*resetAll\(\);/,
  );
  assert.match(cssSource, /\.new-species-value-unit/);
  assert.match(cssSource, /\.new-species-steps li\.reachable/);
  assert.match(modularAppSource, /Artportrait wird lokal übernommen/);
  assert.match(modularAppSource, /publish:\s*false/);
  assert.match(modularAppSource, /Artportrait wird für diese neue Art übersprungen/);
  assert.doesNotMatch(
    modularAppSource,
    /portraitSkipButton\.addEventListener\("click", \(\) => \{[\s\S]*?saveAndStartPipeline\(\);[\s\S]*?\}\);/,
  );
  assert.doesNotMatch(appSource, /Artporträt übernehmen und danach Commit und Push ausführen/);
  assert.match(modularAppSource, /function setupPipelineControl\(\)/);
  assert.match(appLifecycleSource, /function setupEditingMode\(\)/);
  assert.match(modularAppSource, /\/api\/pipeline\/preview/);
  assert.match(modularAppSource, /\/api\/pipeline\/start/);
  assert.match(modularAppSource, /\/api\/pipeline\/status/);
  assert.match(modularAppSource, /\/api\/pipeline\/assets\/review/);
  assert.match(modularAppSource, /autoStart/);
  assert.match(modularAppSource, /startCurrentPipelinePreview/);
  assert.match(htmlSource, /Manuelle und fehlende Karten erneut suchen/);
  assert.match(appPipelineSource, /NC- und fehlende Sounds erneut suchen/);
  assert.doesNotMatch(appSource, /Fehlende Artporträts ergänzen/);
  assert.doesNotMatch(appSource, /strikten Ein-Bild-Regel/);
  assert.doesNotMatch(appSource, /mit „Weiter“ folgt jeweils die nächste/);
  assert.doesNotMatch(appSource, /\/api\/portraits\/missing/);
  assert.match(appDashboardSource, /soundCareHint/);
  assert.match(appDashboardSource, /Sound fehlt oder wird manuell gepflegt/);
  assert.match(htmlSource, /id="pipeline-run-notice"/);
  assert.match(htmlSource, /pipeline-dialog-close-button/);
  assert.match(appPipelineSource, /Pipeline-Lauf läuft gerade/);
  assert.match(appPipelineSource, /Pipeline-Lauf abgeschlossen/);
  assert.match(appPipelineSource, /Das Fenster kann geschlossen werden; der Lauf läuft im Hintergrund weiter/);
  assert.match(modularAppSource, /footerCloseButton\.textContent = active \? "Fenster schließen" : "Abbrechen"/);
  assert.match(modularAppSource, /renderPersistentPipelineStatus\(status\)/);
  assert.match(cssSource, /\.pipeline-run-notice\.completed/);
  assert.match(cssSource, /\.pipeline-dialog-status\.running/);
  assert.match(appAssetReviewSource, /Bisherige \$\{asset\.previousManual \? "manuelle" : "automatische"\} Karte behalten/);
  assert.match(appAssetReviewSource, /Gefundenen Sound übernehmen \(\$\{soundKind\}\)/);
  assert.match(appAssetReviewSource, /Sound nicht übernehmen/);
  assert.match(modularAppSource, /status\.status === "completed" && status\.gitPublished\) state\.notice = ""/);
  assert.doesNotMatch(appSource, /function setupAssetReview\(\)/);
  assert.match(appAssetReviewWorkflowSource, /function setupAssetReviewWorkflow\(/);
  assert.match(appAssetReviewSource, /class="asset-review-map-trigger"/);
  assert.match(appAssetReviewSource, /class="asset-review-map-compare"/);
  assert.match(appAssetReviewSource, /Bisherige Karte/);
  assert.match(appAssetReviewSource, /Gefundene Karte/);
  assert.match(appAssetReviewSource, /mapLightboxImage\.onload = \(\) => resetScrollableToTop\(mapLightbox\)/);
  assert.match(appAssetReviewSource, /const stopAudio = \(\) =>/);
  assert.match(
    appAssetReviewWorkflowSource,
    /const reviewController = createDialogController\(\{[\s\S]*afterClose: \(\) => \{[\s\S]*stopAssetReviewAudio\(\);/,
  );
  assert.match(appPipelineSource, /Datenbank aktuell/);
  assert.match(modularAppSource, /Datenbank-Aktionen/);
  assert.match(appLifecycleSource, /Bearbeitungsmodus 🔓/);
  assert.match(appLifecycleSource, /Lesemodus 🔒/);
  assert.match(appLifecycleSource, /function monitorProjectRevision\(/);
  assert.match(appFoundationSource, /revision: "\/api\/revision"/);
  assert.match(appLifecycleSource, /const current = await fetchRevision\(\)/);
  assert.match(appLifecycleSource, /setTimeoutImpl\(\(\) =>/);
  assert.match(appLifecycleSource, /pendingRevisionReload/);
  assert.match(appSelectionSource, /function hasOpenDialog\(\)/);
  assert.match(serverSource, /createExplorerRequestHandler/);
  assert.match(serverSource, /from "\.\/explorer-model\.mjs"/);
  assert.match(pipelineControllerSource, /from "\.\/manual-map-documentation\.mjs"/);
  assert.match(pipelineControllerSource, /from "\.\/pipeline-log\.mjs"/);
  assert.match(serverSource, /from "\.\/media-assets\.mjs"/);
  assert.match(explorerModelSource, /export async function buildExplorerModel/);
  assert.match(explorerModelSource, /SPECIES_ASSET_FILE_NAMES/);
  assert.match(assetFilesSource, /export const SPECIES_ASSET_FILE_NAMES/);
  assert.match(manualMapDocumentationSource, /export function synchronizeManualMapDocumentation/);
  assert.match(pipelineLogSource, /export function formatSpectrogramPipelineLog/);
  assert.match(mediaAssetsSource, /export async function validateMapPreviewPayload/);
  assert.match(mediaAssetsSource, /export function validateSoundPreviewPayload/);
  assert.match(mediaAssetsSource, /export function validatePortraitPreviewPayload/);
  assert.match(requestRouterSource, /"\/api\/revision"/);
  assert.match(serverSource, /async function refreshModel/);
  assert.match(serverSource, /publishAfterAssetOnlyNoAssets/);
  assert.match(pipelineControllerSource, /Weitere Soundquelle suchen/);
  assert.match(pipelineControllerSource, /Abgelehnter Sound wurde gesperrt/);
  assert.match(desktopLauncherSource, /WScript\.Shell/);
  assert.match(desktopLauncherSource, /electron\.cmd/);
  assert.match(desktopLauncherSource, /shell\.Run command,\s*0,\s*False/);
  assert.match(shortcutInstallerSource, /CreateShortcut/);
  assert.match(shortcutInstallerSource, /wscript\.exe/);
  assert.match(restoreStartSource, /Node\.js 18 oder neuer/);
  assert.match(restoreStartSource, /npm\.cmd install/);
  assert.match(restoreStartSource, /species:desktop:shortcut/);
  assert.match(restoreStartSource, /start-explorer\.vbs/);
  assert.match(nasBackupSource, /W:\\Website Datenbank Backup/);
  assert.match(nasBackupSource, /IUCN_Datenbank_\$\{timestamp\}_\$\{gitShort\}\.zip/);
  assert.match(nasBackupSource, /backup-manifest\.json/);
  assert.match(nasBackupSource, /MaxBackups = 10/);
  assert.match(nasBackupSource, /DryRun/);
  assert.match(nasBackupSource, /Progress/);
  assert.match(nasBackupSource, /BACKUP_PROGRESS/);
  assert.match(nasBackupSource, /yyyy-MM-dd_HHmmss/);
  assert.match(nasBackupSource, /species-explorer\/pipeline-asset-backups/);
  assert.match(packageSource, /backup:nas:dry-run/);
  assert.match(gitignoreSource, /species-explorer\/local-settings\.json/);
  assert.match(htmlSource, /data-backup-action="nas"/);
  assert.match(htmlSource, /NAS-Backup erstellen/);
  assert.match(htmlSource, /data-settings-action="backup-path"/);
  assert.match(htmlSource, /id="settings-dialog"/);
  assert.match(htmlSource, /Backup-Pfad einstellen/);
  assert.match(appSettingsSource, /function setupBackupSettings\(/);
  assert.match(appSettingsSource, /\/api\/settings/);
  assert.match(appSettingsSource, /\/api\/settings\/backup/);
  assert.match(modularAppSource, /\/api\/backup\/preview/);
  assert.match(modularAppSource, /\/api\/backup\/start/);
  assert.match(modularAppSource, /\/api\/backup\/status/);
  assert.match(modularAppSource, /Backup trotzdem erstellen/);
  assert.match(appPipelineSource, /function backupStatusPresentation/);
  assert.match(cssSource, /\.database-status\.backup/);
  assert.match(backupServiceSource, /async function previewNasBackup/);
  assert.match(serverSource, /local-settings\.json/);
  assert.match(backupServiceSource, /async function saveBackupSettings/);
  assert.match(requestRouterSource, /"\/api\/settings"/);
  assert.match(requestRouterSource, /"\/api\/settings\/backup"/);
  assert.match(backupServiceSource, /function startNasBackup/);
  assert.match(backupServiceSource, /executeNasBackupRun/);
  assert.match(requestRouterSource, /"\/api\/backup\/status"/);
  assert.match(desktopMainSource, /getExplorerBackupStatus/);
  assert.match(serverLifecycleSource, /isBackupBlockingShutdown/);
  assert.match(packageSource, /species:desktop:shortcut/);
  assert.match(speciesCreateSource, /function createNewSpeciesPortraitPrompt\(payload\)/);
  assert.match(speciesCreateSource, /async function previewNewSpeciesPortrait\(payload\)/);
  assert.match(pipelineControllerSource, /Git-Commit/);
  assert.match(pipelineControllerSource, /\["push"\]/);
  assert.match(requestRouterSource, /\/api\/pipeline\/assets\/review/);
  assert.match(requestRouterSource, /\/api\/pipeline\/assets\/backup-file/);
  assert.match(serverSource, /pipeline-asset-backups/);
  assert.match(pipelineControllerSource, /sendPipelineBackupFile/);
  assert.match(pipelineControllerSource, /"map\.jpg",\s*"sound\.mp3",\s*"spectrogram\.webp"/);
  assert.match(pipelineControllerSource, /soundRejectionKeyFromCredits/);
  assert.match(pipelineControllerSource, /rejectedSoundSourceFromCredits/);
  assert.match(pipelineControllerSource, /Karte abgelehnt und entfernt/);
  assert.match(pipelineControllerSource, /sound\.rejectedSources|rejectedSources/);
  assert.match(pipelineControllerSource, /preservedSoundRejections/);
  assert.match(pipelineControllerSource, /rejectedSources: preservedSoundRejections/);
  assert.match(appDetailMediaSource, /async function refreshOpenSoundEditor/);
  assert.match(modularAppSource, /await notifySilentPipelineContext\(status\)/);
  assert.match(appPresentationSource, /function versionedAssetUrl/);
  assert.match(modularAppSource, /species\.assets\.spectrogram\?\.soundSha256/);
  assert.match(appAssetReviewWorkflowSource, /assetReviewAwaitingRetry/);
  assert.match(appAssetReviewWorkflowSource, /Gefundener Sound wurde abgelehnt und gemerkt\. Nächster Sound wird gesucht/);
  assert.match(appAssetReviewWorkflowSource, /state\.finishAssetReviewWaiting/);
  assert.match(appAssetReviewWorkflowSource, /form\.dataset\.closeOnly === "true"/);
  assert.match(cleanupSource, /cleanup-trash/);
  assert.match(pipelineControllerSource, /assetCompositeHash/);
  assert.match(pipelineControllerSource, /wasAssetSavedInCurrentPipelineLog/);
  assert.match(pipelineControllerSource, /refreshedByPipeline/);
  assert.match(pipelineControllerSource, /reviewMode:\s*plan\.mode/);
  assert.match(pipelineControllerSource, /copyFileSync\(resolvedBackupPath, targetPath\)/);
  assert.match(pipelineControllerSource, /synchronizeStoredManualMapDocumentation/);
  assert.match(explorerModelSource, /typeof mapOverride\?\.manual === "boolean"/);
  assert.match(assetWorkflowSource, /async function previewMapAsset\(id, payload\)/);
  assert.match(assetWorkflowSource, /async function saveMapAsset\(id, payload\)/);
  assert.match(serverSource, /publishAssetChanges = false/);
  assert.match(serverSource, /rebuildReportAfterAssetSave = true/);
  assert.match(projectPublicationSource, /async function readPendingProjectChanges\(\)/);
  assert.match(projectPublicationSource, /const match = line\.match/);
  assert.match(projectPublicationSource, /path: \(match\?\.\[2\]/);
  assert.match(requestRouterSource, /"\/api\/pending-changes"/);
  assert.match(pipelineControllerSource, /Transfer pending Explorer changes/);
  assert.match(pipelineControllerSource, /Projektstatus synchronisieren/);
  assert.match(projectPublicationSource, /synchronizeProjectStatusForPublication/);
  assert.match(pipelineControllerSource, /"docs\/project-status\.md"/);
  assert.match(assetWorkflowSource, /async function publishMapAssetChanges\(species\)/);
  assert.match(assetWorkflowSource, /async function previewSoundAsset\(id, payload\)/);
  assert.match(assetWorkflowSource, /async function saveSoundAsset\(id, payload\)/);
  assert.match(assetWorkflowSource, /async function rejectCurrentSoundAsset\(id\)/);
  assert.match(assetWorkflowSource, /Reject sound source for/);
  assert.match(assetWorkflowSource, /async function publishSoundAssetChanges\(species,/);
  assert.match(assetBackupsSource, /ASSET_BACKUP_RETENTION_COUNT = 1/);
  assert.match(assetBackupsSource, /ASSET_BACKUP_GLOBAL_BYTES = 500 \* 1024 \* 1024/);
  assert.match(assetBackupsSource, /async function writeManagedAssetBackup/);
  assert.match(assetWorkflowSource, /async function restoreSpeciesAsset\(id, assetType\)/);
  assert.match(assetWorkflowSource, /restoreSpeciesAsset\(id, assetType\)/);
  assert.match(projectPublicationSource, /"docs\/manual-map-overrides\.md"/);
  assert.match(iucnMapAdapterSource, /isManualAsset\(safeName, "map"\)/);
  assert.match(updateSource, /isManualAsset\(safeGerman, "sound"\)/);
  assert.match(updateSource, /\{ force: true, allowManual: true, recordAssessment: false \}/);
  assert.match(iucnDataAdapterSource, /createIucnDataAdapter/);
  assert.match(iucnMapAdapterSource, /function requestHeaders\(url\)/);
  assert.match(iucnMapAdapterSource, /headers\.Authorization = `Bearer \$\{token\}`/);
  assert.match(iucnMapAdapterSource, /async function fetchWithPowerShell\(url\)/);
  assert.match(iucnMapAdapterSource, /powerShellRetryAttempts = 3/);
  assert.match(iucnMapAdapterSource, /Neuer Versuch folgt/);
  assert.match(iucnMapAdapterSource, /IUCN_MAP_URL/);
  assert.match(iucnMapAdapterSource, /Invoke-WebRequest -UseBasicParsing/);
  assert.match(iucnMapAdapterSource, /function extractCachedIucnMapUrls\(text, cacheFile = ""\)/);
  assert.match(iucnMapAdapterSource, /cached-individual-maps/);
  assert.match(iucnMapAdapterSource, /\$\{baseUrl\}\/assessments\/\$\{assessmentId\}\/distribution_map\/jpg/);
  assert.match(iucnMapAdapterSource, /fetchValidJpeg\(url, \{ cacheFile \}\)/);
  assert.match(xenoAdapterSource, /createXenoCantoAdapter/);
  assert.match(commonsAdapterSource, /createWikimediaCommonsAudioAdapter/);
  assert.match(inaturalistAdapterSource, /createINaturalistAudioAdapter/);
  assert.match(updateSource, /args\.mode === "manual-maps"/);
  assert.match(updateSource, /args\.mode === "nc-sounds"/);
  assert.match(updateSource, /rejectedSoundKeys/);
  assert.match(updateSource, /isRejectedSoundCandidate/);
  assert.match(updateSource, /rejectionKey/);
  assert.match(updateSource, /forceAlternativeSearch[\s\S]*fallbackStages[\s\S]*Weitere Soundalternative gefunden/);
  assert.match(updateSource, /--species=/);
  assert.equal(assetOverrides.assets.Blaukehlchen.map.manual, true);
  assert.match(appSpeciesActionsSource, /function setupSpeciesDelete\(species\)/);
  assert.match(appSpeciesActionsSource, /\/delete\/preview/);
  assert.match(appSpeciesActionsSource, /\/delete\/save/);
  assert.match(modularAppSource, /class="delete-assets-now"/);
  assert.match(appSpeciesActionsSource, /deleteAssets/);
  assert.match(appDetailMediaSource, /function releaseDetailMedia\(\)/);
  assert.match(appSpeciesActionsSource, /releaseDetailMedia\(\)/);
  assert.match(speciesDeleteSource, /requiresAssetDeletion:\s*!species\.inInput/);
  assert.match(speciesDeleteSource, /Art ist bereits aus der Eingabeliste entfernt/);
  assert.match(modularAppSource, /Taxonomie ist gesperrt\./);
  assert.match(modularAppSource, /URL-Slug entsperren\?/);
  assert.match(modularAppSource, /Ja, entsperren/);
  assert.match(appMeasurementsSource, /function parseManualMeasurement/);
  assert.match(appMeasurementsSource, /function composeManualSexedMeasurement/);
  assert.match(modularAppSource, /class="edit-fields new-species-fields manual-species-fields"/);
  assert.match(appMeasurementsSource, /data-measurement="\$\{escapeHtml\(kind\)\}"/);
  assert.match(modularAppSource, /form\.elements\.sizeSexed/);
  assert.match(modularAppSource, /form\.elements\.weightSexed/);
  assert.match(modularAppSource, /name="lifeExpectancyUnit"/);
  assert.match(speciesModelSource, /function formatTaxonomyName\(value\)/);
  assert.match(updateSource, /function normalizeTaxonomyFields\(entry\)/);
  assert.doesNotMatch(appSource, /Taxonomie und Name sind in Phase 7\.4 gesperrt\./);
  assert.match(modularAppSource, /class="map-edit-section"/);
  assert.match(modularAppSource, /class="map-auto-search-button"/);
  assert.match(modularAppSource, /openPipelinePreview\("manual-maps"/);
  assert.match(modularAppSource, /silent: true/);
  assert.match(appFoundationSource, /pendingChanges: "\/api\/pending-changes"/);
  assert.match(modularAppSource, /refreshExplorerModelOnly\(\{ reload: true \}\)/);
  assert.match(mediaAssetsSource, /async function fetchMapPreviewSourceWithPowerShell\(source\)/);
  assert.match(mediaAssetsSource, /MAP_SOURCE_POWERSHELL_RETRY_ATTEMPTS = 3/);
  assert.match(modularAppSource, /direkter Karten-JPEG-Link/);
  assert.match(modularAppSource, /class="map-preview-button"/);
  assert.match(modularAppSource, /class="map-save-button"/);
  assert.match(modularAppSource, /Karte wird lokal gesichert und ersetzt/);
  assert.match(cssSource, /\.map-compare-grid/);
  assert.match(
    cssSource,
    /\.map-compare-frame img\s*\{[^}]*width:\s*100% !important[^}]*height:\s*auto !important[^}]*object-fit:\s*contain !important/s,
  );
  assert.match(cssSource, /\.new-species-manual-map/);
  assert.match(modularAppSource, /class="sound-edit-section"/);
  assert.match(modularAppSource, /class="sound-auto-search-button"/);
  assert.match(modularAppSource, /openPipelinePreview\("nc-sounds"/);
  assert.match(modularAppSource, /const releaseCurrentSoundAudio = async/);
  assert.match(appDetailMediaSource, /async function releaseAllAudioElements\(\)/);
  assert.match(modularAppSource, /await releaseAllAudioElements\(\)/);
  assert.match(modularAppSource, /class="sound-preview-button"/);
  assert.match(modularAppSource, /class="sound-save-button"/);
  assert.match(modularAppSource, /Sound, Credits und Spektrogramm lokal gesichert und ersetzt/);
  assert.match(modularAppSource, /Spektrogramm wird erzeugt; danach werden Sound, Credits und Spektrogramm/);
  assert.match(modularAppSource, /Das neue Spektrogramm wurde automatisch erzeugt/);
  assert.match(appPresentationSource, /Soundhash geprüft/);
  assert.match(cssSource, /\.sound-compare-grid/);
  assert.match(modularAppSource, /class="portrait-prompt-button"/);
  assert.match(modularAppSource, /class="portrait-copy-button"/);
  assert.match(modularAppSource, /class="portrait-file-input"/);
  assert.match(modularAppSource, /class="portrait-preview-button"/);
  assert.match(modularAppSource, /\/assets\/portrait\/prompt/);
  assert.match(modularAppSource, /\/assets\/portrait\/preview/);
  assert.doesNotMatch(appSource, /\/assets\/portrait\/generate/);
  assert.match(cssSource, /\.portrait-compare-frame\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s);
  assert.match(
    cssSource,
    /\.portrait-compare-frame img\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain/s,
  );
  assert.match(cssSource, /\.portrait-compare-frame img\[hidden\]\s*\{[^}]*display:\s*none !important/s);
  assert.match(cssSource, /grid-template-areas:\s*"file reason"\s*"source reason"/);
  assert.match(
    cssSource,
    /grid-template-areas:\s*"file reason"\s*"recordist reason"\s*"url source"\s*"country license"\s*"quality location"\s*"notes notes"/,
  );
  assert.match(cssSource, /\.asset-file-field input\[type="file"\]/);
  assert.match(cssSource, /\.asset-reason-field textarea/);
  assert.doesNotMatch(
    modularAppSource,
    /<div class="section-actions detail-actions edit-only"[\s\S]*edit-species-open[\s\S]*delete-species-open/,
  );
  assert.match(appMediaSource, /function inlineEditButton\(section\)/);
  assert.match(appMediaSource, /function inlineDeleteButton\(assetType, label\)/);
  assert.match(appMediaSource, /function inlineRestoreButton\(assetType, backup = null\)/);
  assert.match(appMediaSource, /function sectionActions\(/);
  assert.match(appAssetMaintenanceSource, /\/assets\/\$\{assetType\}\/restore/);
  assert.match(appAssetMaintenanceSource, /\/assets\/\$\{assetType\}\/delete/);
  assert.match(cssSource, /\.inline-restore-open/);
  assert.match(modularAppSource, /inlineEditButton\("manual"\)/);
  assert.match(modularAppSource, /species\.inInput \? "map" : ""/);
  assert.match(modularAppSource, /sectionActions\([\s\S]*"sound"[\s\S]*"Soundpaket löschen"/);
  assert.match(appMediaSource, /sectionActions\([\s\S]*species\.inInput \? "portrait" : ""/);
  assert.match(modularAppSource, /Bisheriges Artporträt beibehalten/);
  assert.match(modularAppSource, /class="refresh-species-open"/);
  assert.match(modularAppSource, /Art aktualisieren/);
  assert.match(appSpeciesActionsSource, /openPipelinePreview\("all",/);
  assert.match(appSpeciesActionsSource, /Automatische Aktualisierung für/);
  assert.match(appSpeciesActionsSource, /silent:\s*true/);
  assert.match(appPipelineSource, /function formatPendingFileStatus/);
  assert.match(modularAppSource, /showQuickConfirm/);
  assert.match(cssSource, /body:not\(\.edit-mode\) \.header-edit-slot:not\(\.database-status\)/);
  assert.match(appFoundationSource, /\/api\/pending-changes/);
  assert.match(appLifecycleSource, /beforeunload/);
  assert.match(appMediaSource, /data-edit-section="\$\{escapeHtml\(section\)\}"/);
  assert.match(modularAppSource, /dialog\.dataset\.activeSection = activeSection/);
  assert.match(cssSource, /\.edit-dialog\[data-active-section="map"\]\s+\.manual-edit-section/);
  assert.match(modularAppSource, /const saveAndStartPipeline = async \(\) =>/);
  assert.match(modularAppSource, /state\.newSpeciesPipelineActive = true/);
  assert.match(modularAppSource, /\/api\/pipeline\/preview/);
  assert.match(modularAppSource, /\/api\/pipeline\/start/);
  assert.match(modularAppSource, /\/api\/pipeline\/assets\/review/);
  assert.match(modularAppSource, /data-new-species-map-decision="reject"/);
  assert.match(modularAppSource, /data-new-species-sound-decision="reject"/);
  assert.doesNotMatch(
    modularAppSource,
    /await state\.openPipelinePreview\?\.\("missing",\s*\{\s*targetSlugs:\s*\[savedSpeciesId\],\s*autoStart:\s*true\s*\}\)/,
  );
  assert.match(htmlSource, /Lesemodus 🔒\s*<\/button>/);
  assert.match(htmlSource, /id="new-species-button"/);
  assert.match(htmlSource, /id="new-species-dialog"/);
  assert.match(htmlSource, /new-species-steps/);
  assert.match(htmlSource, /Allgemeine Daten/);
  assert.match(htmlSource, /Artportrait/);
  assert.match(htmlSource, /Karte/);
  assert.match(htmlSource, /Sound &amp; Abschluss|Sound & Abschluss/);
  assert.match(htmlSource, /name="german"/);
  assert.match(htmlSource, /name="scientificName"/);
  assert.match(htmlSource, /name="sizeSexed"/);
  assert.match(htmlSource, /name="sizeMale"/);
  assert.match(htmlSource, /name="sizeFemale"/);
  assert.match(htmlSource, /name="weightSexed"/);
  assert.match(htmlSource, /name="weightMale"/);
  assert.match(htmlSource, /name="weightFemale"/);
  assert.match(htmlSource, /placeholder="Turdus Merula"/);
  assert.match(htmlSource, /placeholder="Amsel"/);
  assert.match(htmlSource, /placeholder="23,5-29"/);
  assert.match(htmlSource, /name="sizeUnit"/);
  assert.match(htmlSource, /placeholder="80-110"/);
  assert.match(htmlSource, /name="weightUnit"/);
  assert.match(htmlSource, /placeholder="3"/);
  assert.match(htmlSource, /name="lifeExpectancyUnit"/);
  assert.doesNotMatch(htmlSource, /name="genus"/);
  assert.doesNotMatch(htmlSource, /name="species"/);
  assert.match(htmlSource, /class="new-species-json"/);
  assert.match(htmlSource, /class="new-species-step new-species-portrait"/);
  assert.match(htmlSource, /new-species-portrait-file-input/);
  assert.match(htmlSource, /Portrait-Prompt erstellen/);
  assert.match(htmlSource, /Artportrait überspringen/);
  assert.match(htmlSource, /Karte,\s*Sound und Spektrogramm geprüft oder erstellt/);
  assert.match(htmlSource, /new-species-map-review/);
  assert.match(htmlSource, /new-species-sound-review/);
  assert.match(modularAppSource, /Manuell per URL einfügen/);
  assert.match(modularAppSource, /new-species-map-source-input/);
  assert.match(modularAppSource, /pipelineRunId:\s*inlineRunId/);
  assert.match(assetWorkflowSource, /allowDuringCurrentReview/);
  assert.doesNotMatch(htmlSource, /SPECIES_LIST\.JSON/);
  assert.doesNotMatch(htmlSource, /species-info\.json/);
  assert.match(
    htmlSource,
    /data-pipeline-mode="all"[\s\S]*data-pipeline-mode="missing"[\s\S]*data-pipeline-mode="manual-maps"/,
  );
  assert.match(htmlSource, /data-pipeline-mode="missing"/);
  assert.match(htmlSource, /data-pipeline-mode="all"/);
  assert.match(htmlSource, /data-pipeline-mode="manual-maps"/);
  assert.match(htmlSource, /data-pipeline-mode="nc-sounds"/);
  assert.doesNotMatch(htmlSource, /data-pipeline-mode="portraits"/);
  assert.match(htmlSource, /data-pipeline-mode="cleanup"/);
  assert.match(htmlSource, /id="pipeline-dialog"/);
  assert.match(htmlSource, /id="edit-mode-toggle"/);
  assert.match(htmlSource, /Lesemodus 🔒/);
  assert.match(htmlSource, /id="pipeline-menu-button"/);
  assert.match(htmlSource, /Datenbank aktualisieren/);
  assert.match(modularAppSource, /Änderungen übertragen/);
  assert.match(modularAppSource, /openPreview\("transfer", \{ transfer: true \}\)/);
  assert.match(htmlSource, /id="pipeline-mode-choice"/);
  assert.match(htmlSource, /Datenbank-Aktionen/);
  assert.match(htmlSource, /Daten aktualisieren/);
  assert.match(htmlSource, /Backup und Einstellungen/);
  assert.match(htmlSource, /<details class="action-group action-group-danger">/);
  assert.match(htmlSource, /Neue\/Unvollständige Arten aktualisieren/);
  assert.match(htmlSource, /Manuelle und fehlende Karten erneut bei IUCN prüfen/);
  assert.match(htmlSource, /id="asset-review-dialog"/);
  assert.match(htmlSource, /id="asset-review-list"/);
  assert.match(htmlSource, /id="asset-review-map-lightbox"/);
  assert.match(htmlSource, /id="asset-review-map-lightbox-image"/);
  assert.match(appAssetReviewSource, /value="reject"/);
  assert.match(appAssetReviewSource, /Gefundenen Sound ablehnen und weiter suchen/);
  assert.match(appAssetReviewWorkflowSource, /decision:\s*formData\.get/);
  assert.match(modularAppSource, /audio\.removeAttribute\("src"\)/);
  assert.doesNotMatch(htmlSource, /class="pipeline-control"/);
  assert.match(htmlSource, /class="validation-dashboard"/);
  assert.doesNotMatch(htmlSource, /Phase 7\.3/);
  assert.match(htmlSource, />Validierung und Status</);
  assert.match(htmlSource, /value="data-issues"/);
  assert.match(htmlSource, /value="asset-issues"/);
  assert.match(
    htmlSource,
    /value="issues">Alle Probleme<\/option>\s*<option value="asset-issues">Assetproblem<\/option>\s*<option value="data-issues">Datenabweichung<\/option>\s*<option value="missing-portrait">Fehlendes Artporträt<\/option>\s*<option value="manual-map">Manuelle Karte<\/option>\s*<option value="nc">NC-Sound<\/option>\s*<option value="sound-care">Sound fehlt\/manuell gepflegt<\/option>/s,
  );
  assert.match(cssSource, /\.validation-grid\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /html,\s*body\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /\.app-shell\s*\{[^}]*height:\s*100vh[^}]*grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /\.workspace\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(cssSource, /\.detail-panel\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(cssSource, /\.species-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(cssSource, /\.species-list\s*\{[^}]*max-height:/s);
  assert.match(
    cssSource,
    /\.species-panel\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s,
  );
  assert.doesNotMatch(cssSource, /\.species-panel\s*\{[^}]*align-self:\s*start/s);
  assert.match(cssSource, /\.species-item\s*\{[^}]*height:\s*61px/s);
  assert.doesNotMatch(appSource, /\["Kartenpflege"/);
  assert.doesNotMatch(appSource, /\["Daten abgerufen", species\.iucn\.fetchedAt\]/);
  assert.match(cssSource, /\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(cssSource, /\.detail-panel\s*\{[^}]*container-name:\s*species-detail/s);
  assert.match(cssSource, /@container species-detail \(max-width:\s*1320px\)[\s\S]*?\.detail-media-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(cssSource, /@media \(max-height:\s*780px\)[\s\S]*?\.validation-card small\s*\{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.sex-specific-value\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.iucn-heading-status,\s*\.iucn-heading-trend\s*\{/);
  assert.match(cssSource, /\.species-list-indicator\s*\{/);
  assert.match(cssSource, /\.iucn-data-value\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(cssSource, /\.section-heading > \.inline-edit-open\s*\{[^}]*margin-right:\s*10px/s);
  assert.doesNotMatch(cssSource, /\.detail-side-stack\s*\{/);
  assert.doesNotMatch(appSource, /detail-side-stack/);
  assert.match(
    cssSource,
    /\.detail-media-layout > \.map-panel,[\s\S]*?\.detail-media-layout > \.species-image-panel\s*\{[^}]*flex-direction:\s*column/s,
  );
  assert.match(
    cssSource,
    /\.detail-media-layout > \.map-panel,[\s\S]*?\.detail-media-layout > \.species-image-panel\s*\{[^}]*container-name:\s*detail-media-card[^}]*container-type:\s*inline-size/s,
  );
  assert.match(
    cssSource,
    /@container detail-media-card \(max-width:\s*600px\)[\s\S]*?\.section-heading-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(cssSource, /\.species-image-panel\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(
    cssSource,
    /\.species-portrait-image\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%[^}]*object-fit:\s*contain/s,
  );
  assert.doesNotMatch(appSource, /function syncSpeciesPanelHeight\(\)/);
  assert.doesNotMatch(appSource, /lastDetailBlock\.getBoundingClientRect\(\)\.bottom/);
  assert.doesNotMatch(appSource, /elements\.speciesPanel\.style\.height = `\$\{targetHeight\}px`/);
  assert.doesNotMatch(appSource, /window\.addEventListener\("resize", syncSpeciesPanelHeight\)/);
  assert.match(cssSource, /\.audio-visual\s*\{[^}]*height:\s*clamp\(64px,\s*4\.5vw,\s*84px\)/s);
  assert.match(modularAppSource, /JPEG- oder PNG-Datei bis 20 MB oder direkter Karten-JPEG-Link/);
  assert.match(modularAppSource, /accept="\.jpg,\.jpeg,\.png,image\/jpeg,image\/png"/);
  assert.match(cssSource, /\.new-species-fields\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.new-species-fields\s*\{[^}]*align-items:\s*start/s);
  assert.match(cssSource, /\.new-species-steps\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(cssSource, /\.edit-fields label\[hidden\]\s*\{[^}]*display:\s*none !important/s);
  assert.match(cssSource, /\.new-species-json\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(cssSource, /\.asset-header-actions\s*\{/);
  assert.match(cssSource, /body:not\(\.edit-mode\) \.edit-only\s*\{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.pipeline-mode-choice\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.action-group\s*\{/);
  assert.match(cssSource, /\.action-group-buttons\s*\{[^}]*display:\s*grid/s);
  assert.match(cssSource, /\.header-action\s*\{[^}]*border:/s);
  assert.match(cssSource, /\.mode-toggle\s*\{[^}]*width:\s*174px/s);
  assert.match(cssSource, /\.mode-toggle\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(cssSource, /\.database-status\.outdated\s*\{[^}]*background:\s*#a32929/s);
  assert.match(cssSource, /\.database-status\.current\s*\{[^}]*background:\s*#1f6b4f/s);
  assert.match(cssSource, /\.asset-review-item\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.asset-review-item\[data-type="map"\]\s*\{[^}]*grid-template-columns/s);
  assert.match(cssSource, /\.asset-review-map-compare\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(cssSource, /\.map-lightbox\s*\{[^}]*scrollbar-gutter:\s*stable/s);
  assert.match(cssSource, /\.map-lightbox-close\s*\{[^}]*right:\s*max\(54px,/s);
  assert.match(cssSource, /\.asset-review-map-trigger\s*\{[^}]*cursor:\s*zoom-in/s);
  assert.match(cssSource, /\.detail-actions\s*\{/);
  assert.match(cssSource, /\.delete-assets-option\s*\{/);
  assert.match(cssSource, /\.delete-assets-option input\s*\{[^}]*width:\s*16px/s);
  assert.match(pipelineControllerSource, /mode:\s*preview\.mode/);
  assert.match(httpRoutingSource, /function safeGraphicsPath\(pathname, repoRoot\)/);
  assert.match(serverSource, /from "\.\/http-routing\.mjs"/);
  assert.match(cssSource, /button\.danger/);
  assert.match(appSelectionSource, /windowRef\.scrollTo\(scrollPosition\)/);
  assert.doesNotMatch(appSource, /renderSpeciesList\(\);\s*renderDetail\(species\)/);
});
