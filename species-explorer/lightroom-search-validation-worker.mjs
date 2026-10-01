import { parentPort, workerData } from "node:worker_threads";
import { verifyLightroomSearchPackage } from "./lightroom-search-package.mjs";

try {
  const verified = await verifyLightroomSearchPackage({ searchRoot: workerData.searchRoot });
  parentPort.postMessage({ ok: true, verified });
} catch { parentPort.postMessage({ ok: false }); }
finally { parentPort.close(); }
