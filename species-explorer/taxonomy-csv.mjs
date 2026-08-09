import fs from "node:fs";

const DEFAULT_MAX_FIELD_LENGTH = 4 * 1024 * 1024;
const DEFAULT_MAX_COLUMNS = 256;

function cleanHeader(value, index) {
  const header = String(value ?? "").replace(/^\uFEFF/, "").trim();
  return header || `column_${index + 1}`;
}

function rowObject(headers, values) {
  const result = {};
  for (let index = 0; index < headers.length; index += 1) {
    result[headers[index]] = values[index] ?? "";
  }
  return result;
}

/**
 * Streamt RFC-4180-kompatible CSV-Zeilen. Gequotete Zeilenumbrüche und
 * doppelte Anführungszeichen werden unterstützt, ohne die gesamte Datei in
 * den Arbeitsspeicher zu laden.
 */
export async function* parseCsvRows(source, {
  delimiter = ",",
  headers = true,
  skipEmptyRows = true,
  maxFieldLength = DEFAULT_MAX_FIELD_LENGTH,
  maxColumns = DEFAULT_MAX_COLUMNS,
} = {}) {
  if (!source || typeof source[Symbol.asyncIterator] !== "function") {
    throw new TypeError("Eine asynchron lesbare CSV-Quelle ist erforderlich.");
  }
  if (typeof delimiter !== "string" || delimiter.length !== 1) {
    throw new TypeError("Das CSV-Trennzeichen muss genau ein Zeichen lang sein.");
  }

  const decoder = new TextDecoder("utf-8");
  let field = "";
  let row = [];
  let inQuotes = false;
  let quotePending = false;
  let skipNextLineFeed = false;
  let headerNames = null;
  let rowNumber = 0;

  const append = (character) => {
    field += character;
    if (field.length > maxFieldLength) {
      throw new Error(`CSV-Feld in Zeile ${rowNumber + 1} überschreitet das Sicherheitslimit.`);
    }
  };
  const pushField = () => {
    row.push(field);
    field = "";
    if (row.length > maxColumns) {
      throw new Error(`CSV-Zeile ${rowNumber + 1} besitzt zu viele Spalten.`);
    }
  };
  const finishRow = () => {
    pushField();
    rowNumber += 1;
    const values = row;
    row = [];
    if (skipEmptyRows && values.every((value) => value === "")) return null;
    if (headers && !headerNames) {
      headerNames = values.map(cleanHeader);
      if (new Set(headerNames).size !== headerNames.length) {
        throw new Error("Die CSV-Kopfzeile enthält doppelte Spaltennamen.");
      }
      return null;
    }
    return headers ? rowObject(headerNames, values) : values;
  };

  const processText = function* processText(text) {
    for (let index = 0; index < text.length; index += 1) {
      let character = text[index];
      if (skipNextLineFeed) {
        skipNextLineFeed = false;
        if (character === "\n") continue;
      }
      if (quotePending) {
        quotePending = false;
        if (character === '"') {
          append('"');
          continue;
        }
        inQuotes = false;
        // Das aktuelle Zeichen gehört bereits wieder zur normalen CSV-Syntax.
      }
      if (inQuotes) {
        if (character === '"') quotePending = true;
        else append(character);
        continue;
      }
      if (character === '"' && field.length === 0) {
        inQuotes = true;
        continue;
      }
      if (character === delimiter) {
        pushField();
        continue;
      }
      if (character === "\r" || character === "\n") {
        if (character === "\r") skipNextLineFeed = true;
        const completed = finishRow();
        if (completed) yield completed;
        continue;
      }
      append(character);
    }
  };

  for await (const chunk of source) {
    const text = typeof chunk === "string"
      ? chunk
      : decoder.decode(chunk, { stream: true });
    yield* processText(text);
  }
  const tail = decoder.decode();
  if (tail) yield* processText(tail);
  if (quotePending) {
    quotePending = false;
    inQuotes = false;
  }
  if (inQuotes) throw new Error(`Nicht geschlossenes CSV-Feld in Zeile ${rowNumber + 1}.`);
  if (field || row.length) {
    const completed = finishRow();
    if (completed) yield completed;
  }
}

export function readCsvFile(filePath, options = {}) {
  return parseCsvRows(fs.createReadStream(filePath), options);
}
