// lightbox-zoom.js
(function () {
  let activeImg = null;
  let cleanupCurrent = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function findLightboxImg() {
    return (
      document.querySelector("[data-test='gallery-lightbox'] img") ||
      document.querySelector(".gallery-lightbox img") ||
      document.querySelector(".sqs-image-lightbox img") ||
      document.querySelector(".sqs-lightbox img")
    );
  }

  function enhanceImage(img) {
    if (!img || img === activeImg) return;

    if (cleanupCurrent) cleanupCurrent();

    activeImg = img;

    const state = {
      scale: 1,
      minScale: 1,
      maxScale: 5,
      tx: 0,
      ty: 0,
      pointers: new Map(),
      startDist: 0,
      startScale: 1,
      startMid: null,
      startTx: 0,
      startTy: 0,
      lastTap: 0
    };

    img.style.touchAction = "none";
    img.style.transformOrigin = "center center";
    img.style.userSelect = "none";
    img.style.webkitUserDrag = "none";
    img.style.cursor = "grab";
    img.style.transition = "transform 0.05s linear";

    function apply() {
      img.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    }

    function reset() {
      state.scale = 1;
      state.tx = 0;
      state.ty = 0;
      apply();
    }

    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }

    function midpoint(a, b) {
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      };
    }

    function onPointerDown(e) {
      e.stopPropagation();

      img.setPointerCapture(e.pointerId);
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (e.pointerType === "touch") {
        const now = Date.now();
        if (now - state.lastTap < 300) {
          if (state.scale === 1) {
            state.scale = 2;
          } else {
            reset();
          }
          apply();
          state.lastTap = 0;
          return;
        }
        state.lastTap = now;
      }

      if (state.pointers.size === 2) {
        const pts = Array.from(state.pointers.values());
        state.startDist = dist(pts[0], pts[1]);
        state.startScale = state.scale;
        state.startMid = midpoint(pts[0], pts[1]);
        state.startTx = state.tx;
        state.startTy = state.ty;
      }
    }

    function onPointerMove(e) {
      if (!state.pointers.has(e.pointerId)) return;

      e.stopPropagation();
      e.preventDefault();

      const prev = state.pointers.get(e.pointerId);
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (state.pointers.size === 1) {
        if (state.scale <= 1) return;

        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;

        state.tx += dx;
        state.ty += dy;
        apply();
        return;
      }

      if (state.pointers.size === 2) {
        const pts = Array.from(state.pointers.values());
        const d = dist(pts[0], pts[1]);
        const mid = midpoint(pts[0], pts[1]);

        state.scale = clamp(
          state.startScale * (d / state.startDist),
          state.minScale,
          state.maxScale
        );

        state.tx = state.startTx + (mid.x - state.startMid.x);
        state.ty = state.startTy + (mid.y - state.startMid.y);

        apply();
      }
    }

    function onPointerUp(e) {
      state.pointers.delete(e.pointerId);
      if (state.scale <= 1) {
        state.tx = 0;
        state.ty = 0;
        apply();
      }
    }

    function onWheel(e) {
      e.preventDefault();
      e.stopPropagation();

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      state.scale = clamp(state.scale * factor, state.minScale, state.maxScale);

      if (state.scale <= 1) {
        state.tx = 0;
        state.ty = 0;
      }

      apply();
    }

    function onClick(e) {
      // verhindert, dass Tap/Klick wieder nur "weiter" schaltet
      e.stopPropagation();
    }

    img.addEventListener("pointerdown", onPointerDown);
    img.addEventListener("pointermove", onPointerMove, { passive: false });
    img.addEventListener("pointerup", onPointerUp);
    img.addEventListener("pointercancel", onPointerUp);
    img.addEventListener("wheel", onWheel, { passive: false });
    img.addEventListener("click", onClick, true);

    const srcObserver = new MutationObserver(() => {
      reset();
    });
    srcObserver.observe(img, { attributes: true, attributeFilter: ["src"] });

    cleanupCurrent = function () {
      img.removeEventListener("pointerdown", onPointerDown);
      img.removeEventListener("pointermove", onPointerMove);
      img.removeEventListener("pointerup", onPointerUp);
      img.removeEventListener("pointercancel", onPointerUp);
      img.removeEventListener("wheel", onWheel);
      img.removeEventListener("click", onClick, true);
      srcObserver.disconnect();
      img.style.transform = "";
      img.style.touchAction = "";
      img.style.transformOrigin = "";
      img.style.userSelect = "";
      img.style.webkitUserDrag = "";
      img.style.cursor = "";
      img.style.transition = "";
    };
  }

  const observer = new MutationObserver(() => {
    const img = findLightboxImg();
    if (img) enhanceImage(img);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // initialer Check
  const firstImg = findLightboxImg();
  if (firstImg) enhanceImage(firstImg);
})();