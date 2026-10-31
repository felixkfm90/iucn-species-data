import { fileURLToPath } from "node:url";

// All local Explorer windows use the accepted app symbol, including browser auxiliaries.
export const EXPLORER_WINDOW_ICON = fileURLToPath(new URL(
  process.platform === "win32" ? "./assets/arten-explorer-transparent.ico" : "./assets/arten-explorer.png",
  import.meta.url,
));
