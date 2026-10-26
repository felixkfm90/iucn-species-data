(function initializeWebsitePages(global) {
  "use strict";

  function pagePresentation(slug, snapshot) {
    const urls = [];
    for (const page of snapshot?.pages || []) {
      if (page?.slug !== slug) continue;
      try {
        const url = new URL(page.url);
        if (url.origin !== "https://www.fnwildlifetravel.de" || url.username || url.password || url.search || url.hash) continue;
        const match = /^\/wildlife\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(url.pathname);
        if (!match || match[2] !== slug) continue;
        if (!urls.some((entry) => entry.url === url.href)) urls.push({ url: url.href, area: match[1] });
      } catch { /* Only confirmed, safe FN addresses become links. */ }
    }
    return { status: urls.length ? "found" : snapshot?.status === "ready" ? "missing"
      : snapshot ? "unknown" : "checking", urls,
    checkedAt: snapshot?.checkedAt || "", stale: snapshot?.status === "unavailable" };
  }

  function checkedLabel(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString("de-DE", {
      dateStyle: "short", timeStyle: "short" }) : "";
  }

  function renderWebsiteStatus(slug, snapshot, { escapeHtml } = {}) {
    const page = pagePresentation(slug, snapshot), checked = checkedLabel(page.checkedAt);
    const areas = { "heimische-tierwelt": "Heimische Tierwelt", costarica: "Costa Rica", island: "Island",
      afrika: "Afrika", asien: "Asien" };
    const label = page.status === "missing" ? "Art noch nicht auf der FN-Website veröffentlicht"
      : page.status === "checking" ? "FN-Website wird geprüft …" : "FN-Website derzeit nicht prüfbar";
    return page.status === "found"
      ? `${page.urls.map(({ url, area }) => `<a class="website-page-link" href="${escapeHtml(url)}"
          target="_blank" rel="noopener noreferrer" title="${escapeHtml(`FN-Artseite öffnen${checked ? ` · Geprüft ${checked}` : ""}`)}">
          ${escapeHtml(page.urls.length === 1 ? "Auf FN-Website öffnen ↗" : `FN: ${areas[area] || area} ↗`)}</a>`).join("")}
        ${page.stale ? `<span class="website-page-note">Letzter bestätigter Stand ${escapeHtml(checked)} · Prüfung derzeit nicht möglich</span>` : ""}`
      : `<span class="website-page-note${page.status === "missing" ? " website-page-missing" : ""}"
          title="${escapeHtml(page.status === "missing" ? `In der öffentlichen Seitenliste nicht vorhanden. Geprüft ${checked}. Unveröffentlichte Entwürfe sind nicht erkennbar.`
            : "Eine fehlgeschlagene Prüfung bedeutet nicht, dass die Artseite fehlt.")}">${escapeHtml(label)}</span>`;
  }

  function renderWebsiteHint(slug, snapshot, { escapeHtml } = {}) {
    return pagePresentation(slug, snapshot).status === "missing"
      ? `<h3 class="section-title">Website-Hinweis</h3><p>${escapeHtml("Für diese Art ist noch keine öffentliche FN-Artseite vorhanden. Sobald sie veröffentlicht ist, wird sie automatisch verknüpft.")}</p>` : "";
  }

  function createWebsitePagesController({ state, elements, fetchJson, escapeHtml, onChange = () => {},
    documentRef = global.document, setTimeoutImpl = global.setTimeout?.bind(global),
    clearTimeoutImpl = global.clearTimeout?.bind(global), intervalMs = 5 * 60 * 1000 } = {}) {
    let inflight = null, timer = null, started = false;
    const renderOptions = { escapeHtml };

    function renderOverview() {
      const snapshot = state.websitePagesSnapshot;
      const missing = state.species.filter((entry) => pagePresentation(entry.id, snapshot).status === "missing").length;
      const label = !snapshot ? "FN-Website wird geprüft …" : snapshot.status === "unavailable"
        ? "FN-Website derzeit nicht prüfbar. Bereits bestätigte Links bleiben sichtbar."
        : missing ? `FN-Website: ${missing} Art${missing === 1 ? "" : "en"} noch nicht veröffentlicht.`
          : "FN-Website: Alle vorhandenen Arten sind verknüpft.";
      if (elements.websitePagesSummary) elements.websitePagesSummary.textContent = label;
      if (elements.websitePagesCheck) {
        elements.websitePagesCheck.disabled = Boolean(state.websitePagesChecking);
        elements.websitePagesCheck.textContent = state.websitePagesChecking ? "Website wird geprüft …" : "Website prüfen";
      }
    }

    function render() {
      const slot = elements.detailPanel?.querySelector("[data-species-website]");
      if (slot) {
        const html = renderWebsiteStatus(slot.dataset.speciesWebsite, state.websitePagesSnapshot, renderOptions);
        if (slot.innerHTML !== html) {
          const focusedHref = slot.contains?.(documentRef?.activeElement) ? documentRef.activeElement?.getAttribute?.("href") : "";
          slot.innerHTML = html;
          if (focusedHref) [...slot.querySelectorAll("a")].find((link) => link.getAttribute("href") === focusedHref)?.focus?.({ preventScroll: true });
        }
      }
      const hint = elements.detailPanel?.querySelector("[data-species-website-hint]");
      if (hint) {
        hint.innerHTML = renderWebsiteHint(hint.dataset.speciesWebsiteHint, state.websitePagesSnapshot, renderOptions);
        hint.hidden = !hint.innerHTML;
      }
      renderOverview();
    }

    async function refresh({ refresh = false } = {}) {
      if (inflight) return inflight;
      state.websitePagesChecking = true;
      renderOverview();
      inflight = (async () => {
        try {
          const snapshot = await fetchJson(`/api/website/species-pages${refresh ? "?refresh=1" : ""}`);
          if (!["ready", "unavailable"].includes(snapshot?.status) || !Array.isArray(snapshot.pages)) {
            throw new Error("Ungültige Website-Prüfung");
          }
          state.websitePagesSnapshot = snapshot.status === "unavailable" ? {
            ...snapshot, checkedAt: snapshot.checkedAt || state.websitePagesSnapshot?.checkedAt || "",
            pages: [...new Map([...(state.websitePagesSnapshot?.pages || []), ...snapshot.pages]
              .map((page) => [JSON.stringify([page?.slug, page?.url]), page])).values()],
          } : snapshot;
        } catch {
          state.websitePagesSnapshot = { ...state.websitePagesSnapshot, status: "unavailable",
            pages: state.websitePagesSnapshot?.pages || [] };
        } finally {
          state.websitePagesChecking = false;
          render();
          onChange();
          clearTimeoutImpl?.(timer);
          if (started) timer = setTimeoutImpl?.(() => { void refreshAutomatically(); }, intervalMs);
        }
        return state.websitePagesSnapshot;
      })();
      try { return await inflight; }
      finally { inflight = null; }
    }

    const refreshAutomatically = () => refresh();
    function start() {
      if (started) return inflight;
      started = true;
      elements.websitePagesCheck?.addEventListener("click", () => { void refresh({ refresh: true }); });
      elements.reloadButton?.addEventListener("click", () => { void refresh({ refresh: true }); });
      global.addEventListener?.("beforeunload", stop);
      return refresh();
    }
    function stop() { started = false; clearTimeoutImpl?.(timer); }
    return Object.freeze({ start, stop, refresh, render, renderOverview });
  }

  global.SpeciesExplorerWebsitePages = Object.freeze({ pagePresentation, renderWebsiteStatus,
    renderWebsiteHint, createWebsitePagesController });
})(globalThis);
