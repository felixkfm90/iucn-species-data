// species-hero-layout.js v1.0.4 — native full-bleed photo and responsive species title.
(function () {
  const route = /^\/wildlife\/(heimische-tierwelt|costarica|island|afrika)\/[a-z0-9-]+\/?$/;
  if (!route.test(window.location.pathname)) return;
  const originalPath = window.location.pathname;
  const region = originalPath.split("/")[2];
  const marker = "full-bleed-responsive-title-v3";
  const markerName = "data-fn-species-hero";
  const heightName = "--fn-species-hero-header-height";
  const ownerKey = Symbol.for("fn.speciesHeroLayout.v1"); // Stable ownership across layout revisions.
  const headingSelector = "h1, h2, h3, h4, h5, h6";
  const inlineTags = new Set(["SPAN", "STRONG", "EM", "B", "I", "U", "S", "SMALL", "SUB", "SUP", "BR", "WBR"]);
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

  function knownContentOnly(hero, image, heading, link) {
    function visit(node, textAllowed = false) {
      if (node.nodeType === 3) return textAllowed || !normalize(node.nodeValue);
      if (node.nodeType === 8) return true;
      if (node.nodeType !== 1 || node.getAttributeNames().some((name) =>
        /^(?:on|contenteditable$|tabindex$|role$)/i.test(name))) return false;
      if (node === image) return node.childNodes.length === 0
        && node.getAttribute("usemap") === null && node.getAttribute("ismap") === null;
      if (node.tagName === "STYLE" && !textAllowed) return node.children.length === 0;
      const isTextRoot = node === heading || node === link;
      if (!isTextRoot && (textAllowed ? !inlineTags.has(node.tagName) : node !== hero && node.tagName !== "DIV")) return false;
      return Array.from(node.childNodes).every((child) => visit(child, textAllowed || isTextRoot));
    }
    // CMS wrappers and style nodes stay untouched; only the known title and
    // return link may contain text, and the background owns the only image.
    return visit(hero);
  }

  function init() {
    const main = document.querySelector("main#page");
    const header = document.getElementById("header");
    const hero = main?.querySelector("section.page-section[data-section-id]");
    if (!main || !header || !hero || !document.documentElement || hero[ownerKey] || typeof MutationObserver !== "function") return;

    function inspect() {
      const pages = document.querySelectorAll("main#page"), headers = document.querySelectorAll("#header");
      if (window.location.pathname !== originalPath || pages.length !== 1 || pages[0] !== main
          || headers.length !== 1 || headers[0] !== header || !main.contains(hero)) return null;
      for (const id of ["species-output", "species-info", "species-taxonomy", "species-status"]) {
        const nodes = document.querySelectorAll("#" + id);
        if (nodes.length !== 1 || !main.contains(nodes[0]) || hero.contains(nodes[0])) return null;
      }
      if (main.querySelector("section.page-section[data-section-id]") !== hero) return null;
      const children = Array.from(hero.children);
      if (children.length !== 2 || !children[0].classList.contains("section-border")
          || !children[1].classList.contains("content-wrapper")) return null;
      const backgrounds = children[0].querySelectorAll(".section-background");
      const grids = children[1].querySelectorAll(".fluid-engine");
      if (backgrounds.length !== 1 || grids.length !== 1 || backgrounds[0].querySelector("video, iframe, form, button, a, p, input, select, textarea")) return null;
      const images = backgrounds[0].querySelectorAll("img");
      if (images.length !== 1 || !normalize(images[0].getAttribute("src") || images[0].getAttribute("data-src"))) return null;
      const blocks = Array.from(grids[0].children);
      if (blocks.length !== 2 || blocks.some((block) => !block.classList.contains("fe-block"))) return null;
      const [titleBlock, buttonBlock] = blocks;
      const titleContents = titleBlock.querySelectorAll(".sqs-html-content");
      const headings = titleBlock.querySelectorAll(headingSelector);
      if (titleBlock.querySelectorAll(".sqs-block-html").length !== 1 || titleContents.length !== 1
          || headings.length !== 1 || !["H1", "H2", "H3"].includes(headings[0].tagName)
          || !titleContents[0].contains(headings[0]) || !normalize(headings[0].textContent)
          || titleContents[0].children.length !== 1 || titleContents[0].children[0] !== headings[0]
          || normalize(titleContents[0].textContent) !== normalize(headings[0].textContent)
          || titleBlock.querySelector("img, a, p, button, form, iframe, input, select, textarea, video")) return null;
      const links = buttonBlock.querySelectorAll("a[href]");
      if (buttonBlock.querySelectorAll(".sqs-block-button").length !== 1 || links.length !== 1
          || !links[0].classList.contains("sqs-block-button-element")
          || normalize(links[0].textContent).toLocaleLowerCase("de") !== "zurück zur übersicht"
          || buttonBlock.querySelector(headingSelector) || buttonBlock.querySelector("img, p, button, form, iframe, input, select, textarea, video")) return null;
      let target;
      try { target = new URL(links[0].getAttribute("href"), document.baseURI); } catch { return null; }
      if (target.origin !== "https://www.fnwildlifetravel.de" || target.search || target.hash
          || target.pathname.replace(/\/$/, "") !== "/wildlife/" + region) return null;
      if (!knownContentOnly(hero, images[0], headings[0], links[0])) return null;
      return hero;
    }

    // An unfamiliar page receives neither layout attributes nor observers.
    if (!inspect()) return;
    let paused = true, frame = null;
    function apply() {
      if (paused) return;
      const valid = inspect();
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (!valid || !Number.isFinite(height) || height <= 0) {
        if (hero.getAttribute(markerName) === marker) hero.removeAttribute(markerName);
        return;
      }
      const value = height + "px";
      if (hero.style.getPropertyValue(heightName) !== value) hero.style.setProperty(heightName, value);
      if (hero.getAttribute(markerName) !== marker) hero.setAttribute(markerName, marker);
    }
    function schedule() {
      if (paused || frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; apply(); });
    }
    const headerObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    const structureObserver = new MutationObserver((records) => {
      if (records.some((record) => record.type !== "attributes"
          || ![markerName, "style"].includes(record.attributeName))) schedule();
    });
    function connect() {
      if (!paused) return;
      paused = false;
      apply();
      headerObserver?.observe(header);
      structureObserver.observe(hero, {
        childList: true, subtree: true, characterData: true, attributes: true,
      });
      // Module removal, duplicate IDs and replaced page/header anchors can occur
      // outside the hero. Do not wait for a coincidental resize to revoke it.
      structureObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] });
      window.addEventListener("resize", schedule, { passive: true });
    }
    function pause() {
      paused = true;
      headerObserver?.disconnect();
      structureObserver.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== null) { window.cancelAnimationFrame(frame); frame = null; }
    }
    hero[ownerKey] = { pause };
    header.querySelectorAll("img").forEach((image) => {
      if (!image.complete) image.addEventListener("load", schedule, { once: true });
    });
    document.fonts?.ready.then(schedule);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", () => { if (paused) connect(); });
    connect();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
