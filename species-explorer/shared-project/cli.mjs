import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { createSharedProjectStore } from "./store.mjs";
import { createSharedProjectHttp } from "./http.mjs";

export async function main(args = process.argv.slice(2)) {
  const command = args.shift(), flags = new Map();
  for (let i = 0; i < args.length; i++) {
    if (["--confirm-local-storage", "--confirm-bootstrap"].includes(args[i])) flags.set(args[i], true);
    else if (["--db", "--port", "--config"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) flags.set(args[i], args[++i]);
    else throw new Error("Unbekanntes oder unvollständiges Argument.");
  }
  if (!["bootstrap", "serve"].includes(command) || !flags.has("--db") || !flags.has("--confirm-local-storage")) {
    throw new Error("Aufruf: cli.mjs bootstrap|serve --db <lokale SQLite-Datei> --confirm-local-storage [--confirm-bootstrap|--port <Port>].");
  }
  const store = createSharedProjectStore({ filename: flags.get("--db"), localStorageConfirmed: true });
  if (command === "bootstrap") {
    try {
      if (!flags.has("--confirm-bootstrap") || process.stdin.isTTY) throw new Error("Bootstrap benötigt --confirm-bootstrap und explizite JSON-Eingabe über stdin; keine Standardzugänge.");
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk;
        if (Buffer.byteLength(input) > 20000) throw new Error("Bootstrap-Eingabe zu groß.");
      }
      const data = JSON.parse(input);
      const result = await store.bootstrap({ confirmed: true, users: data.users });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally { store.close(); }
    return;
  }
  let adapter;
  try {
    let config = {};
    if (flags.has("--config")) {
      const filename = flags.get("--config");
      if (!path.isAbsolute(filename) || fs.lstatSync(filename).isSymbolicLink() || fs.statSync(filename).size > 10000) throw new Error("Unzulässige Dienstkonfiguration.");
      config = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (!config || typeof config !== "object" || Array.isArray(config)
        || Object.keys(config).some((key) => !["host", "port", "allowNetwork", "allowedHosts", "allowedOrigins"].includes(key))) {
        throw new Error("Unzulässige Dienstkonfiguration.");
      }
    }
    adapter = createSharedProjectHttp({ ...config, store, port: flags.has("--port") ? Number(flags.get("--port")) : config.port ?? 4317 });
    process.stdout.write(`${JSON.stringify({ listening: await adapter.listen(), externalPublication: false })}\n`);
  }
  catch (error) { store.close(); throw error; }
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await adapter.close();
    store.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write("Der Projektdienst konnte die Aktion nicht sicher abschließen. Konfiguration und Eingabe prüfen.\n"); process.exitCode = 1; });
}
