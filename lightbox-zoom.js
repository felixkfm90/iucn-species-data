// lightbox-zoom.js
// Fix: Pinch-Anker relativ zum AKTUELLEN Bildzentrum (statt Viewport-Mitte)
// -> kein "springt auf 100%" beim Auflegen des 2. Fingers
// translate() scale() bleibt für smoothes Gefühl

(function () {
  // =========================
  // Helpers
  // =========================
  function hasItemId() {
    return new URLSearchParams(location.search).has("itemId");
  }

  function getItemIdFromUrl() {
    const p = new URLSearchParams(location.search);
    return p.get("itemId") || "";
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function largestSrcFromImg(img) {
    if (!img) return null;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset
        .split(",")
        .map((s) => s.trim().split(" ")[0])
        .filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return img.getAttribute("data-src") || img.currentSrc || img.src;
  }

  function findLightboxRoot() {
    return (
      document.querySelector("[data-test='gallery-lightbox']") ||
      document.querySelector(".gallery-lightbox") ||
      document.querySelector(".sqs-image-lightbox") ||
      document.querySelector(".sqs-lightbox")
    );
  }

  function isOpenVisible(el) {
    if (!el) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity || 1) <= 0.02) return false;

    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return false;

    return true;
  }

  function intersectionArea(r, vp) {
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(vp.w, r.right);
    const bottom = Math.min(vp.h, r.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  // Bild in Lightbox finden (itemId bevorzugt; sonst sichtbares/zentriertes)
  function findLightboxImg(root) {
    if (!root) return null;

    const itemId = getItemIdFromUrl();

    if (itemId) {
      const selectors = [
        `[data-item-id="${itemId}"]`,
        `[data-itemid="${itemId}"]`,
        `[data-id="${itemId}"]`,
        `[data-collection-id="${itemId}"]`,
        `[id*="${itemId}"]`,
      ];

      for (const sel of selectors) {
        const node = root.querySelector(sel);
        if (node) {
          const img = node.querySelector("img");
          if (img) return img;
        }
      }

      const any = Array.from(root.querySelectorAll("*")).find((el) => {
        for (const a of el.attributes) {
          if (a && typeof a.value === "string" && a.value.includes(itemId)) return true;
        }
        return false;
      });
      if (any) {
        const img = any.querySelector && any.querySelector("img");
        if (img) return img;
      }
    }

    const imgs = Array.from(root.querySelectorAll("img")).filter((img) => img && img.naturalWidth > 0);
    if (!imgs.length) return null;

    const vp = { w: window.innerWidth, h: window.innerHeight };
    const cx = vp.w / 2, cy = vp.h / 2;

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
      if (visRatio < 0.35) continue;

      const imgCx = r.left + r.width / 2;
      const imgCy = r.top + r.height / 2;
      const centerDist = Math.hypot(imgCx - cx, imgCy - cy);

      const score = areaInt * (0.5 + opacity) - centerDist * 900;
      if (score > bestScore) {
        bestScore = score;
        best = img;
      }
    }

    return best || imgs[0];
  }

  // =========================
  // Zoom Overlay DOM
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

  // Transform state
  let scale = 1, tx = 0, ty = 0;
  const minScale = 1, maxScale = 6;

  // Gesture state
  const pointers = new Map();
  let lastTap = 0;
  let panLast = null;

  // pinch = { startDist, startScale, u, v }
  let pinch = null;

  // Base size for clamp
  let baseW = 0, baseH = 0;

  let zoomBtn = null;

  // ✅ translate THEN scale (smooth)
  function apply() {
    zoomImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function reset() {
    scale = 1; tx = 0; ty = 0;
    apply();
  }

  function refreshBaseSize() {
    if (!overlay.classList.contains("open")) return;

    const prevScale = scale, prevTx = tx, prevTy = ty;
    scale = 1; tx = 0; ty = 0;
    apply();

    const r = zoomImg.getBoundingClientRect();
    baseW = r.width;
    baseH = r.height;

    scale = prevScale; tx = prevTx; ty = prevTy;
    apply();
  }

  // Clamp in translate->scale model: allowed tx range = overflow/scale
  function clampTranslate() {
    if (!baseW || !baseH) return;

    const vw = window.innerWidth * 0.95;
    const vh = window.innerHeight * 0.90;

    const scaledW = baseW * scale;
    const scaledH = baseH * scale;

    if (scaledW <= vw) tx = 0;
    else {
      const overflowX = (scaledW - vw) / 2;
      const maxTx = overflowX / scale;
      tx = clamp(tx, -maxTx, maxTx);
    }

    if (scaledH <= vh) ty = 0;
    else {
      const overflowY = (scaledH - vh) / 2;
      const maxTy = overflowY / scale;
      ty = clamp(ty, -maxTy, maxTy);
    }
  }

  function openZoom(src) {
    if (!src) return;

    zoomImg.onload = () => {
      setTimeout(() => {
        refreshBaseSize();
        clampTranslate();
        apply();
      }, 0);
    };

    zoomImg.src = src;
    overlay.classList.add("open");

    zoomImg.style.willChange = "transform";

    reset();
    pointers.clear();
    panLast = null;
    pinch = null;

    document.documentElement.classList.add("gz-noscroll");
    document.body.classList.add("gz-noscroll");
    if (zoomBtn) zoomBtn.style.display = "none";
  }

  function closeZoom() {
    overlay.classList.remove("open");
    zoomImg.src = "";
    zoomImg.style.willChange = "";
    document.documentElement.classList.remove("gz-noscroll");
    document.body.classList.remove("gz-noscroll");

    pointers.clear();
    panLast = null;
    pinch = null;

    updateButtonVisibility();
  }

  closeBtn.addEventListener("click", closeZoom);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeZoom(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeZoom();
  });

  window.addEventListener("resize", () => {
    refreshBaseSize();
    clampTranslate();
    apply();
  });

  // =========================
  // Gestures (Pinch anchored to CURRENT view, using CURRENT image center)
  // =========================
  zoomImg.style.touchAction = "none";

  function getImageCenterScreen() {
    // ✅ Wichtig: Mittelpunkt des aktuell gerenderten Bildes (inkl. Pan/Zoom)
    const r = zoomImg.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function beginPinch() {
    const pts = Array.from(pointers.values());
    const m = mid(pts[0], pts[1]);

    const c = getImageCenterScreen();
    const localMx = m.x - c.x;
    const localMy = m.y - c.y;

    pinch = {
      startDist: dist(pts[0], pts[1]),
      startScale: scale,
      // ✅ In translate->scale: local = scale*(u + tx) => u = local/scale - tx
      u: localMx / scale - tx,
      v: localMy / scale - ty
    };
  }

  zoomImg.addEventListener("pointerdown", (e) => {
    zoomImg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap toggle
    if (e.pointerType === "touch") {
      const now = Date.now();
      if (now - lastTap < 300) {
        if (scale === 1) scale = 2;
        else reset();
        clampTranslate();
        apply();
        lastTap = 0;
        return;
      }
      lastTap = now;
    }

    if (pointers.size === 1) {
      panLast = { x: e.clientX, y: e.clientY };
      pinch = null;
    }

    if (pointers.size === 2) {
      panLast = null;
      beginPinch();
    }
  });

  zoomImg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;

    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pan (1 finger)
    if (pointers.size === 1) {
      if (scale <= 1) return;

      const last = panLast || prev;

      // Pan in "pre-scale" coords to keep speed stable
      tx += (e.clientX - last.x) / scale;
      ty += (e.clientY - last.y) / scale;

      panLast = { x: e.clientX, y: e.clientY };

      clampTranslate();
      apply();
      e.preventDefault();
      return;
    }

    // Pinch (2 fingers)
    if (pointers.size === 2) {
      if (!pinch) beginPinch();

      const pts = Array.from(pointers.values());
      const m = mid(pts[0], pts[1]);
      const d = dist(pts[0], pts[1]);

      const nextScale = clamp(pinch.startScale * (d / pinch.startDist), minScale, maxScale);

      const c = getImageCenterScreen();
      const localMx = m.x - c.x;
      const localMy = m.y - c.y;

      // ✅ Keep same image-space point under fingers:
      // local = nextScale*(u + tx) => tx = local/nextScale - u
      tx = localMx / nextScale - pinch.u;
      ty = localMy / nextScale - pinch.v;
      scale = nextScale;

      clampTranslate();
      apply();
      e.preventDefault();
      return;
    }
  }, { passive: false });

  zoomImg.addEventListener("pointerup", (e) => {
    pointers.delete(e.pointerId);

    if (pointers.size === 1) {
      const p = Array.from(pointers.values())[0];
      panLast = p ? { x: p.x, y: p.y } : null;
      pinch = null;
    }

    if (pointers.size === 0) {
      panLast = null;
      pinch = null;

      if (scale < 1.02) {
        reset();
      } else {
        clampTranslate();
        apply();
      }
    }
  });

  zoomImg.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      panLast = null;
      pinch = null;
      clampTranslate();
      apply();
    }
  });

  // =========================
  // Button
  // =========================
  function ensureZoomButton() {
    if (zoomBtn) return;

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

  function updateButtonVisibility() {
    ensureZoomButton();

    if (overlay.classList.contains("open")) {
      zoomBtn.style.display = "none";
      return;
    }

    const root = findLightboxRoot();
    const open = hasItemId() && isOpenVisible(root);
    zoomBtn.style.display = open ? "" : "none";
  }

  const obs = new MutationObserver(updateButtonVisibility);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  let lastSearch = location.search;
  setInterval(() => {
    if (location.search !== lastSearch) {
      lastSearch = location.search;
      updateButtonVisibility();
    }
  }, 200);

  setInterval(updateButtonVisibility, 250);

  updateButtonVisibility();
})();