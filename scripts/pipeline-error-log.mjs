import fs from "node:fs";
import path from "node:path";

export const PIPELINE_ERROR_LOG_MAX_BYTES = 256 * 1024;
export const PIPELINE_ERROR_LOG_RELATIVE_PATH = "species-explorer/logs/pipeline-errors.log";

export function appendPipelineErrorLog(
  message,
  {
    repoRoot = process.cwd(),
    maxBytes = PIPELINE_ERROR_LOG_MAX_BYTES,
    now = new Date(),
  } = {},
) {
  const logPath = path.join(repoRoot, ...PIPELINE_ERROR_LOG_RELATIVE_PATH.split("/"));
  const line = `[${now.toISOString()}] ${String(message)}\n`;

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const currentBytes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
    if (currentBytes + Buffer.byteLength(line, "utf8") > maxBytes) {
      fs.writeFileSync(logPath, line, "utf8");
    } else {
      fs.appendFileSync(logPath, line, "utf8");
    }
    return { written: true, logPath, reset: currentBytes > 0 && currentBytes + Buffer.byteLength(line, "utf8") > maxBytes };
  } catch (error) {
    return { written: false, logPath, error: error.message };
  }
}
