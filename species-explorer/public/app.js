const explorerFoundation = window.SpeciesExplorerFoundation;
if (!explorerFoundation) throw new Error("Explorer-Grundlage konnte nicht geladen werden.");
const explorerPresentation = window.SpeciesExplorerPresentation;
if (!explorerPresentation) throw new Error("Explorer-Anzeigehelfer konnten nicht geladen werden.");
const explorerMeasurements = window.SpeciesExplorerMeasurements;
if (!explorerMeasurements) throw new Error("Explorer-Messwerthelfer konnten nicht geladen werden.");
const explorerEditorFiles = window.SpeciesExplorerEditorFiles;
if (!explorerEditorFiles) throw new Error("Explorer-Dateihelfer konnten nicht geladen werden.");
const explorerDialogs = window.SpeciesExplorerDialogs;
if (!explorerDialogs) throw new Error("Explorer-Dialogsteuerung konnte nicht geladen werden.");
const explorerConfirmation = window.SpeciesExplorerConfirmation;
if (!explorerConfirmation) throw new Error("Explorer-Bestätigungsdialog konnte nicht geladen werden.");
const explorerFormFeedback = window.SpeciesExplorerFormFeedback;
if (!explorerFormFeedback) throw new Error("Explorer-Formularrückmeldung konnte nicht geladen werden.");
const explorerNewSpeciesForm = window.SpeciesExplorerNewSpeciesForm;
if (!explorerNewSpeciesForm) throw new Error("Explorer-Neue-Art-Formular konnte nicht geladen werden.");
const explorerNewSpeciesWorkflow = window.SpeciesExplorerNewSpeciesWorkflow;
if (!explorerNewSpeciesWorkflow) throw new Error("Explorer-Neue-Art-Ablauf konnte nicht geladen werden.");
const explorerEditorForm = window.SpeciesExplorerEditorForm;
if (!explorerEditorForm) throw new Error("Explorer-Bearbeitungsformular konnte nicht geladen werden.");
const explorerSpeciesEditor = window.SpeciesExplorerSpeciesEditor;
if (!explorerSpeciesEditor) throw new Error("Explorer-Artbearbeitung konnte nicht geladen werden.");
const explorerMapEditor = window.SpeciesExplorerMapEditor;
if (!explorerMapEditor) throw new Error("Explorer-Kartenbearbeitung konnte nicht geladen werden.");
const explorerSoundEditor = window.SpeciesExplorerSoundEditor;
if (!explorerSoundEditor) throw new Error("Explorer-Tierstimmenbearbeitung konnte nicht geladen werden.");
const explorerPortraitEditor = window.SpeciesExplorerPortraitEditor;
if (!explorerPortraitEditor) throw new Error("Explorer-Porträtbearbeitung konnte nicht geladen werden.");
const explorerGeneralEditor = window.SpeciesExplorerGeneralEditor;
if (!explorerGeneralEditor) throw new Error("Explorer-Allgemeindatenbearbeitung konnte nicht geladen werden.");
const explorerTaxonomyEditor = window.SpeciesExplorerTaxonomyEditor;
if (!explorerTaxonomyEditor) throw new Error("Explorer-Taxonomiebearbeitung konnte nicht geladen werden.");
const explorerSettings = window.SpeciesExplorerSettings;
if (!explorerSettings) throw new Error("Explorer-Einstellungen konnten nicht geladen werden.");
const explorerSpeciesActions = window.SpeciesExplorerSpeciesActions;
if (!explorerSpeciesActions) throw new Error("Explorer-Artaktionen konnten nicht geladen werden.");
const explorerAssetMaintenance = window.SpeciesExplorerAssetMaintenance;
if (!explorerAssetMaintenance) throw new Error("Explorer-Asset-Wartung konnte nicht geladen werden.");
const explorerMedia = window.SpeciesExplorerMedia;
if (!explorerMedia) throw new Error("Explorer-Mediensteuerung konnte nicht geladen werden.");
const explorerDetailMedia = window.SpeciesExplorerDetailMedia;
if (!explorerDetailMedia) throw new Error("Explorer-Detailmedien konnten nicht geladen werden.");
const explorerDetailView = window.SpeciesExplorerDetailView;
if (!explorerDetailView) throw new Error("Explorer-Detailansicht konnte nicht geladen werden.");
const explorerSelection = window.SpeciesExplorerSelection;
if (!explorerSelection) throw new Error("Explorer-Artauswahl konnte nicht geladen werden.");
const explorerAssetReview = window.SpeciesExplorerAssetReview;
if (!explorerAssetReview) throw new Error("Explorer-Assetprüfung konnte nicht geladen werden.");
const explorerAssetReviewWorkflow = window.SpeciesExplorerAssetReviewWorkflow;
if (!explorerAssetReviewWorkflow) throw new Error("Explorer-Assetprüfablauf konnte nicht geladen werden.");
const explorerPipeline = window.SpeciesExplorerPipeline;
if (!explorerPipeline) throw new Error("Explorer-Pipelineanzeige konnte nicht geladen werden.");
const explorerBackupWorkflow = window.SpeciesExplorerBackupWorkflow;
if (!explorerBackupWorkflow) throw new Error("Explorer-Backupablauf konnte nicht geladen werden.");
const explorerPipelineWorkflow = window.SpeciesExplorerPipelineWorkflow;
if (!explorerPipelineWorkflow) throw new Error("Explorer-Pipelineablauf konnte nicht geladen werden.");
const explorerDashboard = window.SpeciesExplorerDashboard;
if (!explorerDashboard) throw new Error("Explorer-Dashboard konnte nicht geladen werden.");
const explorerLifecycle = window.SpeciesExplorerLifecycle;
if (!explorerLifecycle) throw new Error("Explorer-Lebenszyklus konnte nicht geladen werden.");
const state = explorerFoundation.createInitialExplorerState();
const explorerApi = explorerFoundation.createExplorerApiClient({
  getSessionToken: () => state.sessionToken,
  setSessionToken: (token) => {
    state.sessionToken = token;
  },
});
const {
  ensureSessionToken,
  fetchJson,
  loadExplorerSnapshot,
  fetchRevision,
} = explorerApi;
const {
  escapeHtml,
  safeUrl,
  formatDate,
  formatBytes,
  formatIucnFetchDate,
  formatIucnStatus,
  assetStatusText,
  backupRetentionText,
  pluralize,
  dataRows,
  formatSexSpecificDataValue,
  iucnStatusIconUrl,
  iucnTrendIconUrl,
  iconDataValue,
  creditValue,
  creditLink,
  soundLicenseInfo,
  soundLicenseBadgeHtml,
  creditLinkWithLicense,
  cacheBustedUrl,
  assetVersionKey,
  versionedAssetUrl,
} = explorerPresentation;
const {
  MANUAL_SIZE_UNITS,
  MANUAL_WEIGHT_UNITS,
  MANUAL_AGE_UNITS,
  parseManualMeasurement,
  stripManualMeasureInput,
  formatManualMeasurement,
  composeManualSexedMeasurement,
  renderUnitOptions,
  renderManualMeasurementEditor,
} = explorerMeasurements;
const {
  iucnDistributionMapUrl,
  fileToBase64,
  waitForAudioMetadata,
} = explorerEditorFiles;
const {
  openDialog,
  createDialogController,
  releaseAudioElement,
  releaseMediaWithin,
} = explorerDialogs;
const { createQuickConfirm } = explorerConfirmation;
const {
  createMessageSetter,
  createFieldFeedbackController,
} = explorerFormFeedback;
const { createNewSpeciesFormModel } = explorerNewSpeciesForm;
const { createEditorFormModel } = explorerEditorForm;
const { setupBackupSettings } = explorerSettings;
const { createSpeciesActionsController } = explorerSpeciesActions;
const { createAssetMaintenanceController } = explorerAssetMaintenance;
const {
  formatTime,
  resetScrollableToTop,
  createMediaRenderers,
  bindAudioPlayer,
  bindImageZoom,
} = explorerMedia;
const { createDetailMediaController } = explorerDetailMedia;
const { createSpeciesSelectionController } = explorerSelection;
const {
  inlineEditButton,
  sectionActions,
  mapPanel,
  speciesImagePanel,
} = createMediaRenderers({
  escapeHtml,
  formatBytes,
  versionedAssetUrl,
});
const {
  reviewSignature,
  createAssetReviewRenderer,
  createAssetReviewMediaController,
} = explorerAssetReview;
const { setupAssetReviewWorkflow } = explorerAssetReviewWorkflow;
const { renderAssetReviewList } = createAssetReviewRenderer({ escapeHtml });
const {
  pipelineModeLabel,
  backupLabel,
  resolveDatabaseStatus,
  databaseStatusLabel,
  soundSearchOutcome,
  createPipelineStatusPresenters,
  createPipelinePreviewRenderer,
  renderProcessLog,
} = explorerPipeline;
const {
  pipelineStatusPresentation,
  backupStatusPresentation,
  persistentStatusPresentation,
} = createPipelineStatusPresenters({ formatBytes });
const {
  renderPipelinePreview,
  renderBackupPreview,
} = createPipelinePreviewRenderer({ escapeHtml, formatBytes });
const requestedSpeciesId = new URLSearchParams(window.location.search).get("species") || "";

const elements = {
  speciesCount: document.querySelector("#species-count"),
  assetIssues: document.querySelector("#asset-issues"),
  ncCount: document.querySelector("#nc-count"),
  manualMapCount: document.querySelector("#manual-map-count"),
  reportDate: document.querySelector("#report-date"),
  editModeToggle: document.querySelector("#edit-mode-toggle"),
  pipelineMenuButton: document.querySelector("#pipeline-menu-button"),
  validationOverall: document.querySelector("#validation-overall"),
  validationDataCard: document.querySelector("#validation-data-card"),
  validationData: document.querySelector("#validation-data"),
  validationDataDetail: document.querySelector("#validation-data-detail"),
  validationAssetsCard: document.querySelector("#validation-assets-card"),
  validationAssets: document.querySelector("#validation-assets"),
  validationAssetsDetail: document.querySelector("#validation-assets-detail"),
  validationReportCard: document.querySelector("#validation-report-card"),
  validationReport: document.querySelector("#validation-report"),
  validationReportDetail: document.querySelector("#validation-report-detail"),
  validationSpecial: document.querySelector("#validation-special"),
  validationDetails: document.querySelector("#validation-details"),
  search: document.querySelector("#search"),
  statusFilter: document.querySelector("#status-filter"),
  flagFilter: document.querySelector("#flag-filter"),
  visibleCount: document.querySelector("#visible-count"),
  newSpeciesButton: document.querySelector("#new-species-button"),
  newSpeciesDialog: document.querySelector("#new-species-dialog"),
  newSpeciesForm: document.querySelector("#new-species-form"),
  pipelineButtons: [...document.querySelectorAll("[data-pipeline-mode]")],
  backupButtons: [...document.querySelectorAll("[data-backup-action]")],
  settingsButtons: [...document.querySelectorAll("[data-settings-action]")],
  pipelineStatus: document.querySelector("#pipeline-status"),
  pipelineRunNotice: document.querySelector("#pipeline-run-notice"),
  pipelineRunNoticeTitle: document.querySelector("#pipeline-run-notice-title"),
  pipelineRunNoticeDetail: document.querySelector("#pipeline-run-notice-detail"),
  pipelineRunNoticeOpen: document.querySelector("#pipeline-run-notice-open"),
  pipelineStatusDetail: document.querySelector("#pipeline-status-detail"),
  pipelineLogDetails: document.querySelector("#pipeline-log-details"),
  pipelineLog: document.querySelector("#pipeline-log"),
  pipelineDialog: document.querySelector("#pipeline-dialog"),
  pipelineForm: document.querySelector("#pipeline-form"),
  pipelineDialogTitle: document.querySelector("#pipeline-dialog-title"),
  pipelineDialogDescription: document.querySelector("#pipeline-dialog-description"),
  pipelineMessage: document.querySelector(".pipeline-message"),
  pipelinePreview: document.querySelector(".pipeline-preview"),
  pipelinePreviewTitle: document.querySelector("#pipeline-preview-title"),
  pipelinePreviewContent: document.querySelector("#pipeline-preview-content"),
  pipelineWarning: document.querySelector("#pipeline-warning"),
  pipelineStartButton: document.querySelector("#pipeline-start-button"),
  pipelineModeChoice: document.querySelector("#pipeline-mode-choice"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  backupRootInput: document.querySelector("#backup-root-input"),
  backupRootDefault: document.querySelector("#backup-root-default"),
  settingsMessage: document.querySelector(".settings-message"),
  settingsResetButton: document.querySelector(".settings-reset-button"),
  settingsSaveButton: document.querySelector(".settings-save-button"),
  assetReviewDialog: document.querySelector("#asset-review-dialog"),
  assetReviewForm: document.querySelector("#asset-review-form"),
  assetReviewList: document.querySelector("#asset-review-list"),
  assetReviewMessage: document.querySelector(".asset-review-message"),
  assetReviewSave: document.querySelector("#asset-review-save"),
  assetReviewMapLightbox: document.querySelector("#asset-review-map-lightbox"),
  assetReviewMapLightboxImage: document.querySelector("#asset-review-map-lightbox-image"),
  assetReviewMapLightboxClose: document.querySelector("#asset-review-map-lightbox-close"),
  reloadButton: document.querySelector("#reload-button"),
  speciesPanel: document.querySelector(".species-panel"),
  speciesList: document.querySelector("#species-list"),
  detailPanel: document.querySelector("#detail-panel"),
  itemTemplate: document.querySelector("#species-item-template"),
};

const showQuickConfirm = createQuickConfirm({
  documentRef: document,
  escapeHtml,
  createDialogController,
});

const renderDetail = explorerDetailView.createDetailViewRenderer({
  state,
  elements,
  escapeHtml,
  formatBytes,
  formatIucnFetchDate,
  formatIucnStatus,
  assetStatusText,
  dataRows,
  formatSexSpecificDataValue,
  iucnStatusIconUrl,
  iucnTrendIconUrl,
  iconDataValue,
  creditValue,
  creditLink,
  soundLicenseInfo,
  creditLinkWithLicense,
  assetVersionKey,
  versionedAssetUrl,
  sizeUnits: MANUAL_SIZE_UNITS,
  weightUnits: MANUAL_WEIGHT_UNITS,
  ageUnits: MANUAL_AGE_UNITS,
  parseManualMeasurement,
  renderUnitOptions,
  renderManualMeasurementEditor,
  iucnDistributionMapUrl,
  inlineEditButton,
  sectionActions,
  mapPanel,
  speciesImagePanel,
  setupAudioPlayer: (...args) => setupAudioPlayer(...args),
  setupMapZoom: (...args) => setupMapZoom(...args),
  setupPortraitZoom: (...args) => setupPortraitZoom(...args),
  setupSpeciesEditor: (...args) => setupSpeciesEditor(...args),
  setupSpeciesRefresh: (...args) => setupSpeciesRefresh(...args),
  setupSpeciesDelete: (...args) => setupSpeciesDelete(...args),
});

const {
  selectSpecies,
  hasOpenDialog,
} = createSpeciesSelectionController({
  state,
  elements,
  windowRef: window,
  documentRef: document,
  URLClass: URL,
  renderDetail,
  resetScrollableToTop,
});

const {
  updateSummary,
  updateValidation,
  updatePendingChanges,
  populateStatusFilter,
  applyFilters,
  renderSpeciesList,
  renderDatabaseStatus,
} = explorerDashboard.createDashboardController({
  state,
  elements,
  formatDate,
  formatIucnStatus,
  pluralize,
  escapeHtml,
  iucnStatusIconUrl,
  iucnTrendIconUrl,
  filterSpecies: globalThis.SpeciesExplorerFilters.filterSpecies,
  resolveDatabaseStatus,
  databaseStatusLabel,
  onSpeciesSelect: (id) => selectSpecies(id),
});

const {
  refreshExplorerModelOnly,
  loadData,
  start: startLifecycle,
} = explorerLifecycle.createExplorerLifecycleController({
  state,
  elements,
  documentRef: document,
  windowRef: window,
  requestedSpeciesId,
  ensureSessionToken,
  loadExplorerSnapshot,
  fetchRevision,
  updateSummary,
  updateValidation,
  updatePendingChanges,
  populateStatusFilter,
  applyFilters,
  renderSpeciesList,
  selectSpecies,
  hasOpenDialog: () => hasOpenDialog(),
  escapeHtml,
});

const detailMediaController = createDetailMediaController({
  state,
  elements,
  documentRef: document,
  AudioElementClass: HTMLAudioElement,
  refreshExplorerModelOnly,
  escapeHtml,
  cacheBustedUrl,
  releaseAudioElement,
  releaseMediaWithin,
  resetScrollableToTop,
  openDialog,
  bindAudioPlayer,
  bindImageZoom,
  createDialogController,
});
const {
  openSharedMapLightbox,
  refreshOpenSoundEditor,
  releaseAllAudioElements,
  releaseDetailMedia,
  setupAudioPlayer,
  setupMapZoom,
  setupPortraitZoom,
} = detailMediaController;
detailMediaController.bindExclusiveAudioPlayback();

setupAssetReviewWorkflow({
  state,
  elements,
  createAssetReviewMediaController,
  createDialogController,
  releaseMediaWithin,
  resetScrollableToTop,
  loadData,
  reviewSignature,
  renderAssetReviewList,
  soundSearchOutcome,
  fetchJson,
  FormDataClass: FormData,
});

const { setupPipelineControl } = explorerPipelineWorkflow.createPipelineWorkflowController({
  state,
  elements,
  createDialogController,
  persistentStatusPresentation,
  pipelineStatusPresentation,
  backupStatusPresentation,
  pipelineModeLabel,
  backupLabel,
  renderPipelinePreview,
  renderBackupPreview,
  releaseAllAudioElements,
  fetchJson,
  soundSearchOutcome,
  refreshExplorerModelOnly,
  refreshOpenSoundEditor,
  loadData,
  renderDatabaseStatus,
  formatDate,
  renderProcessLog,
  createBackupWorkflowController: explorerBackupWorkflow.createBackupWorkflowController,
});

const { setupNewSpeciesCreator } = explorerNewSpeciesWorkflow.createNewSpeciesWorkflowController({
  state,
  elements,
  createMessageSetter,
  createFieldFeedbackController,
  createNewSpeciesFormModel,
  composeManualSexedMeasurement,
  formatManualMeasurement,
  stripManualMeasureInput,
  MANUAL_SIZE_UNITS,
  MANUAL_WEIGHT_UNITS,
  MANUAL_AGE_UNITS,
  fetchJson,
  fileToBase64,
  escapeHtml,
  formatBytes,
  formatTime,
  createDialogController,
  createAssetReviewMediaController,
  releaseMediaWithin,
  resetScrollableToTop,
  reviewSignature,
  renderAssetReviewList,
  soundSearchOutcome,
  loadData,
  showQuickConfirm,
  iucnDistributionMapUrl,
  safeUrl,
  waitForAudioMetadata,
  dataRows,
  soundLicenseInfo,
  soundLicenseBadgeHtml,
  cacheBustedUrl,
  versionedAssetUrl,
  bindAudioPlayer,
  bindImageZoom,
  openSharedMapLightbox,
});

const { setupSpeciesEditor } = explorerSpeciesEditor.createSpeciesEditorController({
  state,
  elements,
  createMessageSetter,
  createFieldFeedbackController,
  createEditorFormModel,
  composeManualSexedMeasurement,
  formatManualMeasurement,
  stripManualMeasureInput,
  MANUAL_SIZE_UNITS,
  MANUAL_WEIGHT_UNITS,
  MANUAL_AGE_UNITS,
  createDialogController,
  showQuickConfirm,
  hasOpenDialog,
  loadData,
  createAssetMaintenanceController,
  fetchJson,
  releaseAllAudioElements,
  fileToBase64,
  waitForAudioMetadata,
  formatBytes,
  formatTime,
  dataRows,
  escapeHtml,
  createMapEditorController: explorerMapEditor.createMapEditorController,
  createSoundEditorController: explorerSoundEditor.createSoundEditorController,
  createPortraitEditorController: explorerPortraitEditor.createPortraitEditorController,
  createGeneralEditorController: explorerGeneralEditor.createGeneralEditorController,
  createTaxonomyEditorController: explorerTaxonomyEditor.createTaxonomyEditorController,
  backupRetentionText,
});

const {
  setupSpeciesRefresh,
  setupSpeciesDelete,
} = createSpeciesActionsController({
  state,
  elements,
  fetchJson,
  showQuickConfirm,
  createDialogController,
  escapeHtml,
  backupRetentionText,
  releaseDetailMedia,
  loadData,
});

setupBackupSettings({
  state,
  elements,
  fetchJson,
  createDialogController,
});
setupPipelineControl();
setupNewSpeciesCreator();
void startLifecycle();
