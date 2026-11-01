import { assessSquarespaceImageBlockField } from "./squarespace-image-block-fields.mjs";
import { squarespaceImageBlockDomOperation } from "./squarespace-image-block-dom.mjs";
import { squarespaceAutoLayoutDomOperation } from "./squarespace-auto-layout-dom.mjs";

const stopped = (signal) => signal?.throwIfAborted();
const fail = (message) => Object.assign(new Error(message), { statusCode: 409 });

// The existing page driver owns navigation and frame validation. These paths only
// edit the explicit ALT input of a source-bound content block or Auto Layout item.
export function createSquarespaceIndependentImageTransfer({ openPage, mainFrame, previewFrame, previewState,
  performPage, click, hover, waitFor, exitSavedPage, inspectPreview } = {}) {
  const perform = (frame, operation, payload) => frame.executeJavaScript(`(${operation.toString()})(${JSON.stringify(payload)})`, true);
  const key = (contents, keyCode, modifiers = []) => {
    contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  };
  async function transfer(webContents, plan, { signal, assertCurrent } = {}) {
    const results = [], prepared = [];
    let frame = null, top = null, failed = false;
    const current = () => frame && previewFrame(webContents, plan.pageUrl) === frame && mainFrame(webContents) === top;
    const hasOwnChanges = () => prepared.some(entry => entry.changed);
    const failPrepared = (error) => {
      for (const result of results) if (result.status === "prepared") Object.assign(result, { status: "failed",
        error: `Der gemeinsame Seitenabschluss ist nicht bestätigt. Offene Eingaben werden nicht automatisch verworfen; einzelne Änderungen können bereits automatisch gespeichert sein. ${error}` });
    };
    const assertPrepared = async () => {
      for (const entry of prepared) {
        stopped(signal);
        await assertCurrent(entry.image.imageKey, entry.image.approvalRevision);
        if (!current()) throw fail("Die Seitenvorschau wurde vor dem gemeinsamen Speichern gewechselt.");
        const binding = await perform(frame, entry.dom, { operation: entry.operation, ...entry.payload });
        if (!current() || !binding || binding.alt !== entry.image.text || binding.caption !== entry.image.expectedCaption
            || entry.payload.blockId && binding.blockId !== entry.payload.blockId
            || entry.payload.sectionId && (binding.sectionId !== entry.payload.sectionId || binding.itemTitle !== entry.payload.itemTitle)) {
          throw fail("Eine vorbereitete Bildquelle, Zuordnung oder ihr Text wurde vor dem gemeinsamen Speichern verändert.");
        }
      }
    };
    for (const image of plan.images) {
      let stage = "Seite öffnen", changed = false, diagnose = null;
      try {
        stopped(signal);
        await assertCurrent(image.imageKey, image.approvalRevision);
        const first = !frame;
        if (first) { frame = await openPage(webContents, plan, signal); top = mainFrame(webContents); }
        const pristine = await previewState(webContents);
        // Only this clean entry authorizes the batch. A dirty state on later
        // images is accepted only while our verified changes remain pending.
        if (!current() || pristine?.mode !== "editing" || pristine.dialogOpen !== false
            || pristine.saveDisabled !== true && (first || !hasOwnChanges())) {
          throw fail("Die Seitenbearbeitung enthält noch offene Änderungen oder einen geöffneten Editor. Bitte diese zuerst abschließen.");
        }
        await assertPrepared();
        stage = "Bild zuordnen";
        diagnose = async () => ({ block: await perform(frame, squarespaceImageBlockDomOperation,
          { operation: "field-diagnostic", sourceUrl: image.sourceUrl }),
        section: await perform(frame, squarespaceAutoLayoutDomOperation, { operation: "field-diagnostic", sourceUrl: image.sourceUrl }) });
        // Entering edit mode replaces the rendered image components asynchronously.
        // A ready toolbar alone does not prove that their image sources are ready.
        const { block, section } = await waitFor(async () => {
          if (!current()) throw fail("Die Seitenvorschau wurde während der Bildzuordnung gewechselt.");
          const block = await perform(frame, squarespaceImageBlockDomOperation, { operation: "bind-block", sourceUrl: image.sourceUrl });
          const section = await perform(frame, squarespaceAutoLayoutDomOperation, { operation: "bind-section", sourceUrl: image.sourceUrl });
          return block || section ? { block, section } : null;
        }, "Das Bild ist im geladenen Seiteneditor noch nicht eindeutig zugeordnet.", signal);
        if (Boolean(block) === Boolean(section)) {
          try { console.error("Squarespace-Bildzuordnung", JSON.stringify(await diagnose())); }
          catch { /* A diagnostic read does not change the unsupported result. */ }
          results.push({ imageKey: image.imageKey, status: "unsupported",
            error: "Das Bild ist keinem eindeutigen normalen Bildblock oder unterstützten Kachelfeld zugeordnet." });
          continue;
        }
        const binding = block || section, dom = block ? squarespaceImageBlockDomOperation : squarespaceAutoLayoutDomOperation;
        const payload = { sourceUrl: image.sourceUrl, ...(block ? { blockId: binding.blockId }
          : { sectionId: binding.sectionId, itemTitle: binding.itemTitle }) };
        if (binding.alt !== image.expectedAlt && binding.alt !== image.text || binding.caption !== image.expectedCaption) {
          throw fail("Das Bild oder sein bisheriger Text wurde seit der Freigabe verändert. Bitte die Seite zuerst neu abgleichen.");
        }
        const domRead = (operation) => perform(top, dom, { operation, ...payload, hovered: !block });
        diagnose = async () => ({ preview: await perform(frame, dom, { operation: "field-diagnostic", ...payload }),
          editor: await domRead("field-diagnostic") });
        let mapReason = "", mapMetrics = null;
        const mapped = await waitFor(async () => {
          if (!current()) throw fail("Die Seitenvorschau wurde während der Bildzuordnung gewechselt.");
          const fresh = await perform(frame, dom, { operation: block ? "bind-block" : "bind-section", ...payload });
          if (!fresh) return null;
          if (fresh.alt !== binding.alt || fresh.caption !== binding.caption) throw fail("Der Bildtext wurde während der Bildzuordnung verändert.");
          const target = await performPage(top, { operation: "map-gallery-hover", pageUrl: plan.pageUrl,
            framePoint: fresh.point, frameViewport: fresh.viewport });
          if (target?.blocked) {
            mapMetrics = target.metrics || null;
            mapReason = ["frame-count", "frame-url", "transform", "dimensions", "hit-test"].includes(target.blocked) ? target.blocked : "";
            return null;
          }
          return current() && hover(webContents, target, signal) ? target : null;
        }, "Der Bildeditor ist nicht sicher erreichbar. Bitte die Seitenvorschau prüfen.", signal).catch(error => {
          if (mapMetrics) console.error("Squarespace-Bildabmessungen", JSON.stringify(mapMetrics));
          if (mapReason) error.message += ` (${mapReason})`;
          throw error;
        });
        if (block) {
          if (!click(webContents, mapped, signal)) throw fail("Der normale Bildblock lässt sich nicht sicher auswählen.");
          stage = "Bildblock öffnen";
          await waitFor(async () => current() && click(webContents, await domRead("edit-block-control"), signal),
            "Der ausgewählte Bildblock hat keinen eindeutigen Bearbeiten-Schalter.", signal);
        } else {
          stage = "Kachelliste öffnen";
          await waitFor(async () => current() && click(webContents, await domRead("content-control"), signal),
            "Die Inhaltsbearbeitung des passenden Kachelabschnitts ist nicht eindeutig erreichbar.", signal);
          await waitFor(async () => click(webContents, await domRead("content-tab"), signal),
            "Der Inhalt-Reiter der Kachelliste ist nicht eindeutig erreichbar.", signal);
          await waitFor(async () => click(webContents, await domRead("select-item"), signal),
            "Das passende Bild ist in der Kachelliste nicht eindeutig auswählbar.", signal);
        }
        stage = "Alternativtextfeld prüfen";
        const observed = await waitFor(() => domRead("alt-field"),
          "Das Alternativtextfeld und seine Bildvorschau lassen sich nicht eindeutig zuordnen.", signal);
        const assessment = assessSquarespaceImageBlockField(image, { ...observed, caption: binding.caption });
        if (!["ready", "unchanged"].includes(assessment.status)) throw fail(assessment.error);
        if (assessment.status === "ready") {
          await assertCurrent(image.imageKey, image.approvalRevision);
          const before = await domRead("alt-field");
          if (!current() || JSON.stringify(before) !== JSON.stringify(observed)
              || !await domRead("focus-alt")) throw fail("Das Alternativtextfeld wurde zwischenzeitlich verändert.");
          stopped(signal);
          if (!current()) throw fail("Die Seitenvorschau wurde während der Feldzuordnung gewechselt. Es wird kein Text eingegeben.");
          stage = "Alternativtext eingeben";
          key(webContents, "A", [process.platform === "darwin" ? "meta" : "control"]);
          if (image.text) await webContents.insertText(image.text);
          else key(webContents, "Backspace");
          changed = true;
          stopped(signal);
          const after = await domRead("alt-field");
          if (!after || after.alt !== image.text
              || JSON.stringify({ ...after, alt: observed.alt }) !== JSON.stringify(observed)) {
            throw fail("Die Alttexteingabe oder der unveränderte übrige Kacheltext ist nicht bestätigt. Bitte den Editor prüfen.");
          }
          await domRead("blur-alt");
        }
        stage = "Bildeditor schließen";
        // A source-bound preview frame is still required. Click its uncovered
        // outer margin, outside the floating form, to close that form normally.
        const dismiss = await performPage(top, { operation: "dismiss-image-editor", pageUrl: plan.pageUrl });
        if (!current() || !click(webContents, dismiss, signal)) throw fail("Der Bildeditor lässt sich nicht sicher schließen.");
        await waitFor(() => domRead("dialog-closed"), "Der Bildeditor ist noch geöffnet. Bitte den Abschluss prüfen.", signal);
        if (!current()) throw fail("Die Seitenvorschau wurde beim Bildabschluss gewechselt.");
        prepared.push({ image, changed, dom, payload, operation: block ? "bind-block" : "bind-section" });
        results.push({ imageKey: image.imageKey, status: "prepared" });
      } catch (error) {
        if (signal?.aborted) throw error;
        failed = true;
        if (stage === "Seite öffnen" && inspectPreview) {
          try { console.error("Squarespace-Seitenprüfung", JSON.stringify(await inspectPreview(webContents, plan.pageUrl))); }
          catch { /* A bounded diagnostic read must not replace the transfer error. */ }
        }
        if (diagnose) {
          try { console.error("Squarespace-Bildfeldprüfung", JSON.stringify({ stage, field: await diagnose() })); }
          catch { /* Diagnostic reads cannot replace the original error. */ }
        }
        const errorText = `${error.message} (Prüfschritt: ${stage})${changed
          ? " Die eingegebene Änderung bleibt ungeklärt und kann bereits automatisch gespeichert sein." : ""}`;
        failPrepared(errorText);
        results.push({ imageKey: image.imageKey, status: "failed", error: errorText });
        for (const remaining of plan.images.slice(plan.images.indexOf(image) + 1)) results.push({ imageKey: remaining.imageKey,
          status: "failed", error: "Nach dem vorherigen Fehler nicht weiter übertragen." });
        break;
      }
    }
    if (!failed && frame) {
      let stage = "Vorbereitete Bildtexte prüfen";
      try {
        await assertPrepared();
        if (hasOwnChanges()) {
          stage = "Seite gemeinsam speichern";
          const save = await waitFor(async () => {
            const state = await previewState(webContents);
            if (!current()) throw fail("Die Seitenvorschau wurde vor dem gemeinsamen Speichern gewechselt.");
            if (state?.dialogOpen === false
                && (state.mode === "preview" || state.mode === "editing" && state.saveDisabled === true)) {
              return { alreadySaved: true };
            }
            if (current() && state?.mode === "editing" && state.dialogOpen === false && state.saveDisabled !== true) {
              return performPage(top, { operation: "save-page", pageUrl: plan.pageUrl });
            }
            return null;
          }, "Der Speichern-Schalter für die eigene Bildtextänderung ist nicht eindeutig bereit.", signal);
          // Rebind every prepared approval and image after waiting for Save.
          // No earlier field acknowledgement is a completed write receipt.
          await assertPrepared();
          if (!save.alreadySaved) {
            const freshSave = await performPage(top, { operation: "save-page", pageUrl: plan.pageUrl });
            if (!current() || !click(webContents, freshSave, signal)) throw fail("Die Bildtextänderung konnte nicht sicher gespeichert werden.");
            await waitFor(async () => {
              const state = await previewState(webContents);
              const savedFrame = previewFrame(webContents, plan.pageUrl);
              return mainFrame(webContents) === top && savedFrame && (savedFrame === frame || savedFrame.parent === top)
                && state?.dialogOpen === false && (state.mode === "preview" || state.mode === "editing" && state.saveDisabled === true);
            }, "Squarespace hat das Speichern noch nicht bestätigt. Bitte den Seitenabschluss prüfen.", signal);
          }
        }
        stage = "Seitenabschluss prüfen";
        await exitSavedPage(webContents, plan.pageUrl, signal);
        for (const result of results) if (result.status === "prepared") {
          result.status = prepared.find(entry => entry.image.imageKey === result.imageKey).changed ? "written" : "unchanged";
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        failPrepared(`${error.message} (Prüfschritt: ${stage})`);
      }
    }
    return { results };
  }
  return Object.freeze({ transfer });
}
