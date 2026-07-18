export function synchronizeManualMapDocumentation(
  markdown,
  assetOverrides,
  updatedDate = new Date().toISOString().slice(0, 10),
) {
  const lines = markdown.split(/\r?\n/);
  const manualMapRow = (safeName, map) => {
    const cell = (value) => String(value ?? "").replace(/\|/g, "/").trim();
    const source = map.source
      ? `[Quelle](${String(map.source).replace(/\|/g, "%7C").replace(/\)/g, "%29")})`
      : "Manuell über Arten-Explorer gepflegt.";
    return `| ${cell(map.germanName || safeName)} | ${cell(safeName)} | \`species-assets/${safeName}/map.jpg\` | ${cell(map.reason || "Manuell gepflegte Karte.")} | ${source} | ${updatedDate} | erledigt/geprueft |`;
  };
  const filtered = [];
  for (const line of lines) {
    const match = line.match(
      /^\|\s*[^|]+\|\s*([^|]+?)\s*\|\s*`species-assets\/([^/]+)\/map\.jpg`/,
    );
    if (!match) {
      filtered.push(line);
      continue;
    }
    const safeName = match[2].trim();
    const map = assetOverrides.assets?.[safeName]?.map;
    if (!map || map.manual === false) continue;
    filtered.push(map?.manual === true && (map.source || map.importedAt)
      ? manualMapRow(safeName, map)
      : line);
  }
  const documented = new Set();
  for (const line of filtered) {
    const match = line.match(/`species-assets\/([^/]+)\/map\.jpg`/);
    if (match) documented.add(match[1]);
  }
  const addedRows = Object.entries(assetOverrides.assets ?? {})
    .filter(([safeName, entry]) => entry?.map?.manual === true && !documented.has(safeName))
    .sort(([left], [right]) => left.localeCompare(right, "de"))
    .map(([safeName, entry]) => manualMapRow(safeName, entry.map));
  if (addedRows.length) {
    const rulesIndex = filtered.findIndex((line) => line.trim() === "## Pflege-Regeln");
    const insertAt = rulesIndex >= 0 ? rulesIndex : filtered.length;
    const prefix = filtered.slice(0, insertAt);
    const suffix = filtered.slice(insertAt);
    while (prefix.length && prefix.at(-1) === "") prefix.pop();
    filtered.splice(0, filtered.length, ...prefix, ...addedRows, "", ...suffix);
  }
  const remainingCount = filtered.filter((line) => (
    /^\|\s*[^|]+\|\s*[^|]+\|\s*`species-assets\/[^/]+\/map\.jpg`/.test(line)
  )).length;
  const hadFinalNewline = markdown.endsWith("\n");
  const mapLabel = remainingCount === 1 ? "Karte" : "Karten";
  const next = filtered
    .join("\n")
    .replace(/^Stand:\s*\d{4}-\d{2}-\d{2}$/m, `Stand: ${updatedDate}`)
    .replace(
      /Aktuell sind .*? Karten? als manuell gepflegt dokumentiert\./,
      `Aktuell sind ${remainingCount} ${mapLabel} als manuell gepflegt dokumentiert.`,
    );
  return hadFinalNewline && !next.endsWith("\n") ? `${next}\n` : next;
}
