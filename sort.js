// sort.js (Squarespace list sorting by visible title)
(function () {
  const trigger = document.getElementById("species-sort") || document.getElementById("species-search");
  if (!trigger) return;

  const scope = document.querySelector("main") || document.querySelector('[role="main"]');
  if (!scope) return;

  const ITEM_SELECTOR = "article, .summary-item, .list-item, .grid-item, section, .sqs-block, li";
  const TITLE_SELECTOR = ".summary-title, .summary-title-link, .list-item-title, .title, h1, h2, h3";

  let isApplyingSort = false;
  let debounceTimer = null;
  const parentSignatures = new WeakMap();

  function normalize(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function getItemFromTitle(titleNode) {
    return titleNode.closest(ITEM_SELECTOR) || titleNode.parentElement;
  }

  function buildGroups() {
    const groupsByParent = new Map();
    const titleNodes = scope.querySelectorAll(TITLE_SELECTOR);

    for (const titleNode of titleNodes) {
      const title = normalize(titleNode.textContent);
      if (!title) continue;

      const item = getItemFromTitle(titleNode);
      if (!item) continue;

      const parent = item.parentElement;
      if (!parent || !scope.contains(parent)) continue;

      if (!groupsByParent.has(parent)) groupsByParent.set(parent, new Map());

      const entries = groupsByParent.get(parent);
      if (!entries.has(item)) {
        entries.set(item, { item, title, parent });
      }
    }

    return Array.from(groupsByParent.values())
      .map((entryMap) => {
        const group = Array.from(entryMap.values());
        const children = Array.from(group[0].parent.children);

        return group
          .map((entry) => ({ ...entry, index: children.indexOf(entry.item) }))
          .filter((entry) => entry.index !== -1)
          .sort((a, b) => a.index - b.index);
      })
      .filter((group) => group.length >= 2);
  }

  function buildSignature(group) {
    return group.map((entry) => entry.title).join("\u0001");
  }

  function sortGroup(group) {
    const parent = group[0].parent;
    const signature = buildSignature(group);

    if (parentSignatures.get(parent) === signature) return false;

    const sorted = [...group].sort((a, b) =>
      a.title.localeCompare(b.title, "de", { sensitivity: "base", numeric: true })
    );

    const alreadySorted = sorted.every((entry, i) => entry.item === group[i].item);
    if (alreadySorted) {
      parentSignatures.set(parent, signature);
      return false;
    }

    const fragment = document.createDocumentFragment();
    for (const entry of sorted) fragment.appendChild(entry.item);

    isApplyingSort = true;
    parent.appendChild(fragment);
    isApplyingSort = false;

    parentSignatures.set(parent, buildSignature(sorted));
    return true;
  }

  function runSort() {
    if (isApplyingSort) return;

    const groups = buildGroups();
    if (groups.length < 1) return;

    for (const group of groups) {
      sortGroup(group);
    }
  }

  function scheduleSort(delay) {
    window.setTimeout(runSort, delay);
  }

  function setupObserver() {
    const observer = new MutationObserver(() => {
      if (isApplyingSort) return;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(runSort, 200);
    });

    observer.observe(scope, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 8000);
  }

  function init() {
    scheduleSort(0);
    scheduleSort(600);
    scheduleSort(1800);
    scheduleSort(3200);
    setupObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
