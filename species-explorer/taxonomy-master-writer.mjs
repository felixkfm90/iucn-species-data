// Candidate-local statement cache. Only compiled SQL is retained, never values,
// query results or validation decisions. Model checks and SQLite constraints
// still run for every call. The caller owns transactions and the connection.
export function createMasterWriter(database) {
  const statements = new Map();
  return {
    prepare(sql) {
      if (!statements.has(sql)) {
        const statement = database.prepare(sql);
        // Bound retention even if a future caller starts using dynamic SQL.
        if (statements.size >= 64) statements.clear();
        statements.set(sql, statement);
      }
      return statements.get(sql);
    },
    exec(sql) { return database.exec(sql); },
  };
}
