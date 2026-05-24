// lightbox-zoom.js
(function () {
  const OVERLAY_SELECTORS = [
    ".sqs-image-lightbox",     // häufig
    ".sqs-lightbox",           // je nach Template
    ".lightbox",               // fallback
    "[data-lightbox]"          // fallback
  ];

  const IMG_SELECTORS = [
    ".sqs-image-lightbox img",
    ".sqs-lightbox img",
    ".lightbox img",
    "img[data-image]"          // fallback
  ];

  let attachedEl = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function attachZoom(imgEl) {
    if (!imgEl || imgEl === attachedEl) return;
    attachedEl = imgEl;

    // Wichtig für Touch-Gesten
    imgEl.style.touchAction = "none";
    imgEl.style.transformOrigin = "center center";
    imgEl.style.userSelect = "none";
    imgEl.style.webkitUserDrag = "none";

    let scale = 1;
    let minScale = 1;
    let maxScale = 5;
    let tx = 0, ty = 0;

    const pointers = new Map();
    let startDist = 0;
    let startScale = 1;
    let startMid = null;
    let startTx = 0;
    let startTy = 0;

    let lastTap = 0;

    function apply() {
      imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }

    function midpoint(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function reset() {
      scale = 1;
      tx = 0;
      ty = 0;
      apply();
    }

    // Reset bei jedem neuen Bild (src-Change)
    const srcObserver = new MutationObserver(() => reset());
    srcObserver.observe(imgEl, { attributes: true, attributeFilter: ["src"] });

    imgEl.addEventListener("pointerdown", (e) => {
      imgEl.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Double-tap toggle (Touch)
      if (e.pointerType === "touch") {
        const now = Date.now();
        if (now - lastTap < 300) {
          if (scale === 1) {
            scale = 2;
          } else {
            reset();
          }
          apply();
          lastTap = 0;
          return;
        }
        lastTap = now;
      }

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        startDist = dist(pts[0], pts[1]);
        startScale = scale;
        startMid = midpoint(pts[0], pts[1]);
        startTx = tx;
        startTy = ty;
      }
    });

    imgEl.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        // Pan nur wenn gezoomt
        if (scale <= 1) return;
        tx += e.movementX || 0;
        ty += e.movementY || 0;
        apply();
        return;
      }

      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const d = dist(pts[0], pts[1]);
        const mid = midpoint(pts[0], pts[1]);

        scale = clamp(startScale * (d / startDist), minScale, maxScale);

        // leichte Mitnahme, damit es sich nicht "wegzieht"
        tx = startTx + (mid.x - startMid.x);
        ty = startTy + (mid.y - startMid.y);

        apply();
      }
    });

    imgEl.addEventListener("pointerup", (e) => pointers.delete(e.pointerId));
    imgEl.addEventListener("pointercancel", (e) => pointers.delete(e.pointerId));

    // Desktop: Wheel zoom (optional)
    imgEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        scale = clamp(scale * factor, minScale, maxScale);
        apply();
      },
      { passive: false }
    );

    // ESC/Close der Lightbox handled Squarespace – wir müssen nichts schließen.
  }

  function findLightboxImage() {
    // 1) Overlay finden
    const overlay = OVERLAY_SELECTORS.map((s) => document.querySelector(s)).find(Boolean);
    if (!overlay) return null;

    // 2) Bild im Overlay finden
    const img = IMG_SELECTORS
      .map((s) => overlay.querySelector(s) || document.querySelector(s))
      .find(Boolean);

    return img || null;
  }

  // Beobachte DOM, weil Squarespace Lightbox dynamisch einfügt
  const obs = new MutationObserver(() => {
    const img = findLightboxImage();
    if (img) attachZoom(img);
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Initial check
  const init = findLightboxImage();
  if (init) attachZoom(init);
})();