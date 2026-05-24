// lightbox-zoom.js
// Lightbox button "Vollbild / Zoom" (appended to body) + own zoom overlay.
// Fixes: pick CURRENT lightbox image reliably + hide button while zoom overlay open.

(function () {
  // =========================
  // Zoom Overlay (own)
  // =========================
  const overlay = document.createElement("div");
  overlay.id = "gz-overlay";
  overlay.innerHTML = `
    <button id="gz-close" aria-label="Schließen">×</button>
    <img id="gz-img" alt="Vollbild / Zoom">
  `;
  document.body.appendChild(overlay);

  const zoomImg = overlay.querySelector("#gz-img");
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
    zoomImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function reset() {
    scale = 1; tx = 0; ty = 0;
    apply();
  }

  function openZoom(src) {
    if (!src) return;
    zoomImg.src = src;
    overlay.classList.add("open");
    reset();
    document.documentElement.classList.add("gz-noscroll");
    document.body.classList.add("gz-noscroll");

    // ✅ Button ausblenden, solange Zoom offen ist
    if (zoomBtn) zoomBtn.style.display = "none";
  }

  function closeZoom() {
    overlay.classList.remove("open");
    zoomImg.src = "";
    document.documentElement.classList.remove("gz-noscroll");
    document.body.classList.remove("gz-noscroll");
    pointers.clear();

    // ✅ Button nur wieder zeigen, wenn Lightbox noch offen ist
    const root = findLightboxRoot();
    if (zoomBtn) zoomBtn.style.display = root ? "" : "none";
  }

  closeBtn.addEventListener("click", closeZoom);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeZoom(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeZoom();
  });

  // Pinch/Pan/Double-tap
  zoomImg.style.touchAction = "none";
  zoomImg.addEventListener("pointerdown", (e) => {
    zoomImg.setPointerCapture(e.pointerId);
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

  zoomImg.addEventListener("pointermove", (e) => {
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

  zoomImg.addEventListener("pointerup", (e) => pointers.delete(e.pointerId));
  zoomImg.addEventListener("pointercancel", (e) => pointers.delete(e.pointerId));

  overlay.addEventListener("wheel", (e) => {
    if (!overlay.classList.contains("open")) return;
    e.preventDefault();
    scale = clamp(scale * (e.deltaY < 0 ? 1.08 : 0.92), minScale, maxScale);
    apply();
  }, { passive: false });

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
  // Squarespace Lightbox detection
  // =========================
  function findLightboxRoot() {
    return (
      document.querySelector("[data-test='gallery-lightbox']") ||
      document.querySelector(".gallery-lightbox") ||
      document.querySelector(".sqs-image-lightbox") ||
      document.querySelector(".sqs-lightbox")
    );
  }

  function intersectionArea(r, vp) {
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(vp.w, r.right);
    const bottom = Math.min(vp.h, r.bottom);
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    return w * h;
  }

  function findLightboxImg(root) {
    if (!root) return null;

    const imgs = Array.from(root.querySelectorAll("img"))
      .filter(img => img && img.naturalWidth > 0);

    if (!imgs.length) return null;

    const vp = { w: window.innerWidth, h: window.innerHeight };
    const cx = vp.w / 2;
    const cy = vp.h / 2;

    let best = null;
    let bestScore = -Infinity;

    for (const img of imgs) {
      const cs = getComputedStyle(img);
      if (cs.display === "none" || cs.visibility === "hidden") continue;

      const opacity = Number(cs.opacity || 1);
      if (opacity <= 0.05) continue;

      const r = img.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) continue;

      const areaInt = intersectionArea(r, vp);
      if (areaInt <= 0) continue;

      const areaImg = Math.max(1, r.width * r.height);
      const visRatio = areaInt / areaImg;

      // ✅ wichtig: preloads/next-slides haben oft nur einen kleinen Schnitt oder sind offscreen
      if (visRatio < 0.25) continue;

      const imgCx = r.left + r.width / 2;
      const imgCy = r.top + r.height / 2;
      const centerDist = Math.hypot(imgCx - cx, imgCy - cy);

      // Score: viel Fläche + hohe Opazität + nahe am Zentrum
      const score = (areaInt * (0.5 + opacity)) - (centerDist * 800);

      if (score > bestScore) {
        bestScore = score;
        best = img;
      }
    }

    // Fallback: wenn Filter zu streng war, nimm das größte sichtbare
    if (best) return best;

    let fallback = null;
    let fbScore = -Infinity;
    for (const img of imgs) {
      const cs = getComputedStyle(img);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const opacity = Number(cs.opacity || 1);
      if (opacity <= 0.05) continue;

      const r = img.getBoundingClientRect();
      const areaInt = intersectionArea(r, vp);
      const score = areaInt * (0.5 + opacity);
      if (score > fbScore) { fbScore = score; fallback = img; }
    }

    return fallback || imgs[0];
  }

  // =========================
  // Zoom Button (always clickable)
  // =========================
  let zoomBtn = null;

  function ensureZoomButton(root) {
    if (!zoomBtn) {
      zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "gz-zoom-btn";
      zoomBtn.textContent = "Vollbild / Zoom";
      zoomBtn.style.display = "none";
      document.body.appendChild(zoomBtn);

      zoomBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const r = findLightboxRoot();
        if (!r) return;

        const img = findLightboxImg(r);
        const src = largestSrcFromImg(img);
        openZoom(src);
      });
    }

    // wenn Zoom offen ist: Button versteckt lassen
    if (overlay.classList.contains("open")) {
      zoomBtn.style.display = "none";
      return;
    }

    // show only when lightbox exists
    zoomBtn.style.display = root ? "" : "none";
  }

  // Observe DOM: show/hide button only
  const obs = new MutationObserver(() => {
    const root = findLightboxRoot();
    ensureZoomButton(root);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Initial
  ensureZoomButton(findLightboxRoot());
})();