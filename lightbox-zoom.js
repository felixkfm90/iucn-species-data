// lightbox-zoom.js
(function () {
  // ---------- Zoom-Overlay (eigenes) ----------
  const overlay = document.createElement("div");
  overlay.id = "gz-overlay";
  overlay.innerHTML = `
    <button id="gz-close" aria-label="Schließen">×</button>
    <img id="gz-img" alt="Zoom">
  `;
  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector("#gz-img");
  const closeBtn = overlay.querySelector("#gz-close");

  let scale = 1, tx = 0, ty = 0;
  const minScale = 1, maxScale = 6;

  const pointers = new Map();
  let startDist = 0, startScale = 1, startMid = null, startTx = 0, startTy = 0;
  let lastTap = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function apply() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function reset() {
    scale = 1; tx = 0; ty = 0;
    apply();
  }

  function openZoom(src) {
    if (!src) return;
    imgEl.src = src;
    overlay.classList.add("open");
    reset();
    document.documentElement.classList.add("gz-noscroll");
    document.body.classList.add("gz-noscroll");
  }

  function closeZoom() {
    overlay.classList.remove("open");
    imgEl.src = "";
    document.documentElement.classList.remove("gz-noscroll");
    document.body.classList.remove("gz-noscroll");
    pointers.clear();
  }

  closeBtn.addEventListener("click", closeZoom);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeZoom(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeZoom();
  });

  // Pinch/Pan/Double-tap auf dem Overlay-Bild
  imgEl.style.touchAction = "none";
  imgEl.addEventListener("pointerdown", (e) => {
    imgEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (e.pointerType === "touch") {
      const now = Date.now();
      if (now - lastTap < 300) {
        if (scale === 1) scale = 2;
        else reset();
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
      startMid = mid(pts[0], pts[1]);
      startTx = tx; startTy = ty;
    }
  });

  imgEl.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      if (scale <= 1) return;
      tx += e.movementX || 0;
      ty += e.movementY || 0;
      apply();
      return;
    }

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);

      scale = clamp(startScale * (d / startDist), minScale, maxScale);
      tx = startTx + (m.x - startMid.x);
      ty = startTy + (m.y - startMid.y);
      apply();
    }
  }, { passive: false });

  imgEl.addEventListener("pointerup", (e) => pointers.delete(e.pointerId));
  imgEl.addEventListener("pointercancel", (e) => pointers.delete(e.pointerId));

  overlay.addEventListener("wheel", (e) => {
    if (!overlay.classList.contains("open")) return;
    e.preventDefault();
    scale = clamp(scale * (e.deltaY < 0 ? 1.08 : 0.92), minScale, maxScale);
    apply();
  }, { passive: false });

  // ---------- Squarespace Lightbox erkennen und ersetzen ----------
  function findSqLightboxImg() {
    return (
      document.querySelector("[data-test='gallery-lightbox'] img") ||
      document.querySelector(".gallery-lightbox img") ||
      document.querySelector(".sqs-image-lightbox img") ||
      document.querySelector(".sqs-lightbox img")
    );
  }

  function closeSqLightbox() {
    const btn =
      document.querySelector("[data-test='gallery-lightbox-close-button']") ||
      document.querySelector(".gallery-lightbox-control-close") ||
      document.querySelector(".sqs-image-lightbox-close") ||
      document.querySelector(".sqs-lightbox-close");
    if (btn) { btn.click(); return; }
    // fallback: ESC
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }

  let lastSrc = null;

  const obs = new MutationObserver(() => {
    const sqImg = findSqLightboxImg();
    if (!sqImg) return;

    const src = sqImg.currentSrc || sqImg.src;
    if (!src) return;

    // nicht mehrfach triggern
    if (src === lastSrc) return;
    lastSrc = src;

    // Squarespace-Lightbox zu, eigenes Zoom auf
    closeSqLightbox();
    setTimeout(() => openZoom(src), 60);
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
})();