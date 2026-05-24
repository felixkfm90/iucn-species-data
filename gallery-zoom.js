// gallery-zoom.js
(function () {
  // Nur aktiv, wenn Galleries existieren
  const galleries = document.querySelectorAll(".sqs-gallery, .gallery-block, .sqs-block-gallery");
  if (!galleries.length) return;

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

  // Pointer tracking (Pinch)
  const pointers = new Map();
  let startDist = 0;
  let startScale = 1;
  let startMid = null;
  let startTx = 0, startTy = 0;

  // Double-tap
  let lastTap = 0;

  function open(src) {
    imgEl.src = src;
    overlay.classList.add("open");
    resetTransform();
    // verhindern, dass Hintergrund scrollt
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
    scale = 1;
    tx = 0; ty = 0;
    applyTransform();
  }

  function applyTransform() {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // --- Event wiring: Klicks auf Galeriebilder abfangen ---
  function getLargestSrc(target) {
    // Versuche: data-src / srcset / src
    const img = target.closest("img");
    if (!img) return null;

    // Wenn srcset vorhanden, nimm die letzte (meist größte)
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map(s => s.trim().split(" ")[0]).filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }

    return img.getAttribute("data-src") || img.currentSrc || img.src;
  }

  document.addEventListener("click", (e) => {
    const inGallery = e.target.closest(".sqs-gallery, .gallery-block, .sqs-block-gallery");
    if (!inGallery) return;

    const src = getLargestSrc(e.target);
    if (!src) return;

    // built-in lightbox vermeiden
    e.preventDefault();
    e.stopPropagation();

    open(src);
  }, true);

  // --- Close handlers ---
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) close();
  });

  // --- Pointer Events: Pan + Pinch ---
  imgEl.addEventListener("pointerdown", (e) => {
    imgEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap (nur Touch)
    if (e.pointerType === "touch") {
      const now = Date.now();
      if (now - lastTap < 300) {
        // toggle zoom
        if (scale === 1) {
          scale = 2;
        } else {
          resetTransform();
        }
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
      // pan (nur wenn gezoomt, sonst wackelt es unnötig)
      if (scale <= 1) return;

      const prev = pointers.get(e.pointerId);
      // Wir brauchen "delta": nutze movementX/Y (fallback)
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      tx += dx;
      ty += dy;
      applyTransform();
      return;
    }

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const d = dist(pts[0], pts[1]);
      const mid = midpoint(pts[0], pts[1]);

      const nextScale = clamp(startScale * (d / startDist), minScale, maxScale);

      // translate so that zoom feels centered on pinch midpoint
      const scaleChange = nextScale / scale;
      scale = nextScale;

      // adjust translation relative to midpoint movement
      const mx = mid.x - startMid.x;
      const my = mid.y - startMid.y;
      tx = startTx + mx;
      ty = startTy + my;

      applyTransform();
    }
  });

  imgEl.addEventListener("pointerup", (e) => {
    pointers.delete(e.pointerId);
  });
  imgEl.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
  });

  // Desktop wheel zoom
  overlay.addEventListener("wheel", (e) => {
    if (!overlay.classList.contains("open")) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.08 : 0.92;
    const next = clamp(scale * factor, minScale, maxScale);
    scale = next;
    applyTransform();
  }, { passive: false });

})();