/** Serialized into the Squarespace Assets document. Submit only to the confirmed empty search. */
export function squarespaceAssetsLibraryDom({ operation = "observe", fileName, epoch: expectedEpoch, previousQuery, file } = {}) {
  const action = ["focus-search", "search-ready", "submit-file"].includes(operation);
  const unqualified = action ? false : null;
  if (!action && operation !== "observe" && operation !== "start") return null;
  if (typeof fileName !== "string" || fileName.length > 160 || fileName.includes("..")
      || !/^[\p{L}\p{N}](?:[\p{L}\p{N} ._()-]*[\p{L}\p{N}_)])?\.(?:jpe?g|png|webp|gif)$/iu.test(fileName)) return unqualified;
  const epoch = performance.timeOrigin;
  if (!Number.isFinite(epoch) || epoch <= 0 || (action && expectedEpoch !== epoch)) return unqualified;

  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const unique = nodes => nodes.length === 1 ? nodes[0] : null;
  const text = node => node.textContent.trim().replace(/\s+/gu, " ");
  const enabled = node => node && !node.disabled && !node.matches(":disabled") && node.getAttribute("aria-disabled") !== "true";
  function visible(node) {
    if (!node?.getClientRects().length) return false;
    let depth = 0;
    for (let parent = node; parent; parent = parent.parentElement) {
      if (++depth > 100 || parent.hidden || parent.inert || parent.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(parent);
      if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || Number(style.opacity) === 0
          || style.contentVisibility === "hidden") return false;
    }
    return true;
  }
  const blockers = '[role="dialog"],[role="alertdialog"],dialog[open],[aria-modal="true"],[role="alert"],[aria-busy="true"]';
  function readScope() {
    if (document.URL !== "https://vanilla-gerbil-jwnp.squarespace.com/config/asset-library"
        || performance.timeOrigin !== epoch || all(document, blockers).some(visible)) return null;
    const main = unique(all(document, "main").filter(visible));
    if (!main || !unique(all(main, "h1").filter(node => visible(node) && text(node) === "Inhaltsbibliothek"))) return null;
    const search = unique(all(document, '[data-test="asset-search-field"]').filter(visible));
    if (!enabled(search) || !main.contains(search) || search.tagName !== "INPUT" || search.getAttribute("type") !== "text"
        || search.getAttribute("role") !== "combobox" || search.getAttribute("aria-label") !== "asset-search-field") return null;
    return { main, search };
  }

  const accept = "image/jpeg, image/png, image/gif, image/webp, video/mp4, video/x-m4v, video/quicktime, audio/mp3, audio/mpeg, audio/m4a";
  function readUploadField(main) {
    const field = unique(all(document, '[data-test="file-input"]'));
    const upload = unique(all(document, '[data-test="upload-files-button"]').filter(visible));
    return enabled(field) && enabled(upload) && main.contains(field) && main.contains(upload)
      && upload.tagName === "BUTTON" && text(upload) === "Hochladen" && field.tagName === "INPUT" && field.getAttribute("type") === "file"
      && field.parentElement?.tagName === "DIV" && field.parentElement === upload.parentElement && field.getClientRects().length
      && field.getAttribute("aria-hidden") === "true" && field.getAttribute("tabindex") === "-1" && field.getAttribute("multiple") !== null
      && field.getAttribute("accept") === accept && field.form === null && field.files?.length === 0 ? field : null;
  }

  const emptyHint = "Versuche es mit anderen Keywords.";
  const emptyNotices = main => all(main, "h1").filter(node => visible(node) && text(node) === "Keine Ergebnisse");
  const hintVisible = main => all(main, "*").some(node => text(node) === emptyHint && visible(node));
  const queryIs = (search, query) => search.value === query && search.getAttribute("value") === query;
  const editable = search => !search.readOnly && search.getAttribute("readonly") === null && search.getAttribute("aria-readonly") !== "true";
  function readSearch({ main, search }) {
    if (!queryIs(search, fileName) || search.getAttribute("aria-expanded") !== "true") return null;
    const cards = all(document, '[data-test="asset-item"]'), notices = emptyNotices(main);
    if (!cards.length) {
      const notice = unique(notices), parent = notice?.parentElement;
      return parent?.tagName === "DIV" && unique([...parent.children].filter(node => node !== notice && visible(node) && text(node) === emptyHint))
        ? { status: "empty", sourceUrl: null } : null;
    }
    const card = unique(cards);
    if (!card || notices.length || hintVisible(main) || !main.contains(card) || !visible(card)
        || card.tagName !== "BUTTON" || card.getAttribute("aria-label") !== fileName) return null;
    const checkbox = unique(all(card, 'input[type="checkbox"]'));
    const image = unique(all(card, "img").filter(visible));
    if (checkbox?.getAttribute("aria-label") !== `Asset ${fileName}` || !image) return null;
    const sourceUrl = image.currentSrc || image.src || image.getAttribute("src");
    if (typeof sourceUrl !== "string" || !sourceUrl || sourceUrl.length > 4096 || /[\u0000-\u0020\u007f\\]/u.test(sourceUrl)) return null;
    return { status: "match", sourceUrl };
  }

  const scope = readScope();
  if (!scope) return unqualified;
  const { main, search } = scope;
  if (operation === "start") {
    const allFiles = unique(all(main, "p").filter(node => visible(node) && text(node) === "Alle Dateien"));
    return queryIs(search, "") && search.getAttribute("aria-expanded") === "false" && allFiles
      && !emptyNotices(main).length && !hintVisible(main) && readUploadField(main) ? { epoch } : null;
  }
  if (operation === "focus-search") {
    if ((previousQuery !== "" && previousQuery !== fileName) || !queryIs(search, previousQuery) || !editable(search)) return false;
    search.focus({ preventScroll: true });
    if (document.activeElement !== search) return false;
    search.select();
    const current = readScope();
    return Boolean(current?.main === main && current.search === search && document.activeElement === search && editable(search)
      && queryIs(search, previousQuery) && search.selectionStart === 0 && search.selectionEnd === previousQuery.length);
  }
  if (operation === "search-ready") {
    return document.activeElement === search && queryIs(search, fileName) && search.getAttribute("aria-expanded") === "true";
  }

  const observation = readSearch(scope), field = readUploadField(main);
  if (!observation) return unqualified;
  if (operation === "observe") return { epoch, status: observation.status, fileName, sourceUrl: observation.sourceUrl, uploadReady: Boolean(field) };
  if (observation.status !== "empty" || !field) return false;
  const extension = /^fn-[a-f0-9]{24}-[1-9][0-9]{0,2}\.(png|jpg|webp)$/.exec(fileName)?.[1];
  const mimeType = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[extension];
  if (!mimeType || file?.name !== fileName || file.type !== mimeType || !Number.isSafeInteger(file.size)
      || file.size < 1 || file.size > 32 * 1024 * 1024 || typeof file.base64 !== "string"
      || file.base64.length !== 4 * Math.ceil(file.size / 3)) return false;
  try {
    const decoded = atob(file.base64);
    if (decoded.length !== file.size) return false;
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < bytes.length; index++) bytes[index] = decoded.charCodeAt(index);
    const selection = new DataTransfer();
    selection.items.add(new File([bytes], fileName, { type: mimeType }));
    const current = readScope();
    if (current?.main !== main || current.search !== search || readSearch(current)?.status !== "empty" || readUploadField(main) !== field) return false;
    field.files = selection.files;
    field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  } catch {
    return false;
  }
}
