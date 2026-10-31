import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { tmpdir, assertTestTempPath, closeEmptyTestTempSession } from "../../scripts/test-temp.mjs";
import { createSharedProjectStore } from "./store.mjs";

export function fixture() {
  const root = assertTestTempPath(path.join(tmpdir(), `shared-${randomUUID().slice(0, 8)}`));
  fs.mkdirSync(root);
  const filename = path.join(root, "project.sqlite"), stores = [];
  const password = `Synthetic-${randomBytes(24).toString("hex")}`;
  function open(options = {}) {
    const store = createSharedProjectStore({ filename, localStorageConfirmed: true, ...options });
    stores.push(store); return store;
  }
  return { root, filename, password, open,
    async initialized(options = {}) {
      const store = open(options);
      await store.bootstrap({ confirmed: true, users: [
        { username: "fixture-admin-a", displayName: "Synthetic A", password },
        { username: "fixture-admin-b", displayName: "Synthetic B", password }
      ] });
      const a = await store.login({ username: "fixture-admin-a", password });
      const b = await store.login({ username: "fixture-admin-b", password });
      return { store, a, b };
    },
    cleanup() {
      for (const store of stores) try { store.close(); } catch { /* explicitly closed by restart test */ }
      assertTestTempPath(root);
      fs.rmSync(root, { recursive: true });
      closeEmptyTestTempSession();
    }
  };
}

export function species(id = "fixture-owl", text = "Synthetic species text") {
  return { id, scientificName: "Strix fixture", commonName: "Testkauz", taxonomy: [{ rank: "family", name: "Strigidae" }],
    sections: [{ id: "description", title: "Beschreibung", text, intentionallyEmpty: false }],
    media: { sounds: [], gallery: [] } };
}

export function page(title = "Synthetic page") { return { title, text: "Synthetic travel description" }; }
