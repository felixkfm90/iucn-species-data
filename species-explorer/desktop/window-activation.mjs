export function activateExplorerWindow(window) {
  if (!window || window.isDestroyed?.()) return false;
  if (window.isMinimized?.()) window.restore();
  if (window.isVisible && !window.isVisible()) window.show();
  window.focus();
  window.moveTop?.();
  return true;
}
