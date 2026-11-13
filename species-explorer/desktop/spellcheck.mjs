export function installGermanSpellcheck({ window, Menu, isAllowedUrl, platform = process.platform }) {
  const contents = window.webContents, session = contents.session;
  session.setSpellCheckerEnabled(true);
  if (platform !== "darwin") session.setSpellCheckerLanguages(["de"]);
  let generation = 0;
  const invalidate = () => { generation += 1; };
  const onContextMenu = (_event, params) => {
    invalidate();
    const url = contents.getURL(), current = generation;
    if (!params.isEditable || params.inputFieldType === "password" || !isAllowedUrl(url)) return;
    const valid = () => !contents.isDestroyed() && generation === current && contents.getURL() === url;
    const template = [];
    if (params.misspelledWord) {
      const suggestions = [...new Set(params.dictionarySuggestions || [])]
        .filter((word) => typeof word === "string" && word.length > 0 && word.length <= 100 && !/[\r\n\x00]/.test(word)).slice(0, 5);
      for (const suggestion of suggestions) template.push({ label: suggestion,
        click: () => { if (valid()) contents.replaceMisspelling(suggestion); } });
      if (!suggestions.length) template.push({ label: "Keine Schreibvorschläge vorhanden", enabled: false });
      template.push({ label: "Wort ins persönliche Wörterbuch aufnehmen",
        click: () => { if (valid()) session.addWordToSpellCheckerDictionary(params.misspelledWord); } }, { type: "separator" });
    }
    const flags = params.editFlags || {};
    template.push({ role: "undo", label: "Rückgängig", enabled: Boolean(flags.canUndo) },
      { role: "redo", label: "Wiederholen", enabled: Boolean(flags.canRedo) }, { type: "separator" },
      { role: "cut", label: "Ausschneiden", enabled: Boolean(flags.canCut) },
      { role: "copy", label: "Kopieren", enabled: Boolean(flags.canCopy) },
      { role: "paste", label: "Einfügen", enabled: Boolean(flags.canPaste) },
      { role: "selectAll", label: "Alles auswählen", enabled: Boolean(flags.canSelectAll) });
    Menu.buildFromTemplate(template).popup({ window });
  };
  contents.on("context-menu", onContextMenu);
  contents.on("did-start-navigation", invalidate);
  return () => {
    invalidate();
    contents.removeListener("context-menu", onContextMenu);
    contents.removeListener("did-start-navigation", invalidate);
  };
}
