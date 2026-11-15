const fields = [
  "Wissenschaftlicher Name", "Deutscher Name", "Englischer Name", "Größe", "Gewicht", "Lebenserwartung",
  "Kategorie", "Status", "Trend", "Populationgröße", "Generationsdauer", "Assessment ID", "Letztes IUCN Update", "Daten abgerufen",
];

const unknownValues = new Set(["", "n/a", "na", "n.a.", "u", "unknown"]);
const optionalDetails = new Set(["Englischer Name", "Größe", "Gewicht", "Lebenserwartung"]);
const fieldsShownAsUnknown = new Set(["Populationgröße", "Generationsdauer", "Trend"]);

export function speciesGeneralSourceText(record) {
  return fields.filter((field) => String(record[field] ?? "").trim())
    .map((field) => `${field}: ${record[field]}`).join("\n");
}

export function mobileSpeciesGeneralText(record) {
  const lines = [];
  for (const field of fields) {
    let value = String(record[field] ?? "").trim();
    const unknown = unknownValues.has(value.toLowerCase());
    // Keep the website's distinction between optional measurements and IUCN
    // data that explicitly displays an unknown value.
    if (fieldsShownAsUnknown.has(field) && unknown) value = "Unbekannt";
    if (!value || (optionalDetails.has(field) && unknown)) continue;
    const label = field === "Populationgröße" ? "Populationsgröße" : field;
    lines.push(`${label}: ${value}`);
  }
  return lines.join("\n");
}
