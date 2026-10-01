import { Worker } from "node:worker_threads";

// Read-only full verification can overlap private export work. Its result is
// mandatory before publishing staging; a quick check is never the final proof.
export function validateLightroomBaseInBackground(searchRoot, { signal } = {}) {
  const worker = new Worker(new URL("./lightroom-search-validation-worker.mjs", import.meta.url), { workerData: { searchRoot } });
  let settled = false;
  const abort = () => { void worker.terminate(); };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const result = new Promise((resolve) => {
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    worker.once("message", (message) => finish(message?.ok ? message.verified : null));
    worker.once("error", () => finish(null));
    worker.once("exit", () => finish(null));
  });
  return { result, async close() {
    signal?.removeEventListener("abort", abort);
    await worker.terminate();
  } };
}
