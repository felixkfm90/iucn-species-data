"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const CHANNEL = "taxonomy-correction-request";
const listeners = new Set();
const pending = [];

ipcRenderer.on(CHANNEL, (_event, payload) => {
  if (!listeners.size) {
    pending.push(payload);
    return;
  }
  for (const listener of listeners) listener(payload);
});

contextBridge.exposeInMainWorld("speciesExplorerDesktop", Object.freeze({
  onTaxonomyCorrectionRequest(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    while (pending.length) callback(pending.shift());
    return () => listeners.delete(callback);
  },
}));
