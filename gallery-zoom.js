// gallery-zoom.js (v2) - Works with Squarespace Gallery/Slideshow/Carousel (img + background-image)
(function () {
  // --- Overlay UI (einmalig) ---
  const overlay = document.createElement("div");
  overlay.id = "gz-overlay";
  overlay.innerHTML = `
    <button id="gz-close" aria-label="Schließen">×</button>
    <img id="gz-img" alt="Zoom">
  `;
  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector("#gz-img");
  const closeBtn = overlay.querySelector("#gz-close");

  let scale = 1;
  let minScale = 1;
  let maxScale = 5;
  let tx = 0, ty = 0;

  const pointers = new Map();
  let startDist = 0;
  let startScale = 1;
  let startMid = null;
  let startTx = 0, startTy = 0;
  let lastTap = 0;

  function open(src) {
    if (!src) return;
    imgEl.src = src;
    overlay.classList.add("open");
    resetTransform();
    document.documentElement.classList.add("gz-noscroll");
    document.body.classList.add("gz-noscroll");
  }

  function close() {
    overlay.classList.remove("open");
    imgEl.src = "";
    document.documentElement.classList.remove("gz-noscroll");
    document.body.classList.remove("gz-noscroll");
    pointers.clear();
  }

  function resetTransform() {
    scale = 1; tx = 0; ty = 0;
    applyTransform();
  }

  function applyTransform() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function getBgUrl(el) {
    if (!el) return null;
    const bg = getComputedStyle(el).backgroundImage || "";
    // background-image: url("...")  or url(...)
    const m = bg.match(/url\(["']?(.+?)["']?\)/i);
    return m ? m[1] : null;
  }

  function getLargestSrcFromImg(img) {
    if (!img) return null;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map(s => s.trim().split(" ")[0]).filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return img.getAttribute("data-src") || img.currentSrc || img.src;
  }

  function extractImageSrc(target) {
    // 1) echtes <img>
    const img = target.closest && target.closest("img");
    if (img) return getLargestSrcFromImg(img);

    // 2) Squarespace gallery items nutzen oft background-image auf wrappern
    // typ. Klassen: .gallery-slideshow-item, .sqs-gallery-design-slideshow, .slide, etc.
    const bgEl = target.closest && target.closest(
      ".sqs-gallery, .sqs-gallery-design-slideshow, .gallery-block, .sqs-block-gallery, .slide, .gallery-slideshow-item, figure, .sqs-gallery-item"
    );
    if (bgEl) {
      const bgUrl = getBgUrl(bgEl);
      if (bgUrl) return bgUrl;
    }

    // 3) als Fallback: Eltern hochlaufen und bg prüfen
    let el = target;
    for (let i = 0; i < 6 && el; i++) {
      const bgUrl = getBgUrl(el);
      if (bgUrl) return bgUrl;
      el = el.parentElement;
    }

    return null;
  }

  // --- Close handlers ---
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) close();
  });

  // --- Wichtig: Events im CAPTURE abfangen, bevor Squarespace "next slide" macht ---
  document.addEventListener("click", (e) => {
    const inGallery = e.target.closest &&
      e.target.closest(".sqs-gallery, .sqs-gallery-design-slideshow, .gallery-block, .sqs-block-gallery");

    if (!inGallery) return;
    if (overlay.classList.contains("open")) return;

    const src = extractImageSrc(e.target);
    if (!src) return;

    // Squarespace-Navigation verhindern
    e.preventDefault();
    e.stopPropagation();

    open(src);
  }, true); // <-- capture = true

  // --- Pointer Events: Pan + Pinch ---
  imgEl.addEventListener("pointerdown", (e) => {
    imgEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (e.pointerType === "touch") {
      const now = Date.now();
      if (now - lastTap < 300) {
        // Double-tap toggle
        if (scale === 1) scale = 2;
        else resetTransform();
        applyTransform();
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
      if (scale <= 1) return;
      tx += e.movementX || 0;
      ty += e.movementY || 0;
      applyTransform();
      return;
    }

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const d = dist(pts[0], pts[1]);
      const mid = midpoint(pts[0], pts[1]);

      const nextScale = clamp(startScale * (d / startDist), minScale, maxScale);
      scale = nextScale;

      tx = startTx + (mid.x - startMid.x);
      ty = startTy + (mid.y - startMid.y);

      applyTransform();
    }
  });

  imgEl.addEventListener("pointerup", (e) => pointers.delete(e.pointerId));
  imgEl.addEventListener("pointercancel", (e) => pointers.delete(e.pointerId));

  // Desktop wheel zoom
  overlay.addEventListener("wheel", (e) => {
    if (!overlay.classList.contains("open")) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    scale = clamp(scale * factor, minScale, maxScale);
    applyTransform();
  }, { passive: false });

})();