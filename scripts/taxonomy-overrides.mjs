export const EDITABLE_TAXONOMY_FIELDS = Object.freeze([
  Object.freeze({ key: "Kingdom", label: "Reich", optional: false }),
  Object.freeze({ key: "Phylum", label: "Stamm", optional: false }),
  Object.freeze({ key: "Subphylum", label: "Unterstamm", optional: true }),
  Object.freeze({ key: "Class", label: "Klasse", optional: false }),
  Object.freeze({ key: "Order", label: "Ordnung", optional: false }),
  Object.freeze({ key: "Family", label: "Familie", optional: false }),
]);

export function createEmptyTaxonomyOverrideRegistry() {
  return { version: 1, species: {} };
}

export function normalizeTaxonomyValue(value, { optional = false } = {}) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return optional ? "" : "n/a";
  if (text.toLocaleLowerCase("de") === "n/a") return optional ? "" : "n/a";
  return text
    .toLocaleLowerCase("de")
    .replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix, letter) => (
      `${prefix}${letter.toLocaleUpperCase("de")}`
    ));
}

export function normalizeTaxonomyFields(source = {}) {
  return Object.fromEntries(EDITABLE_TAXONOMY_FIELDS.map((field) => [
    field.key,
    normalizeTaxonomyValue(source?.[field.key], { optional: field.optional }),
  ]));
}

export function validateTaxonomyOverrideRegistry(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Taxonomie-Override-Register muss ein Objekt sein."];
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    issues.push("version muss eine positive Ganzzahl sein.");
  }
  if (!value.species || typeof value.species !== "object" || Array.isArray(value.species)) {
    issues.push("species muss ein Objekt sein.");
    return issues;
  }
  for (const [slug, entry] of Object.entries(value.species)) {
    if (!/^[a-z0-9]+$/i.test(slug)) issues.push(`Ungültiger Art-Slug: ${slug}.`);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`${slug} muss ein Objekt sein.`);
      continue;
    }
    for (const groupName of ["fields", "automaticFields"]) {
      const group = entry[groupName];
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        issues.push(`${slug}.${groupName} muss ein Objekt sein.`);
        continue;
      }
      for (const field of EDITABLE_TAXONOMY_FIELDS) {
        const fieldValue = group[field.key];
        if (typeof fieldValue !== "string") {
          issues.push(`${slug}.${groupName}.${field.key} muss eine Zeichenfolge sein.`);
        } else if (!field.optional && !fieldValue.trim()) {
          issues.push(`${slug}.${groupName}.${field.key} darf nicht leer sein.`);
        }
      }
    }
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      issues.push(`${slug}.reason muss eine nicht leere Zeichenfolge sein.`);
    }
    if (typeof entry.updatedAt !== "string" || !entry.updatedAt.trim()) {
      issues.push(`${slug}.updatedAt muss eine nicht leere Zeichenfolge sein.`);
    }
  }
  return issues;
}

export function applyTaxonomyOverride(entry, registry) {
  if (!entry || typeof entry !== "object") return entry;
  const slug = String(entry.URLSlug ?? "").trim().toLocaleLowerCase("de");
  const override = registry?.species?.[slug];
  return {
    ...entry,
    ...normalizeTaxonomyFields(override?.fields ?? entry),
  };
}

export function synchronizeAutomaticTaxonomyFields(entries, registry) {
  const nextRegistry = structuredClone(registry ?? createEmptyTaxonomyOverrideRegistry());
  nextRegistry.version = 1;
  nextRegistry.species ??= {};
  let changed = false;
  for (const entry of entries) {
    const slug = String(entry?.URLSlug ?? "").trim().toLocaleLowerCase("de");
    if (!slug || !nextRegistry.species[slug]) continue;
    const automaticFields = normalizeTaxonomyFields(entry);
    const previous = nextRegistry.species[slug].automaticFields ?? {};
    if (JSON.stringify(previous) !== JSON.stringify(automaticFields)) {
      nextRegistry.species[slug].automaticFields = automaticFields;
      changed = true;
    }
  }
  return { registry: nextRegistry, changed };
}
