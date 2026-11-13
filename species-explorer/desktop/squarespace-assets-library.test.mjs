import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";
import { uploadSquarespaceLibraryImage } from "./squarespace-assets-library.mjs";

const libraryUrl = "https://vanilla-gerbil-jwnp.squarespace.com/config/asset-library";
const cdn = "https://images.squarespace-cdn.com";
const library = "67556be0338df718ea064210", cmsAssetId = "96379ea8-ec7f-45b3-bbbe-0b1f70c6357e";
const pageId = "6ae89f789cf13b0c388e4ccf", targetPath = "/wildlife/heimische-tierwelt/pruefart";
const fileName = "fn-a1b2c3d4e5f6a1b2c3d4e5f6-1.png";
const approved = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlQLn8AAAAASUVORK5CYII=", "base64");
const failed = { code: "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED", statusCode: 409 };

function fixture(mode = "ready") {
  let query = "", focused = false, searches = 0, uploads = 0, epoch = 100, reads = 0, starts = 0, authorized = true;
  const events = [], approvals = [], keys = [];
  const binding = createCmsDispatchBinding({ projectId: "project-fixture", attemptId: "attempt-fixture", dispatchId: "dispatch-fixture",
    planHash: "a".repeat(64), targetPath });
  const opts = { fileName, bytes: Buffer.from(approved), pageId, dispatchBinding: binding, waitMs: 1, timeoutMs: 150,
    image: { id: "usage-1", assetId: "asset-1", order: 0, mimeType: "image/png", bytes: approved.length,
      sha256: createHash("sha256").update(approved).digest("hex") },
    assertWritable: async scope => { approvals.push(scope); return authorized; },
  };
  const top = { async executeJavaScript(code) {
    const request = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    assert.equal(request.fileName, fileName);
    switch (request.operation) {
      case "start": return mode === "unknown-root" || query || (mode === "loading-root" && ++starts === 1) ? null : { epoch };
      case "focus-search": {
        if (request.epoch !== epoch || request.previousQuery !== query) return false;
        focused = true;
        return true;
      }
      case "search-ready": return request.epoch === epoch && focused && query === fileName;
      case "submit-file":
        assert.equal(request.epoch, epoch);
        assert.equal(searches, 1);
        assert.deepEqual(request.file, { name: fileName, type: "image/png", size: approved.length, base64: approved.toString("base64") });
        if (mode === "field-changed") return false;
        events.push("upload");
        uploads++;
        if (mode === "document-reloaded") epoch++;
        if (mode === "refreshed") focused = false;
        return true;
      case undefined: {
        if (!searches || query !== fileName || mode === "no-baseline") return null;
        reads++;
        if (mode === "revoked" && reads === 4) authorized = false;
        const match = mode === "collision" || uploads && !["unconfirmed", "refreshed"].includes(mode) || uploads && searches > 1 && mode === "refreshed";
        const id = mode === "foreign-library" ? "f".repeat(24) : library;
        return { epoch, status: match ? "match" : "empty", fileName, uploadReady: mode !== "file-not-ready",
          sourceUrl: match ? `${cdn}/content/${id}/${cmsAssetId}/${fileName}?content-type=image%2Fpng` : null };
      }
      default: throw new Error(`Unexpected Assets operation: ${request.operation}`);
    }
  } };
  const contents = { getURL: () => libraryUrl, isDestroyed: () => false, mainFrame: top, insertText(value) {
    assert.equal(focused, true);
    query = value;
    events.push("type");
  }, sendInputEvent({ type, keyCode }) {
    assert.equal(keyCode, "Enter");
    keys.push(type);
    if (type === "char") {
      assert.equal(focused, true);
      assert.equal(query, fileName);
      searches++;
      events.push("search");
    }
  } };
  return { contents, events, approvals, keys, opts, run: options => uploadSquarespaceLibraryImage(contents, { ...opts, ...options }) };
}

test("die Bibliothek erhält die geprüfte Datei einmal und bestätigt exakt die neue FN-Bildadresse", async () => {
  for (const mode of ["ready", "loading-root", "refreshed"]) {
    const f = fixture(mode);
    const assertWritable = f.opts.assertWritable;
    const proof = await f.run({ assertWritable: async scope => {
      // Once the workflow starts, an outside mutation of the caller's buffer cannot replace the selected bytes.
      f.opts.bytes.fill(0);
      return assertWritable(scope);
    } });
    assert.deepEqual(proof, { fileName, assetId: cmsAssetId, sourceUrl: `${cdn}/content/v1/${library}/${cmsAssetId}/${fileName}` });
    assert.deepEqual(f.events, ["type", "search", "upload", ...(mode === "refreshed" ? ["search"] : [])]);
    const enter = ["keyDown", "char", "keyUp"];
    assert.deepEqual(f.keys, mode === "refreshed" ? [...enter, ...enter] : enter);
    assert.ok(f.approvals.length > 3);
    assert.ok(f.approvals.every(scope => scope.pageId === pageId && scope.path === targetPath
      && scope.usageId === "usage-1" && scope.assetId === "asset-1"));
  }
});

test("vor der Dateiübergabe stoppen falsche Bytes, ein vorhandener Name, unklare Auswahl und entzogene Freigabe", async () => {
  for (const [mode, events] of [
    ["unknown-root", []], ["collision", ["type", "search"]], ["file-not-ready", ["type", "search"]],
    ["no-baseline", ["type", "search"]], ["revoked", ["type", "search"]], ["field-changed", ["type", "search"]],
  ]) {
    const f = fixture(mode);
    await assert.rejects(f.run(), failed, mode);
    assert.deepEqual(f.events, events, mode);
  }
  const altered = fixture();
  await assert.rejects(altered.run({ bytes: Buffer.alloc(approved.length) }), failed);
  await assert.rejects(altered.run({ image: { ...altered.opts.image, order: 1 } }), failed);
  assert.deepEqual(altered.events, []);
});

test("ein unklarer Upload oder ein anderes Dokument lässt dieselbe Bildverwendung ohne erneute Dateiübergabe offen", async () => {
  for (const mode of ["unconfirmed", "document-reloaded", "foreign-library"]) {
    const f = fixture(mode);
    await assert.rejects(f.run(), failed);
    assert.equal(f.events.filter(event => event === "upload").length, 1);
    const otherWindow = fixture();
    await assert.rejects(otherWindow.run({ dispatchBinding: f.opts.dispatchBinding }), failed);
    assert.deepEqual(otherWindow.events, []);
  }
});

test("ein Abbruch nach der Dateinamenssuche verhindert jede Dateiübergabe", async () => {
  const f = fixture();
  const abort = new AbortController(), reason = new Error("Abgebrochen");
  const assertWritable = f.opts.assertWritable;
  await assert.rejects(f.run({ signal: abort.signal, assertWritable: async scope => {
    if (f.events.includes("search")) abort.abort(reason);
    return assertWritable(scope);
  } }), error => error === reason);
  assert.deepEqual(f.events, ["type", "search"]);
});
