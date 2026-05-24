// lightbox-zoom.js (user-initiated only)
(function () {
  // =========================
  // Overlay UI
  // =========================
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

  function apply() { imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
  function reset() { scale = 1; tx = 0; ty = 0; apply(); }

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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) closeZoom(); });

  // Pinch/Pan/Double-tap
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

  // =========================
  // Helpers: Bild-URL extrahieren
  // =========================
  function largestSrcFromImg(img) {
    if (!img) return null;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map(s => s.trim().split(" ")[0]).filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return img.getAttribute("data-src") || img.currentSrc || img.src;
  }

  // =========================
  // 1) Auf der Tierseite: Klick in der Galerie unten
  //    -> verhindert "weiter" und öffnet Zoom für das aktuelle Bild
  // =========================
  document.addEventListener("click", (e) => {
    const gallery = e.target.closest && e.target.closest(".sqs-block-gallery, .gallery-block, .sqs-gallery");
    if (!gallery) return;

    // nur wenn wirklich auf ein Bild/Preview geklickt wird
    const img = e.target.closest && e.target.closest("img");
    if (!img) return;

    const src = largestSrcFromImg(img);
    if (!src) return;

    // Squarespace "next" verhindern
    e.preventDefault();
    e.stopPropagation();

    openZoom(src);
  }, true); // capture

  // =========================
  // 2) Wenn Lightbox schon offen ist (?itemId=...):
  //    Klick auf das große Bild -> Zoom
  // =========================
  document.addEventListener("click", (e) => {
    const lb =
      e.target.closest?.("[data-test='gallery-lightbox']") ||
      e.target.closest?.(".gallery-lightbox") ||
      e.target.closest?.(".sqs-image-lightbox") ||
      e.target.closest?.(".sqs-lightbox");

    if (!lb) return;

    const img = lb.querySelector("img");
    if (!img) return;

    const src = largestSrcFromImg(img);
    if (!src) return;

    // verhindert "next" in Lightbox
    e.preventDefault();
    e.stopPropagation();

    openZoom(src);
  }, true); // capture
})();