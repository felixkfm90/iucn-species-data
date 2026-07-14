(function initializeSpeciesExplorerDialogs(global) {
  "use strict";

  function isDialogOpen(dialog) {
    return Boolean(
      dialog
      && (dialog.open === true || dialog.hasAttribute?.("open")),
    );
  }

  function openDialog(dialog, { bodyClass = "" } = {}) {
    if (!dialog || isDialogOpen(dialog)) return false;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute?.("open", "");
    if (bodyClass) global.document?.body?.classList?.add(bodyClass);
    return true;
  }

  function closeDialog(dialog, { bodyClass = "" } = {}) {
    if (!dialog || !isDialogOpen(dialog)) return false;
    if (dialog.open === true && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute?.("open");
    if (bodyClass) global.document?.body?.classList?.remove(bodyClass);
    return true;
  }

  function setupSafeBackdropClose(dialog, close) {
    if (!dialog || typeof close !== "function") return () => {};
    let startedOnBackdrop = false;
    const onPointerDown = (event) => {
      startedOnBackdrop = event.target === dialog;
    };
    const onPointerCancel = () => {
      startedOnBackdrop = false;
    };
    const onClick = (event) => {
      const shouldClose = startedOnBackdrop && event.target === dialog;
      startedOnBackdrop = false;
      if (shouldClose) close("backdrop");
    };
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointercancel", onPointerCancel);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener?.("pointerdown", onPointerDown);
      dialog.removeEventListener?.("pointercancel", onPointerCancel);
      dialog.removeEventListener?.("click", onClick);
    };
  }

  function createDialogController({
    dialog,
    closeButtons = [],
    closeOnBackdrop = true,
    closeOnEscape = true,
    bodyClass = "",
    beforeClose = null,
    afterClose = null,
    afterOpen = null,
  } = {}) {
    if (!dialog) throw new TypeError("Ein Dialogelement ist erforderlich.");
    const buttons = Array.from(closeButtons || []).filter(Boolean);
    let requestedCloseReason = "native";
    let destroyed = false;

    const handleClosed = () => {
      if (bodyClass) global.document?.body?.classList?.remove(bodyClass);
      const reason = requestedCloseReason;
      requestedCloseReason = "native";
      afterClose?.({ dialog, reason });
    };

    const close = (reason = "programmatic") => {
      if (destroyed || !isDialogOpen(dialog)) return false;
      if (beforeClose?.({ dialog, reason }) === false) return false;
      requestedCloseReason = reason;
      const nativeCloseEvent = dialog.open === true && typeof dialog.close === "function";
      if (nativeCloseEvent) dialog.close();
      else {
        dialog.removeAttribute?.("open");
        handleClosed();
      }
      return true;
    };

    const open = () => {
      if (destroyed || !openDialog(dialog, { bodyClass })) return false;
      afterOpen?.({ dialog });
      return true;
    };

    const onCancel = (event) => {
      event.preventDefault?.();
      if (closeOnEscape) close("escape");
    };
    const onNativeClose = () => handleClosed();
    const onButtonClick = () => close("button");
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    for (const button of buttons) button.addEventListener("click", onButtonClick);
    const removeBackdropHandler = closeOnBackdrop
      ? setupSafeBackdropClose(dialog, close)
      : () => {};

    return Object.freeze({
      open,
      close,
      isOpen: () => isDialogOpen(dialog),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        removeBackdropHandler();
        dialog.removeEventListener?.("cancel", onCancel);
        dialog.removeEventListener?.("close", onNativeClose);
        for (const button of buttons) button.removeEventListener?.("click", onButtonClick);
      },
    });
  }

  function releaseMediaElement(media, {
    replace = false,
    removeSource = true,
    resetPosition = true,
  } = {}) {
    if (!media) return null;
    media.pause?.();
    if (resetPosition) {
      try {
        media.currentTime = 0;
      } catch {
        // Noch nicht geladene Medien erlauben unter Umständen keinen Positionswechsel.
      }
    }
    if (removeSource) {
      media.removeAttribute?.("src");
      media.removeAttribute?.("srcset");
      media.load?.();
    }
    if (!replace || !media.parentNode || typeof media.cloneNode !== "function") return media;
    const releasedMedia = media.cloneNode(false);
    if ("controls" in media) releasedMedia.controls = media.controls;
    if ("preload" in media) releasedMedia.preload = "none";
    releasedMedia.className = media.className;
    media.parentNode.replaceChild(releasedMedia, media);
    return releasedMedia;
  }

  function releaseMediaWithin(root, {
    replace = false,
    includeImages = false,
  } = {}) {
    if (!root?.querySelectorAll) return [];
    const released = [];
    for (const media of root.querySelectorAll("audio, video")) {
      released.push(releaseMediaElement(media, { replace }));
    }
    if (includeImages) {
      for (const image of root.querySelectorAll("img")) {
        image.removeAttribute?.("src");
        image.removeAttribute?.("srcset");
      }
    }
    return released;
  }

  global.SpeciesExplorerDialogs = Object.freeze({
    isDialogOpen,
    openDialog,
    closeDialog,
    setupSafeBackdropClose,
    createDialogController,
    releaseMediaElement,
    releaseAudioElement: releaseMediaElement,
    releaseMediaWithin,
  });
})(globalThis);
