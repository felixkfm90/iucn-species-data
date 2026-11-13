import { canonical, check, escapeHtml as esc, fingerprint, sha256 } from './contract.mjs';
import { hasContent, NORMAL_ASSET_FILES } from './model.mjs';
import { FN_SPECIES_CODE, FN_MAP_CODE, getPageTemplate } from './templates.mjs';
import { pageImagesHash, validateStoredDocument } from './shared.mjs';

export function renderRichText(blocks) {
  return blocks.map(block => block.type === 'paragraph' ? `<p>${esc(block.text).replaceAll('\n','<br>')}</p>`
    : block.type === 'heading' ? `<h${block.level}>${esc(block.text)}</h${block.level}>`
      : `<${block.type === 'bullet-list' ? 'ul' : 'ol'}>${block.items.map(value => `<li>${esc(value)}</li>`).join('')}</${block.type === 'bullet-list' ? 'ul' : 'ol'}>`).join('\n');
}
export function normalAssetUrls(species) {
  const base = `https://felixkfm90.github.io/iucn-species-data/species-assets/${encodeURIComponent(species.assetName)}`;
  return Object.fromEntries(Object.entries(NORMAL_ASSET_FILES).map(([role,file]) => [role, `${base}/${file}`]));
}
/** Byte reads only use an injected managed-media authority. This module never fetches URLs or reads renderer paths. */
export async function verifyDocumentMedia(document, mediaFacade, context) {
  const assets = [...Object.values(document.species.normalAssets).filter(Boolean), ...document.images.map(image => image.asset)];
  const result = new Map(); let total = 0;
  for (const asset of assets) {
    if (result.has(asset.id)) {
      check(result.get(asset.id).metadataHash === fingerprint(asset), 'media_identity_changed', 'Eine Medienkennung verweist auf unterschiedliche Dateien.', 409); continue;
    }
    try {
      total += asset.bytes;
      check(total <= 96 * 1024 * 1024, 'media_preview_budget', 'Die Bildauswahl überschreitet das begrenzte lokale Vorschaufenster.', 409);
      const bytes = await mediaFacade.read({ ...context, pageSpecies: document.species, mediaAsset: asset }, asset.id);
      check(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, 'media_missing', 'Die bereitgestellte Datei fehlt.', 409);
      check(bytes.byteLength === asset.bytes && sha256(bytes) === asset.sha256, 'media_changed', 'Die bereitgestellte Datei stimmt nicht mehr mit dem Entwurf überein.', 409);
      const b = Buffer.from(bytes);
      const signature = asset.mimeType === 'image/png' ? b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : asset.mimeType === 'image/jpeg' ? b[0] === 255 && b[1] === 216 && b[2] === 255
          : asset.mimeType === 'image/webp' ? b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP'
            : asset.mimeType === 'audio/mpeg' ? b.toString('ascii',0,3) === 'ID3' || b[0] === 255 && (b[1] & 224) === 224
              : asset.mimeType === 'application/json' ? (() => { try { JSON.parse(b.toString('utf8')); return true; } catch { return false; } })() : false;
      check(signature, 'media_format_mismatch', 'Die bereitgestellte Datei passt nicht zum angegebenen Medienformat.', 409);
      result.set(asset.id, { ok: true, metadataHash: fingerprint(asset), dataUrl: asset.mimeType.startsWith('image/') || asset.mimeType === 'audio/mpeg' ? `data:${asset.mimeType};base64,${b.toString('base64')}` : null });
    } catch (error) {
      result.set(asset.id, { ok: false, metadataHash: fingerprint(asset), code: ['media_changed','media_format_mismatch','media_preview_budget'].includes(error?.code) ? error.code : 'media_missing' });
    }
  }
  return result;
}
function attribution(asset) { return asset?.attribution ? `<p class="source">${esc(asset.attribution)}</p>` : ''; }
function sourceHtml(source) { return `<p class="source">${esc(source.label)}${source.url ? ` · ${esc(source.url)}` : ''}</p>`; }
function mediaImage(asset, alt, media, className = '') {
  if (!asset || !media.get(asset.id)?.ok) return '<p class="open">Bilddatei nicht bereitgestellt oder nicht bestätigt</p>';
  return `<img class="${className}" src="${media.get(asset.id).dataUrl}" alt="${esc(alt)}">${attribution(asset)}`;
}
export function composePage(draft, media) {
  const document = validateStoredDocument(draft.document), species = document.species, template = getPageTemplate(document.templateId);
  const findings = [];
  const finding = (code, message, blocking = true, id = null) => findings.push({ code, message, blocking, id });
  for (const section of document.sections) if (section.kind === 'editorial' && !hasContent(section.blocks) && !document.emptyConfirmations[section.id])
    finding('section_missing', `Für „${section.title}“ fehlt Text oder die ausdrückliche Bestätigung einer Leerstelle.`, true, section.id);
  if (document.galleryRequested && document.images.length === 0) finding('gallery_missing', 'Die gewünschte Bildergalerie enthält noch keine bereitgestellten Bilder.');
  for (const role of ['portrait','map']) if (!species.normalAssets[role]) finding('normal_asset_missing', `Die normale Artdatei „${NORMAL_ASSET_FILES[role]}“ fehlt.`, true, role);
  if (!species.runtimeReady) finding('runtime_species_missing', 'Die Artgrunddaten sind für die vorhandenen FN-Seitenmodule noch nicht bereitgestellt.');
  for (const [id,result] of media) if (!result.ok) finding(result.code, result.code === 'media_preview_budget' ? 'Die Auswahl überschreitet den begrenzten Speicherrahmen dieser lokalen Vorschau.' : 'Eine gebundene Datei fehlt, wurde verändert oder hat ein anderes Format.', true, id);
  for (const image of document.images) if (!image.decorative && !image.alt.trim()) finding('alt_missing', 'Für dieses Bild fehlt noch ein Alternativtext.', false, image.id);
  const slots = [{ type: 'heading', level: 3, text: document.title }];
  if (hasContent(document.introduction)) slots.push({ type: 'richtext', html: renderRichText(document.introduction) });
  const preview = [`<h3>${esc(document.title)}</h3>`, renderRichText(document.introduction)];
  function appendSources(sources, sectionId) {
    for (const source of sources) {
      slots.push({ type: 'source', source: { ...source }, ...(sectionId === undefined ? {} : { sectionId }) });
      preview.push(sourceHtml(source));
    }
  }
  for (const section of document.sections) {
    slots.push({ type: 'heading', level: 4, text: section.title, sectionId: section.id });
    preview.push(`<section data-section="${esc(section.id)}"><h4>${esc(section.title)}</h4>`);
    if (section.kind === 'general-module') {
      slots.push({ type: 'code', code: FN_SPECIES_CODE, executeInPreview: false, module: 'existing-fn-species' });
      preview.push(`<div class="species-module">${mediaImage(species.normalAssets.portrait, species.commonName || species.scientificName, media, 'portrait')}<dl>${species.general.map(item => `<dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd>`).join('')}</dl><dl>${species.taxonomy.map(item => `<dt>${esc(item.rank)}</dt><dd>${esc(item.name)}</dd>`).join('')}</dl><p>${esc(species.status)}</p>`);
      const sound = species.normalAssets.sound;
      if (sound && media.get(sound.id)?.ok) preview.push(`<audio controls preload="none" src="${media.get(sound.id).dataUrl}"></audio>${attribution(sound)}`);
      if (species.normalAssets.spectrogram) preview.push(mediaImage(species.normalAssets.spectrogram, 'Spektrogramm des bereitgestellten Tons', media));
      preview.push('</div>');
    }
    if (hasContent(section.blocks)) { const html = renderRichText(section.blocks); slots.push({ type: 'richtext', html, sectionId: section.id }); preview.push(html); }
    if (document.emptyConfirmations[section.id]) preview.push('<p class="empty">Bewusst leer · bestätigt</p>');
    if (section.kind === 'map-module') { slots.push({ type: 'code', code: FN_MAP_CODE, executeInPreview: false, module: 'existing-fn-map' }); preview.push(mediaImage(species.normalAssets.map, `Verbreitung von ${species.commonName || species.scientificName}`, media)); }
    appendSources(section.sources, section.id);
    preview.push('</section>');
  }
  slots.push({ type: 'gallery', items: document.images.map((image,order) => ({ id: image.id, assetId: image.assetId, sha256: image.asset.sha256, bytes: image.asset.bytes,
    mimeType: image.asset.mimeType, alt: image.alt, caption: image.caption, decorative: image.decorative, order, attribution: image.asset.attribution })) });
  preview.push(`<div class="gallery">${document.images.map(image => `<figure data-image="${esc(image.id)}">${mediaImage(image.asset,image.alt,media)}${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`);
  appendSources(document.sources);
  const structure = { schemaVersion: 1, templateId: template.id, templateHash: template.templateHash, title: document.title, path: `${document.parentPath}/${document.slug}`,
    siteShell: template.siteShell, runtimeScripts: template.runtimeScripts, normalAssets: normalAssetUrls(species), normalAssetBindings: species.normalAssets,
    slots, intendedCmsState: 'unpublished', publish: false };
  const csp = "default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width"><title>${esc(document.title)} · Artseitenvorschau</title><style>body{font:17px/1.55 system-ui,sans-serif;max-width:1040px;margin:24px auto;padding:0 20px;color:#17352b;background:#fafbf8}img{display:block;max-width:100%;height:auto}.portrait{max-height:340px}h3{font-size:1.7em}h4{font-size:1.3em}figure{margin:12px 0}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}.source,.empty{font-size:.85em;color:#4e655c;white-space:pre-wrap}.open{color:#9a4b14}dt{font-weight:600}dd{margin-bottom:5px}audio{max-width:100%}</style><body><p class="source">Lokale Vorschau · vorhandene FN-Seitenbausteine · keine Websiteänderung</p><main>${preview.join('\n')}</main></body></html>`;
  const report = { schemaVersion: 1, revision: draft.revision, contentHash: fingerprint(document), imagesHash: pageImagesHash(document), templateHash: template.templateHash,
    speciesBindingHash: fingerprint(species), structureHash: fingerprint(structure), previewHash: sha256(html), findings,
    technicalReady: !findings.some(value => value.blocking), editorialReview: 'human-required', modelReview: 'not-performed', publicVerification: 'not-performed' };
  report.reportHash = fingerprint(report);
  return { html, structure, report };
}
