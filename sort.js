// sort.js (Squarespace list sorting by visible title)
(function () {

  // Keep this exact travel overview's visual and reading order consistent.
  // Other pages continue through the existing species sorter below.
  if (document.body?.id === "collection-6762f93388733e1c65ea92df") {
    const gridSelector = ".fe-6762fbf91d9e4a0b2d731965";
    const expectedIds = ["cd65fb3d76951a93cd2f","d1d7a6817f3ead80e8f4","07512624831fc4784996","3402fe36e16aff577abc","b656c8e558a4cb32e5fc","yui_3_17_2_1_1734950462819_9413","0fe4c0eebac4222d5c9d","da86a8b8f677c3e173f0","0de2c50ad4d26b262b38","671bd398e2c3f786387d","e833ec0283306b3f95fe","a403a278db07d54553e7","53dc98adb8dddeca93d9","7e98e8063bc4db7d2bb7","1a60e8ecaef478a32204","2b64097e1597f6440684","ca07961f7de2c5f3a904","ace95bd8bd854ddd73cc","bc4f02b8cb737d6699d8","b25570df8e94e9b68e6a","c93629463d3c2b2c3eaa","59db82169a9f60431f0f","f5eae501c897b57cf4ba","611f69c7d6955ac5c88e","18b9c85009fdab9fabad","371d783d87800ccb5a2f","d3440f9a41f587d9f7bd","f88c7ec3db7bd5048a6f","4b21f7e77648c6279536","ddf05355c9cb1526c0bc","75494d67b66e2a329e9d","274a15afefe1aa60ae8c","053f5382d53cf7f852ee","03cc54cf7881c7cd1945","bafa667170fa939d3788","c3615c1d92bed7d537c4","5c88d372805fb16662e4","559d517dcfabb8082b1b","d935646dabea4fd6dc5e","b9814034a5e0e6345ca3","6dc430c894f040264e5a","3989211c476eebcb4c16","c034ea46bdbd20d756b4","d86fe3195375c23d6ffe","531cb349b408ad15a603","d9f922b88862af4b67ee","ba2ed642f8c16dc10039","e7e0b2cbbdfba503b2c8","7445afd04dd6241247ed","bdc33ce4fe5a2f8d6b69"];
    const removedIds = new Set(["b25570df8e94e9b68e6a","18b9c85009fdab9fabad","f88c7ec3db7bd5048a6f","d86fe3195375c23d6ffe","7445afd04dd6241247ed"]);
    const expectedHeadings = [["cd65fb3d76951a93cd2f","2019"],["3402fe36e16aff577abc","Griechenland"],["b656c8e558a4cb32e5fc","2020"],["da86a8b8f677c3e173f0","Sizilien"],["671bd398e2c3f786387d","Marina Wendtorf"],["a403a278db07d54553e7","Kreta"],["53dc98adb8dddeca93d9","2021"],["2b64097e1597f6440684","Neapel und Amalfitana"],["ca07961f7de2c5f3a904","2022"],["c93629463d3c2b2c3eaa","Namibia"],["59db82169a9f60431f0f","2023"],["371d783d87800ccb5a2f","Namibia"],["4b21f7e77648c6279536","Italien -Latium"],["ddf05355c9cb1526c0bc","2024"],["03cc54cf7881c7cd1945","Costa Rica"],["c3615c1d92bed7d537c4","Montenegro"],["5c88d372805fb16662e4","2025"],["b9814034a5e0e6345ca3","Nordthailand und Laos"],["3989211c476eebcb4c16","Island"],["531cb349b408ad15a603","Italien - MArken"],["d9f922b88862af4b67ee","2026"],["bdc33ce4fe5a2f8d6b69","Botswana"]];
    const expectedImages = ["07512624831fc4784996","0fe4c0eebac4222d5c9d","0de2c50ad4d26b262b38","e833ec0283306b3f95fe","1a60e8ecaef478a32204","bc4f02b8cb737d6699d8","611f69c7d6955ac5c88e","d3440f9a41f587d9f7bd","274a15afefe1aa60ae8c","bafa667170fa939d3788","d935646dabea4fd6dc5e","6dc430c894f040264e5a","c034ea46bdbd20d756b4","e7e0b2cbbdfba503b2c8"];
    const bandId = "053f5382d53cf7f852ee";
    const moves = [
      ["d3440f9a41f587d9f7bd", "59db82169a9f60431f0f"],
      ["4b21f7e77648c6279536", "59db82169a9f60431f0f"],
      [bandId, "c3615c1d92bed7d537c4"],
    ];
    const repairedIds = expectedIds.slice();
    for (const [id, beforeId] of moves) {
      repairedIds.splice(repairedIds.indexOf(id), 1);
      repairedIds.splice(repairedIds.indexOf(beforeId), 0, id);
    }
    for (const id of removedIds) repairedIds.splice(repairedIds.indexOf(id), 1);
    const orderMarker = "latium-2022-montenegro-v1";
    let queued = null;

    function repairTravelOrder() {
      const grids = document.querySelectorAll(gridSelector);
      if (grids.length !== 1) return;
      const grid = grids[0], children = Array.from(grid.children);
      const entries = children.map((node) => [
        Array.from(node.classList).find((value) => value.startsWith("fe-block-"))?.slice(9), node,
      ]);
      const nodes = new Map(entries);
      const absent = [...removedIds].filter((id) => !nodes.has(id)).length;
      const expectedOrder = absent === 0 ? expectedIds : repairedIds;
      if (nodes.size !== children.length || ![0, removedIds.size].includes(absent)
          || children.length !== expectedIds.length - absent
          || entries.some(([id]) => !expectedIds.includes(id))
          || expectedIds.some((id) => !nodes.has(id) && !removedIds.has(id))
          || entries.some(([id], index) => id !== expectedOrder[index])) return;
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("de");
      if (expectedHeadings.some(([id, text]) => normalize(nodes.get(id).querySelector(".sqs-html-content h1, .sqs-html-content h2")?.textContent) !== normalize(text))
          || expectedImages.some((id) => !nodes.get(id).querySelector("img"))) return;
      for (const id of [bandId, ...removedIds]) {
        if (!nodes.has(id)) continue;
        const marquee = nodes.get(id).querySelector(".Marquee");
        let items;
        try { items = JSON.parse(marquee?.getAttribute("data-marquee-items") || "null"); } catch { return; }
        if (!Array.isArray(items) || items.length !== 1 || normalize(items[0]?.text) !== "in arbeit") return;
      }
      if (absent === 0) {
        for (const [id, beforeId] of moves) grid.insertBefore(nodes.get(id), nodes.get(beforeId));
        for (const id of removedIds) nodes.get(id).remove();
      }
      if (grid.getAttribute("data-fn-travel-order") !== orderMarker) grid.setAttribute("data-fn-travel-order", orderMarker);
    }

    function initTravelOrder() {
      for (const delay of [0, 600, 1800, 3200]) window.setTimeout(repairTravelOrder, delay);
      const observer = new MutationObserver(() => {
        if (queued !== null) window.clearTimeout(queued);
        queued = window.setTimeout(() => { queued = null; repairTravelOrder(); }, 200);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => observer.disconnect(), 8000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTravelOrder, { once: true });
    else initTravelOrder();
    return;
  }

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

    const sorted = [...group].sort((a, b) => {
      const aIsClosing = a.title.toLocaleLowerCase("de") === "weitere tiere";
      const bIsClosing = b.title.toLocaleLowerCase("de") === "weitere tiere";
      if (aIsClosing !== bIsClosing) return aIsClosing ? 1 : -1;
      return a.title.localeCompare(b.title, "de", { sensitivity: "base", numeric: true });
    });

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



