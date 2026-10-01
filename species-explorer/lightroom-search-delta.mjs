// The incoming database uses the full export's projection. Only differing rows and
// FTS entries are written to a private copy of the previous, verified package.
const TABLES = ["package_info", "provider_release", "taxon", "taxon_status", "taxon_provider", "project_link", "hierarchy", "search_term"];

export function applyLightroomSearchDelta(database, incomingPath, { signal, scoped = false, onProgress = () => {} } = {}) {
  database.prepare("ATTACH DATABASE ? AS incoming").run(incomingPath);
  const withinScope = (table, alias = table) => scoped && !["package_info", "provider_release"].includes(table)
    ? ` AND ${alias}.master_taxon_id IN (SELECT master_taxon_id FROM incoming.delta_scope)` : "";
  let transaction = false;
  try {
    database.exec("PRAGMA foreign_keys=ON; PRAGMA temp_store=FILE; BEGIN IMMEDIATE");
    transaction = true;
    // Search row IDs are local storage details. Preserve them for equal terms,
    // even when a new master allocated its search IDs in a different order.
    const termColumns = database.prepare("PRAGMA main.table_info(search_term)").all()
      .map((row) => row.name).filter((name) => name !== "search_term_id");
    const fields = termColumns.join(", ");
    const equals = termColumns.map((name) => `old.${name} IS fresh.${name}`).join(" AND ");
    database.exec(`
      CREATE TEMP TABLE same_term_ids (search_term_id INTEGER PRIMARY KEY);
      INSERT INTO same_term_ids
      SELECT fresh.search_term_id FROM incoming.search_term fresh
      JOIN main.search_term old ON old.search_term_id=fresh.search_term_id
      WHERE ${equals};
      CREATE TEMP TABLE mapped_terms AS
      WITH old AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY ${fields} ORDER BY search_term_id) occurrence FROM main.search_term
        WHERE search_term_id NOT IN (SELECT search_term_id FROM same_term_ids)
          ${withinScope("search_term")}
      ), fresh AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY ${fields} ORDER BY search_term_id) occurrence FROM incoming.search_term
        WHERE search_term_id NOT IN (SELECT search_term_id FROM same_term_ids)
      )
      SELECT COALESCE(old.search_term_id,
        (SELECT COALESCE(MAX(search_term_id), 0) FROM main.search_term) + ROW_NUMBER() OVER (ORDER BY fresh.search_term_id)) search_term_id,
        ${termColumns.map((name) => `fresh.${name}`).join(", ")}
      FROM fresh LEFT JOIN old ON ${equals} AND old.occurrence = fresh.occurrence
      UNION ALL
      SELECT * FROM incoming.search_term WHERE search_term_id IN (SELECT search_term_id FROM same_term_ids);
      DELETE FROM incoming.search_term;
      INSERT INTO incoming.search_term SELECT * FROM mapped_terms;
      DROP TABLE mapped_terms;
      DROP TABLE same_term_ids;
    `);
    const changes = {};
    for (const table of TABLES) {
      signal?.throwIfAborted();
      const columns = database.prepare(`PRAGMA main.table_info(${table})`).all();
      const keys = columns.filter((column) => column.pk);
      const match = keys.map(({ name }) => `previous.${name} IS desired.${name}`).join(" AND ");
      const equal = columns.filter((column) => !column.pk).map(({ name }) => `previous.${name} IS desired.${name}`).join(" AND ");
      // Seek by the primary key instead of sorting both complete row sets twice.
      // IS preserves the EXCEPT contract for NULLs; every remaining field counts.
      database.exec(`
        CREATE TEMP TABLE added_${table} AS SELECT * FROM incoming.${table} desired
          WHERE NOT EXISTS (SELECT 1 FROM main.${table} previous WHERE ${match} AND ${equal});
        CREATE TEMP TABLE removed_${table} AS SELECT * FROM main.${table} previous
          WHERE NOT EXISTS (SELECT 1 FROM incoming.${table} desired WHERE ${match} AND ${equal})
            ${withinScope(table, "previous")};
      `);
      changes[table] = {
        written: Number(database.prepare(`SELECT COUNT(*) count FROM added_${table}`).get().count),
        removedOrReplaced: Number(database.prepare(`SELECT COUNT(*) count FROM removed_${table}`).get().count),
      };
    }
    signal?.throwIfAborted();
    database.exec(`
      INSERT INTO search_fts(search_fts, rowid, term, normalized_term, folded_term, german_key)
      SELECT 'delete', search_term_id, term, normalized_term, folded_term, german_key FROM removed_search_term;
    `);
    // Remove child rows before parents; updates of existing parents use UPSERT,
    // never REPLACE (which would cascade-delete otherwise unchanged children).
    for (const table of [...TABLES].reverse()) {
      const keys = database.prepare(`PRAGMA main.table_info(${table})`).all().filter((row) => row.pk).map((row) => row.name);
      const match = keys.map((key) => `desired.${key} IS main.${table}.${key}`).join(" AND ");
      database.exec(`DELETE FROM main.${table} WHERE NOT EXISTS (SELECT 1 FROM incoming.${table} desired WHERE ${match})
        ${withinScope(table, `main.${table}`)}`);
    }
    for (const table of TABLES) {
      signal?.throwIfAborted();
      const columns = database.prepare(`PRAGMA main.table_info(${table})`).all();
      const keys = columns.filter((row) => row.pk).sort((a, b) => a.pk - b.pk).map((row) => row.name);
      const values = columns.filter((row) => !row.pk).map((row) => `${row.name}=excluded.${row.name}`);
      database.exec(`INSERT INTO main.${table} SELECT * FROM added_${table} WHERE true
        ON CONFLICT (${keys.join(", ")}) DO UPDATE SET ${values.join(", ")}`);
      onProgress({ table, ...changes[table] });
    }
    database.exec(`
      INSERT INTO search_fts(rowid, term, normalized_term, folded_term, german_key)
      SELECT search_term_id, term, normalized_term, folded_term, german_key FROM added_search_term;
      INSERT INTO search_fts(search_fts, rank) VALUES('integrity-check', 1);
      COMMIT;
    `);
    transaction = false;
    return { mode: "incremental", changes };
  } catch (error) {
    if (transaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    for (const table of TABLES) database.exec(`DROP TABLE IF EXISTS temp.added_${table}; DROP TABLE IF EXISTS temp.removed_${table};`);
    database.exec("DROP TABLE IF EXISTS temp.mapped_terms; DROP TABLE IF EXISTS temp.same_term_ids; DETACH DATABASE incoming");
  }
}
