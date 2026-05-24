// lightbox-zoom.js (v: lightbox-open detection fixed)
// - Button only shown when Squarespace lightbox is REALLY visible/open
// - Button hides immediately when lightbox closes (even if DOM stays)
// - Close X always above zoomed image

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
  function reset() { scale = 1; tx = 0; ty = 0; apply(); }

  function openZoom(src) {
    if (!src) return;
    zoomImg.src = src;
    overlay.classList.add("open");
    reset();
    document.documentElement.classList.add("gz-noscroll");
    document.body.classList.add("gz-noscroll");
    if (zoomBtn) zoomBtn.style.display = "none";
  }

  function closeZoom() {
    overlay.classList.remove("open");
    zoomImg.src = "";
    document.documentElement.classList.remove("gz-noscroll");
    document.body.classList.remove("gz-noscroll");
    pointers.clear();

    // show button again only if lightbox is still truly open
    const root = findLightboxRootOpen();
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
  // Squarespace Lightbox detection (OPEN only)
  // =========================
  function findLightboxRootRaw() {
    return (
      document.querySelector("[data-test='gallery-lightbox']") ||
      document.querySelector(".gallery-lightbox") ||
      document.querySelector(".sqs-image-lightbox") ||
      document.querySelector(".sqs-lightbox")
    );
  }

  function isElementVisible(el) {
    if (!el) return false;

    // aria-hidden often used
    const ariaHidden = el.getAttribute("aria-hidden");
    if (ariaHidden === "true") return false;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity || 1) <= 0.02) return false;

    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return false;

    // many overlays cover most of viewport when open
    // (this is a heuristic, but prevents hidden/offscreen templates)
    const vpArea = Math.max(1, window.innerWidth * window.innerHeight);
    const area = r.width * r.height;
    if (area / vpArea < 0.10) return false;

    return true;
  }

  function findLightboxRootOpen() {
    const root = findLightboxRootRaw();
    return isElementVisible(root) ? root : null;
  }

  function getItemIdFromUrl() {
    const p = new URLSearchParams(location.search);
    return p.get("itemId") || "";
  }

  function findLightboxImg(root) {
    if (!root) return null;

    const itemId = getItemIdFromUrl();

    // Try itemId wrapper first
    if (itemId) {
      const selectors = [
        `[data-item-id="${itemId}"]`,
        `[data-itemid="${itemId}"]`,
        `[data-id="${itemId}"]`,
        `[id*="${itemId}"]`
      ];
      for (const sel of selectors) {
        const node = root.querySelector(sel);
        if (node) {
          const img = node.querySelector("img");
          if (img) return img;
        }
      }
    }

    // Fallback: choose most visible img in open lightbox
    const imgs = Array.from(root.querySelectorAll("img")).filter(img => img && img.naturalWidth > 0);
    if (!imgs.length) return null;

    const vp = { w: window.innerWidth, h: window.innerHeight };

    function intersectionArea(r) {
      const left = Math.max(0, r.left);
      const top = Math.max(0, r.top);
      const right = Math.min(vp.w, r.right);
      const bottom = Math.min(vp.h, r.bottom);
      return Math.max(0, right - left) * Math.max(0, bottom - top);
    }

    let best = null, bestScore = -Infinity;
    for (const img of imgs) {
      const cs = getComputedStyle(img);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const opacity = Number(cs.opacity || 1);
      if (opacity <= 0.1) continue;

      const r = img.getBoundingClientRect();
      const areaInt = intersectionArea(r);
      if (areaInt <= 0) continue;

      const score = areaInt * (0.5 + opacity);
      if (score > bestScore) { bestScore = score; best = img; }
    }

    return best || imgs[0];
  }

  // =========================
  // Zoom Button (always clickable, but only shown when lightbox OPEN)
  // =========================
  let zoomBtn = null;

  function ensureZoomButton(rootOpen) {
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

        const root = findLightboxRootOpen();
        if (!root) return;

        const img = findLightboxImg(root);
        const src = largestSrcFromImg(img);
        openZoom(src);
      });
    }

    if (overlay.classList.contains("open")) {
      zoomBtn.style.display = "none";
      return;
    }

    zoomBtn.style.display = rootOpen ? "" : "none";
  }

  function update() {
    const rootOpen = findLightboxRootOpen();
    ensureZoomButton(rootOpen);
  }

  // Observe DOM changes
  const obs = new MutationObserver(update);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // URL polling: itemId changes when navigating next/prev
  let lastSearch = location.search;
  setInterval(() => {
    if (location.search !== lastSearch) {
      lastSearch = location.search;
      update();
    }
  }, 200);

  // Hard refresh: closes sometimes happen without useful mutations
  setInterval(update, 250);

  // Initial
  update();
})();