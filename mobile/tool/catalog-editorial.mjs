import { createHash } from 'node:crypto';

// Reviewed corrections of the exact captured website headings. A changed
// source heading for one of these articles requires a fresh editorial review.
const reviewedCorrections = new Map([
  ['acanthisflammea', ['birkenzeisig – Vogel karger Landschaften', 'Birkenzeisig – Vogel karger Landschaften']],
  ['alcedoatthis', ['Eisvogel – blauer, pfeilschnelle Jäger unserer Flüsse', 'Eisvogel – Der blaue, pfeilschnelle Jäger unserer Flüsse']],
  ['cebusimitator', ['Panama-Kapuzineraffe – klugeR Akrobat Des RegenWaldes', 'Panama-Kapuzineraffe – Kluger Akrobat des Regenwaldes']],
  ['cyanistescaeruleus', ['Blaumeise - klein, lebhaft und allgegenwärtig', 'Blaumeise - Klein, lebhaft und allgegenwärtig']],
  ['dendrobatesauratus', ['Goldbaumsteiger – GiftigeS Juwel des Regenwaldes', 'Goldbaumsteiger – Giftiges Juwel des Regenwaldes']],
  ['lusciniasvecica', ['Blaukehlchen - der Sänger mit der blauen Kehle', 'Blaukehlchen - Der Sänger mit der blauen Kehle']],
  ['motacillaalba', ['Bachstelze - Der Flinke Läufer am Wasser', 'Bachstelze - Der flinke Läufer am Wasser']],
  ['panurusbiarmicus', ['Bartmeise – eleganter Schilfbewohner mit Schnurrbart', 'Bartmeise – Eleganter Schilfbewohner mit Schnurrbart']],
]);
const subtitleSeparator = /\s+[-–—]\s+/u;
const capitalsInsideWord = /\p{Ll}\p{Lu}/u;
const capitalizedFunctionWord = /(?:^|\s)(?:Am|Auf|Aus|Bei|Durch|Für|Im|In|Mit|Über|Und|Vom|Von|Zum|Zur|Dem|Den|Der|Des)\b/u;

export function assertCatalogTitleQuality(catalog) {
  if (!Array.isArray(catalog?.species)) throw new Error('Katalogüberschriften können nicht geprüft werden.');
  const problems = [];
  for (const entry of catalog.species) {
    for (const [index, section] of (entry.sections ?? []).entries()) {
      const title = section.title;
      const separator = typeof title === 'string' ? subtitleSeparator.exec(title) : null;
      const parts = separator ? [title.slice(0, separator.index), title.slice(separator.index + separator[0].length)]
        : typeof title === 'string' ? [title] : [];
      const reviewed = index === 0 ? reviewedCorrections.get(entry.id) : undefined;
      const subtitleBody = parts[1]?.replace(/^\S+/u, '');
      if (parts.length === 0 || parts.some(part => !part.trim() || /^\p{Ll}/u.test(part.trim()) || capitalsInsideWord.test(part))
          || (subtitleBody && capitalizedFunctionWord.test(subtitleBody)) || (reviewed && title !== reviewed[1])) {
        problems.push(`${entry.id}, Überschrift ${index + 1}: ${title}`);
      }
    }
  }
  if (problems.length) throw new Error(`Redaktionelle Katalogprüfung fehlgeschlagen:\n${problems.join('\n')}`);
}

export function reviewedMobileCatalog(source) {
  const corrected = structuredClone(source);
  const changes = [];
  for (const entry of corrected.species) {
    const correction = reviewedCorrections.get(entry.id);
    if (!correction) continue;
    const [before, after] = correction;
    const heading = entry.sections[0];
    if (heading?.title === after) continue;
    if (heading?.title !== before) throw new Error(`Website-Überschrift für ${entry.id} wurde geändert und muss erneut geprüft werden.`);
    heading.title = after;
    changes.push({ id: entry.id, before, after });
  }
  assertCatalogTitleQuality(corrected);
  if (changes.length) {
    corrected.revision = createHash('sha256').update(JSON.stringify([source.revision, changes])).digest('hex');
  }
  return { catalog: corrected, changes };
}
