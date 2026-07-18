export function normalizeLicenseUrl(value) {
  const license = String(value ?? "").trim();
  if (license.startsWith("//")) return `https:${license}`;
  return license;
}

export function isNcLicense(value) {
  const license = String(value ?? "").toLowerCase();
  return license.includes("by-nc")
    || license.includes("noncommercial")
    || license.includes("non-commercial");
}

export function isOpenCommercialLicense(value) {
  const license = String(value ?? "").toLowerCase();
  if (!license || isNcLicense(license)) return false;

  return license.includes("creativecommons.org/licenses/by/")
    || license.includes("creativecommons.org/licenses/by-sa/")
    || license.includes("creativecommons.org/licenses/by-nd/")
    || license.includes("creativecommons.org/publicdomain/zero/")
    || license.includes("public-domain")
    || license.includes("cc0")
    || /\bcc-by(-sa|-nd)?\b/.test(license);
}

export function inatLicenseUrl(value) {
  const code = String(value ?? "").toLowerCase().replace(/^cc-/, "");
  if (!code) return "";
  if (code === "cc0" || code === "public-domain") {
    return "https://creativecommons.org/publicdomain/zero/1.0/";
  }
  if (code === "by") return "https://creativecommons.org/licenses/by/4.0/";
  if (code === "by-sa") return "https://creativecommons.org/licenses/by-sa/4.0/";
  if (code === "by-nd") return "https://creativecommons.org/licenses/by-nd/4.0/";
  return String(value ?? "");
}
