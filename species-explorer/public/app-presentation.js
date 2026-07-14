(function initializeSpeciesExplorerPresentation(global) {
  "use strict";

  const IUCN_STATUS_LABELS = Object.freeze({
    NE: "Nicht bewertet",
    DD: "Ungenügende Datengrundlage",
    LC: "Nicht gefährdet",
    NT: "Potenziell gefährdet",
    VU: "Gefährdet",
    EN: "Stark gefährdet",
    CR: "Vom Aussterben bedroht",
    EW: "In der Natur ausgestorben",
    EX: "Ausgestorben",
  });
  const IUCN_STATUS_ICON_CODES = new Set(["DD", "LC", "NT", "VU", "EN", "CR", "EW", "EX"]);
  const IUCN_TREND_ICON_FILES = Object.freeze({
    abnehmend: "abnehmend.png",
    stabil: "stabil.png",
    zunehmend: "zunehmend.png",
    unbekannt: "nodata.png",
    "n/a": "nodata.png",
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function formatDate(value) {
    if (!value) return "Kein Reportdatum";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : `Report ${new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatIucnFetchDate(value) {
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value || "Unbekannt";
  }

  function formatIucnStatus(status) {
    const code = String(status ?? "").trim();
    return IUCN_STATUS_LABELS[code] ? `${IUCN_STATUS_LABELS[code]} (${code})` : code;
  }

  function assetStatusText(asset = {}) {
    if (asset.stale) return `Veraltet · ${asset.staleReason || "Hash stimmt nicht überein"}`;
    if (!asset.exists) return "Fehlt";
    const parts = ["Vorhanden"];
    if (asset.hashVerified) parts.push("Soundhash geprüft");
    if (asset.manuallyAdded) parts.push("manuell hinzugefügt");
    parts.push(formatBytes(asset.bytes));
    return parts.join(" · ");
  }

  function backupRetentionText(result) {
    const retention = result?.backupRetention;
    if (!retention) return "";
    return ` Backupbestand: ${retention.kept} Datei(en)`
      + `${retention.removed ? `, ${retention.removed} alte entfernt` : ""}.`;
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function trustedDataValue(html) {
    return { trustedHtml: true, html };
  }

  function dataRows(entries) {
    return entries.map(([label, value]) => `
      <div class="data-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${value?.trustedHtml === true ? value.html : escapeHtml(value)}</dd>
      </div>
    `).join("");
  }

  function formatSexSpecificDataValue(value) {
    const text = String(value ?? "").trim();
    const match = text.match(/^Männchen\s*:?\s*(.*?)\s*;?\s*Weibchen\s*:?\s*(.*)$/iu);
    if (!match) return text;
    return trustedDataValue(`
      <span class="sex-specific-value">
        <span>Männchen ${escapeHtml(match[1].trim())}</span>
        <span>Weibchen ${escapeHtml(match[2].trim())}</span>
      </span>
    `);
  }

  function iucnStatusIconUrl(status) {
    const code = String(status ?? "").trim().toUpperCase();
    return IUCN_STATUS_ICON_CODES.has(code)
      ? `/graphics/catagory/${encodeURIComponent(code)}.png`
      : "";
  }

  function iucnTrendIconUrl(trend) {
    const key = String(trend ?? "").trim().toLocaleLowerCase("de-DE");
    const fileName = IUCN_TREND_ICON_FILES[key];
    return fileName ? `/graphics/trend/${encodeURIComponent(fileName)}` : "";
  }

  function iconDataValue(value, iconUrl, iconClass = "") {
    const text = String(value ?? "").trim() || "Unbekannt";
    if (!iconUrl) return text;
    return trustedDataValue(`
      <span class="iucn-data-value">
        <img class="iucn-data-icon ${escapeHtml(iconClass)}" src="${escapeHtml(iconUrl)}" alt="">
        <span>${escapeHtml(text)}</span>
      </span>
    `);
  }

  function creditValue(credits, key) {
    return credits?.[key] || "Unbekannt";
  }

  function creditLink(credits, key, label) {
    const url = safeUrl(credits?.[key]);
    return url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      : escapeHtml("Nicht verfügbar");
  }

  function soundLicenseInfo({ isNc = null, license = "" } = {}) {
    const text = String(license ?? "").toLowerCase();
    const nc = isNc === true
      || text.includes("/by-nc")
      || text.includes("by-nc")
      || text.includes("noncommercial")
      || text.includes("non-commercial");
    if (nc) {
      return {
        label: "NC",
        title: "Nicht-kommerzielle Lizenz",
        className: "nc",
      };
    }
    if (isNc === false || text) {
      return {
        label: "frei",
        title: "Nicht als NC markiert",
        className: "free",
      };
    }
    return {
      label: "unbekannt",
      title: "Lizenzstatus unbekannt",
      className: "unknown",
    };
  }

  function soundLicenseBadgeHtml(info) {
    if (!info) return "";
    return `
      <span class="license-kind-badge ${escapeHtml(info.className)}" title="${escapeHtml(info.title)}">
        ${escapeHtml(info.label)}
      </span>
    `;
  }

  function creditLinkWithLicense(credits, key, label, licenseInfo) {
    return `
      <span class="credit-link-with-badge">
        ${creditLink(credits, key, label)}
        ${soundLicenseBadgeHtml(licenseInfo)}
      </span>
    `;
  }

  function cacheBustedUrl(url, key = Date.now()) {
    if (!url) return "";
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${encodeURIComponent(key)}`;
  }

  function assetVersionKey(asset = {}, ...extraParts) {
    return [
      asset.sha256,
      asset.actualSha256,
      asset.metadataSha256,
      asset.actualMetadataSha256,
      asset.soundSha256,
      asset.spectrogramSha256,
      asset.actualSoundSha256,
      asset.actualSpectrogramSha256,
      asset.generatedAt,
      asset.importedAt,
      asset.approvedAt,
      asset.bytes,
      ...extraParts,
    ].filter(Boolean).join("-");
  }

  function versionedAssetUrl(url, asset = {}, ...extraParts) {
    const key = assetVersionKey(asset, ...extraParts);
    return key ? cacheBustedUrl(url, key) : url;
  }

  global.SpeciesExplorerPresentation = Object.freeze({
    escapeHtml,
    safeUrl,
    formatDate,
    formatBytes,
    formatIucnFetchDate,
    formatIucnStatus,
    assetStatusText,
    backupRetentionText,
    pluralize,
    dataRows,
    trustedDataValue,
    formatSexSpecificDataValue,
    iucnStatusIconUrl,
    iucnTrendIconUrl,
    iconDataValue,
    creditValue,
    creditLink,
    soundLicenseInfo,
    soundLicenseBadgeHtml,
    creditLinkWithLicense,
    cacheBustedUrl,
    assetVersionKey,
    versionedAssetUrl,
  });
})(globalThis);
