(function initializeSpeciesExplorerAssetReviewWorkflow(global) {
  "use strict";

  function setupAssetReviewWorkflow({
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
    FormDataClass = global.FormData,
  } = {}) {
    if (!state || typeof state !== "object" || !elements?.assetReviewDialog || !elements?.assetReviewForm) {
      throw new TypeError("Assetprüfung benötigt Zustand, Dialog und Formular.");
    }
    for (const [name, dependency] of Object.entries({
      createAssetReviewMediaController,
      createDialogController,
      releaseMediaWithin,
      resetScrollableToTop,
      loadData,
      reviewSignature,
      renderAssetReviewList,
      soundSearchOutcome,
      fetchJson,
      FormDataClass,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Assetprüfung benötigt ${name} als Funktion.`);
      }
    }

    const dialog = elements.assetReviewDialog;
    const form = elements.assetReviewForm;
    const assetReviewMediaController = createAssetReviewMediaController({
      list: elements.assetReviewList,
      mapLightbox: elements.assetReviewMapLightbox,
      mapLightboxImage: elements.assetReviewMapLightboxImage,
      mapLightboxClose: elements.assetReviewMapLightboxClose,
      createDialogController,
      releaseMediaWithin,
      resetScrollableToTop,
    });
    const stopAssetReviewAudio = assetReviewMediaController.stopAudio;
    const closeMapLightbox = assetReviewMediaController.closeMapLightbox;

    const setMessage = (text = "", type = "") => {
      elements.assetReviewMessage.textContent = text;
      elements.assetReviewMessage.className = `edit-message asset-review-message${type ? ` ${type}` : ""}`;
      elements.assetReviewMessage.hidden = !text;
    };

    const reviewController = createDialogController({
      dialog,
      closeOnBackdrop: false,
      closeOnEscape: false,
      afterClose: () => {
        stopAssetReviewAudio();
        closeMapLightbox();
        state.assetReviewAwaitingRetry = false;
        state.assetReviewSignature = "";
        form.dataset.closeOnly = "false";
        elements.assetReviewSave.textContent = "Entscheidung speichern";
        if (state.reloadAfterAssetReviewClose || state.pendingRevisionReload) {
          const forceReload = state.reloadAfterAssetReviewClose;
          state.reloadAfterAssetReviewClose = false;
          state.pendingRevisionReload = false;
          void loadData({ reload: forceReload });
        }
      },
    });

    const closeReviewDialog = () => reviewController.close("programmatic");

    const openReview = (status) => {
      if (!status.reviewAssets?.length) return false;
      const nextSignature = reviewSignature(status.reviewAssets);
      if (state.assetReviewRunId === status.runId && state.assetReviewSignature === nextSignature && dialog.open) {
        return false;
      }
      state.assetReviewRunId = status.runId;
      state.assetReviewSignature = nextSignature;
      state.assetReviewAwaitingRetry = false;
      form.dataset.closeOnly = "false";
      elements.assetReviewSave.textContent = "Entscheidung speichern";
      elements.assetReviewSave.disabled = false;
      const retryMode = status.mode === "manual-maps" || status.mode === "nc-sounds";
      elements.assetReviewList.innerHTML = renderAssetReviewList(status);
      form.dataset.runId = status.runId;
      form.dataset.assets = JSON.stringify(status.reviewAssets);
      setMessage(
        retryMode
          ? "Bitte für jede gefundene Alternative festlegen, ob sie übernommen, abgelehnt oder der bisherige Bestand behalten wird."
          : "Bitte für jede neue Karte und jeden neuen Sound eine Pflegeart auswählen.",
        "info",
      );
      reviewController.open();
      assetReviewMediaController.bindRenderedMedia();
      return true;
    };

    state.finishAssetReviewWaiting = (status) => {
      if (!dialog.open || !state.assetReviewAwaitingRetry) return false;
      const failed = status.status === "failed";
      const reviewedAssets = JSON.parse(form.dataset.assets || "[]");
      const reviewedSound = reviewedAssets.find((asset) => asset.type === "sound");
      const outcome = soundSearchOutcome(status.log, {
        hasCurrentSound: reviewedSound?.previouslyExisting === true,
      });
      stopAssetReviewAudio();
      setMessage(
        failed
          ? status.error || "Sound-Suchlauf fehlgeschlagen. Der bisherige Sound bleibt erhalten."
          : outcome.message || "Sound-Suchlauf abgeschlossen. Der bisherige Sound bleibt erhalten.",
        failed ? "error" : outcome.messageType,
      );
      form.dataset.closeOnly = "true";
      elements.assetReviewSave.textContent = "Fenster schließen";
      elements.assetReviewSave.disabled = false;
      state.assetReviewAwaitingRetry = false;
      return true;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.dataset.closeOnly === "true") {
        closeReviewDialog();
        return;
      }
      const assets = JSON.parse(form.dataset.assets || "[]");
      const formData = new FormDataClass(form);
      const choices = assets.map((asset, index) => ({
        safeName: asset.safeName,
        type: asset.type,
        decision: formData.get(`asset-${index}`),
        manual: formData.get(`asset-${index}`) === "manual",
      }));
      const rejectedSound = choices.some((choice) => choice.type === "sound" && choice.decision === "reject");
      elements.assetReviewSave.disabled = true;
      setMessage("Pflegeentscheidungen werden gespeichert…", "info");
      try {
        await fetchJson("/api/pipeline/assets/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: form.dataset.runId,
            choices,
          }),
        });
        if (rejectedSound) {
          state.assetReviewAwaitingRetry = true;
          stopAssetReviewAudio();
          setMessage(
            "Gefundener Sound wurde abgelehnt und gemerkt. Nächster Sound wird gesucht …",
            "info",
          );
        } else {
          closeReviewDialog();
          setMessage();
        }
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        elements.assetReviewSave.disabled = false;
      } finally {
        if (!rejectedSound && form.dataset.closeOnly !== "true") elements.assetReviewSave.disabled = false;
      }
    });

    state.openAssetReview = openReview;
    return Object.freeze({
      openReview,
      closeReviewDialog,
      setMessage,
      reviewController,
      assetReviewMediaController,
    });
  }

  global.SpeciesExplorerAssetReviewWorkflow = Object.freeze({
    setupAssetReviewWorkflow,
  });
})(typeof window !== "undefined" ? window : globalThis);
