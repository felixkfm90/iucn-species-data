import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";

import { parseCsvRows } from "./taxonomy-csv.mjs";

async function collect(source, options) {
  const rows = [];
  for await (const row of parseCsvRows(source, options)) rows.push(row);
  return rows;
}

test("CSV-Parser streamt Kopfzeilen, Umlaute, Kommas und Zeilenumbrüche", async () => {
  const source = Readable.from([
    Buffer.from("\uFEFFid,name,note\r\n1,Gepard,", "utf8"),
    Buffer.from('"Schnell, aber\nruhig"\r\n2,"Gabel""racke",ok', "utf8"),
  ]);
  assert.deepEqual(await collect(source), [
    { id: "1", name: "Gepard", note: "Schnell, aber\nruhig" },
    { id: "2", name: 'Gabel"racke', note: "ok" },
  ]);
});

test("CSV-Parser kann rohe Zeilen ohne Kopfzeile liefern", async () => {
  const rows = await collect(Readable.from(["a;b\n1;2\n"]), {
    delimiter: ";",
    headers: false,
  });
  assert.deepEqual(rows, [["a", "b"], ["1", "2"]]);
});

test("CSV-Parser lehnt nicht geschlossene Felder ab", async () => {
  await assert.rejects(
    collect(Readable.from(['id,name\n1,"offen'])),
    /Nicht geschlossenes CSV-Feld/,
  );
});
