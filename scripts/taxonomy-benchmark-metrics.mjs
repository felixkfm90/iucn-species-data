import { PerformanceObserver, performance } from "node:perf_hooks";

// Benchmark-only observation. No forced collection, cache flush or process tuning.
export function createProcessMeter() {
  const start = performance.now(), initialCpu = process.cpuUsage(), phases = Object.create(null), gc = [];
  let phase = "start", phaseAt = start, phaseCpu = initialCpu, closed = false;
  let peak = { rss: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  const sample = () => {
    const memory = process.memoryUsage();
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], memory[key]);
  };
  const observer = new PerformanceObserver((list) => gc.push(...list.getEntries()));
  observer.observe({ entryTypes: ["gc"] });
  sample();
  const interval = setInterval(sample, 50); interval.unref();
  const mark = (name) => {
    if (closed) throw new Error("Prozessmessung ist abgeschlossen.");
    if (name === phase) return;
    const now = performance.now(), cpu = process.cpuUsage();
    const value = phases[phase] ||= { wallMs: 0, userMs: 0, systemMs: 0 };
    value.wallMs += now - phaseAt;
    value.userMs += (cpu.user - phaseCpu.user) / 1000;
    value.systemMs += (cpu.system - phaseCpu.system) / 1000;
    phase = name; phaseAt = now; phaseCpu = cpu; sample();
  };
  return {
    mark,
    finish() {
      mark("finished"); closed = true; clearInterval(interval);
      gc.push(...observer.takeRecords()); observer.disconnect();
      const cpu = process.cpuUsage(initialCpu);
      return { wallMs: phaseAt - start, userMs: cpu.user / 1000, systemMs: cpu.system / 1000,
        sampledPeakMiB: Object.fromEntries(Object.entries(peak).map(([key, value]) => [key, value / 1048576])),
        processPeakRssMiB: process.resourceUsage().maxRSS / 1024,
        reportedGc: { count: gc.length, durationMs: gc.reduce((sum, entry) => sum + entry.duration, 0) }, phases };
    },
  };
}
