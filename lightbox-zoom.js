// lightbox-zoom.js (Galerie-CTA "Vollbild/Zoom", ohne Galerie-Interferenz)
(function () {
  // ---------- Overlay ----------
  const overlay = document.createElement("div");
  overlay.id = "gz-overlay";
  overlay.innerHTML = `
    <button id="gz-close" aria-label="Schließen">×</button>
    <img id="gz-img" alt="Vollbild / Zoom">
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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) closeZoom(); });

  // Zoom/Pinch/Pan/Doppeltipp
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

  // ---------- Bild-Extraktion: größtes src aus srcset ----------
  function largestSrcFromImg(img) {
    if (!img) return null;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map(s => s.trim().split(" ")[0]).filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return img.getAttribute("data-src") || img.currentSrc || img.src;
  }

  // ---------- Heuristik: aktuell sichtbares Bild in Galerie finden ----------
  function getCurrentGalleryImageSrc(galleryEl) {
    const imgs = Array.from(galleryEl.querySelectorAll("img"))
      .filter(img => img && img.offsetParent !== null && img.clientWidth > 20 && img.clientHeight > 20);

    if (!imgs.length) return null;

    // bevorzugt: Bild mit größter sichtbarer Fläche im Viewport der Galerie
    const gRect = galleryEl.getBoundingClientRect();

    let best = null;
    let bestScore = -1;

    for (const img of imgs) {
      const r = img.getBoundingClientRect();

      // Schnittfläche (Intersection Area)
      const left = Math.max(r.left, gRect.left);
      const top = Math.max(r.top, gRect.top);
      const right = Math.min(r.right, gRect.right);
      const bottom = Math.min(r.bottom, gRect.bottom);

      const w = Math.max(0, right - left);
      const h = Math.max(0, bottom - top);
      const area = w * h;

      // Opacity/Visibility mitbewerten
      const cs = getComputedStyle(img);
      const opacity = Number(cs.opacity || 1);
      const visibleBonus = (cs.visibility !== "hidden" && cs.display !== "none") ? 1 : 0;

      const score = area * (0.5 + opacity) + visibleBonus;

      if (score > bestScore) {
        bestScore = score;
        best = img;
      }
    }

    return largestSrcFromImg(best) || largestSrcFromImg(imgs[0]);
  }

  // ---------- CTA unter Galerie injizieren ----------
  function injectButtons() {
    const galleries = document.querySelectorAll(".sqs-block-gallery, .gallery-block, .sqs-gallery");
    galleries.forEach((g) => {
      // schon vorhanden?
      if (g.parentElement && g.parentElement.querySelector(":scope > .gz-cta-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "gz-cta-wrap";
      wrap.innerHTML = `
        <button type="button" class="gz-cta-btn">Vollbild / Zoom</button>
      `;

      const btn = wrap.querySelector(".gz-cta-btn");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const src = getCurrentGalleryImageSrc(g);
        if (!src) return;
        openZoom(src);
      });

      // direkt unter der Galerie einfügen
      g.insertAdjacentElement("afterend", wrap);
    });
  }

  // initial + nachträglich (Squarespace lädt oft dynamisch)
  injectButtons();
  const obs = new MutationObserver(() => injectButtons());
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();