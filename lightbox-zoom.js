// lightbox-zoom.js
// ✅ Ziel: Android-Overlay-Zoom wie “richtige” Lightbox
// - Button "Vollbild / Zoom" erscheint nur, wenn Squarespace-Lightbox offen ist (itemId + sichtbar)
// - Klick öffnet eigenes Overlay
// - Overlay: Touch-basiert (kein PointerCapture), stabiler Pinch/Pan ohne “springt auf 100%”
// - Pinch zoomt um Mittelpunkt zwischen den Fingern und startet aus aktuellem Ausschnitt
// - 1-Finger Pan nur wenn gezoomt
// - Clamp verhindert “wegfliegen”
// - Close-X bleibt immer oben

(function () {
  // =========================
  // Lightbox (Squarespace) Helpers
  // =========================
  function hasItemId() {
    return new URLSearchParams(location.search).has("itemId");
  }

  function getItemIdFromUrl() {
    const p = new URLSearchParams(location.search);
    return p.get("itemId") || "";
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

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function intersectionArea(r, vp) {
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(vp.w, r.right);
    const bottom = Math.min(vp.h, r.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
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
    const cx = vp.w / 2,
      cy = vp.h / 2;

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

  // Make sure browser gestures are disabled inside overlay (also set in CSS ideally)
  overlay.style.touchAction = "none";
  zoomImg.style.touchAction = "none";

  // Transform state
  let scale = 1,
    tx = 0,
    ty = 0;
  const minScale = 1,
    maxScale = 6;

  // For clamping
  let baseW = 0,
    baseH = 0;

  // Touch state
  let lastTap = 0;
  let lastPan = null; // {x,y}
  let pinchState = null; // { startDist, startScale, u, v }

  let zoomBtn = null;

  function apply() {
    // smooth feel
    zoomImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  }

  function refreshBaseSize() {
    if (!overlay.classList.contains("open")) return;

    const ps = scale,
      ptx = tx,
      pty = ty;
    scale = 1;
    tx = 0;
    ty = 0;
    apply();

    const r = zoomImg.getBoundingClientRect();
    baseW = r.width;
    baseH = r.height;

    scale = ps;
    tx = ptx;
    ty = pty;
    apply();
  }

  // Clamp for translate->scale: allowed tx/ty range is overflow/scale
  function clampTranslate() {
    if (!baseW || !baseH) return;

    const vw = window.innerWidth * 0.95;
    const vh = window.innerHeight * 0.9;

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
      // wait 1 paint
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
    lastPan = null;
    pinchState = null;

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

    lastPan = null;
    pinchState = null;

    updateButtonVisibility();
  }

  closeBtn.addEventListener("click", closeZoom);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeZoom();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeZoom();
  });

  window.addEventListener("resize", () => {
    refreshBaseSize();
    clampTranslate();
    apply();
  });

  // =========================
  // Touch gestures (stable)
  // =========================

  function touchDist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function touchMidLocal(t1, t2) {
    const mx = (t1.clientX + t2.clientX) / 2;
    const my = (t1.clientY + t2.clientY) / 2;

    // local midpoint relative to viewport center (transform-origin center)
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return { x: mx - cx, y: my - cy };
  }

  // Block browser pinch/scroll inside overlay
  overlay.addEventListener(
    "touchmove",
    (e) => {
      if (overlay.classList.contains("open")) e.preventDefault();
    },
    { passive: false }
  );

  zoomImg.addEventListener(
    "touchstart",
    (e) => {
      if (!overlay.classList.contains("open")) return;
      e.preventDefault();

      // Double tap (1 finger)
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 280) {
          if (scale === 1) scale = 2;
          else reset();
          clampTranslate();
          apply();
          lastTap = 0;
          return;
        }
        lastTap = now;

        lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        pinchState = null;
      }

      if (e.touches.length === 2) {
        lastPan = null;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const m = touchMidLocal(t1, t2);
        const d = touchDist(t1, t2);

        // Anchor to CURRENT visible content:
        // local = scale*(u + tx)  => u = local/scale - tx
        pinchState = {
          startDist: d,
          startScale: scale,
          u: m.x / scale - tx,
          v: m.y / scale - ty,
        };
      }
    },
    { passive: false }
  );

  zoomImg.addEventListener(
    "touchmove",
    (e) => {
      if (!overlay.classList.contains("open")) return;
      e.preventDefault();

      // 2-finger pinch
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];

        if (!pinchState) {
          // initialize if missing
          const m0 = touchMidLocal(t1, t2);
          pinchState = {
            startDist: touchDist(t1, t2),
            startScale: scale,
            u: m0.x / scale - tx,
            v: m0.y / scale - ty,
          };
        }

        const m = touchMidLocal(t1, t2);
        const d = touchDist(t1, t2);

        const nextScale = clamp(pinchState.startScale * (d / pinchState.startDist), minScale, maxScale);

        // keep same image-point under fingers:
        // m = nextScale*(u + tx) => tx = m/nextScale - u
        tx = m.x / nextScale - pinchState.u;
        ty = m.y / nextScale - pinchState.v;
        scale = nextScale;

        clampTranslate();
        apply();
        return;
      }

      // 1-finger pan (only if zoomed)
      if (e.touches.length === 1 && scale > 1) {
        const t = e.touches[0];
        if (!lastPan) {
          lastPan = { x: t.clientX, y: t.clientY };
          return;
        }

        const dx = t.clientX - lastPan.x;
        const dy = t.clientY - lastPan.y;

        // pan in pre-scale coordinates for consistent speed
        tx += dx / scale;
        ty += dy / scale;

        lastPan = { x: t.clientX, y: t.clientY };

        clampTranslate();
        apply();
      }
    },
    { passive: false }
  );

  zoomImg.addEventListener(
    "touchend",
    () => {
      lastPan = null;
      pinchState = null;

      if (scale < 1.02) {
        reset();
      } else {
        clampTranslate();
        apply();
      }
    },
    { passive: true }
  );

  // =========================
  // Zoom Button (body)
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