import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// No production caller. Inject observation only into the two benchmark workers.
export function observeBenchmarkWorkers(root, enabled, { windowsIo = false, cacheKiB = 0 } = {}) {
  const workers = [];
  if (enabled) fs.mkdirSync(path.join(root, "metrics"), { recursive: true });
  return {
    spawn(command, args, options) {
      const key = randomUUID();
      const child = spawn(command, enabled ? ["--import", new URL("./taxonomy-benchmark-observer.mjs", import.meta.url).href, ...args] : args,
        enabled ? { ...options, env: { ...options.env, FN_TAXONOMY_BENCHMARK_ROOT: root,
          FN_TAXONOMY_BENCHMARK_KEY: key, FN_TAXONOMY_BENCHMARK_CACHE: String(cacheKiB) } } : options);
      if (enabled && child.pid) {
        const role = args.some((arg) => arg.endsWith("taxonomy-master-worker.mjs")) ? "master" : "publication";
        let io = Promise.resolve({ available: false, reason: process.platform === "win32" ? "not-enabled" : "unsupported-platform" });
        if (process.platform === "win32" && windowsIo) io = new Promise((resolve) => {
          const monitor = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            fileURLToPath(new URL("./taxonomy-benchmark-io.ps1", import.meta.url)),
            "-BenchmarkPid", String(child.pid), "-BenchmarkRoot", root, "-BenchmarkKey", key], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
          let error = "";
          monitor.stderr.on("data", (data) => { error = (error + data).slice(-2000); });
          monitor.on("error", (cause) => resolve({ available: false, reason: cause.message }));
          monitor.on("close", (code) => {
            if (code !== 0) return resolve({ available: false, reason: error || `monitor-exit-${code}` });
            try { resolve(JSON.parse(fs.readFileSync(path.join(root, "metrics", `${key}-io.json`), "utf8"))); }
            catch (cause) { resolve({ available: false, reason: cause.message }); }
          });
        });
        workers.push({ pid: child.pid, key, role, io });
      }
      return child;
    },
    async collect() {
      return Promise.all(workers.map(async ({ pid, key, role, io }) => ({ pid, role, io: await io,
        process: JSON.parse(fs.readFileSync(path.join(root, "metrics", `${key}.json`), "utf8")) })));
    },
    async close() { await Promise.all(workers.map((worker) => worker.io)); },
  };
}
