import { isProxy } from 'node:util/types';
import { check } from './errors.mjs';
import { canonicalJson, digest } from './security.mjs';
import { validateSpeciesRecord } from './species-record.mjs';
import { projectPageEditorial } from './species-editorial.mjs';
import { readerEditorialFromProjection } from './species-editorial-data.mjs';
import { createPageEditorialIntent, validatePageEditorialIntent } from './species-editorial-intent.mjs';
import { identifier } from '../page-authoring/contract.mjs';

const LIMITS = { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 };
const canonical = value => canonicalJson(value, LIMITS);
const changedMessage = 'Seite, Artgrundlage, Person oder redaktionelle Übernahme wurde geändert. Bitte den aktuellen Stand erneut prüfen.';
const changed = condition => check(condition, 409, 'editorial_adoption_changed', changedMessage);

function actorBinding(actor, projectId) {
  check(actor && typeof actor === 'object' && !isProxy(actor) && !Array.isArray(actor)
    && Object.getPrototypeOf(actor) === Object.prototype
    && Object.values(Object.getOwnPropertyDescriptors(actor)).every(value => 'value' in value),
  400, 'invalid_editorial_intent', 'Die redaktionelle Übernahme benötigt eine tatsächliche persönliche Projektbindung.');
  try { identifier(projectId); identifier(actor.id); identifier(actor.projectId); }
  catch { check(false, 400, 'invalid_editorial_intent', 'Die persönliche Projektbindung ist ungültig.'); }
  changed(actor.projectId === projectId && ['admin', 'publisher', 'contributor'].includes(actor.role)
    && (actor.scope === undefined || actor.scope === 'full'));
  return { projectId, userId: actor.id, role: actor.role };
}

/**
 * Pure candidate, not a write or authorization grant. The caller obtains the
 * actual page HEAD and exact species base version; no lookup or retry occurs.
 * Only schemaVersion/editorial change. Reader approval and CMS stay separate.
 */
export function buildPageEditorialAdoption({ pageObject, speciesObject, projectId, actor } = {}) {
  const binding = actorBinding(actor, projectId);
  const projection = projectPageEditorial({ pageObject, speciesObject, projectId });
  const previous = validateSpeciesRecord(speciesObject.data, speciesObject.id);
  const data = validateSpeciesRecord({ ...previous, schemaVersion: 2,
    editorial: readerEditorialFromProjection(projection) }, speciesObject.id);
  const intent = createPageEditorialIntent({ sourceBindings: projection.sourceBindings,
    projectionHash: digest(canonical(projection)), actor: binding });
  return { data, intent, projection };
}

/**
 * Verify a supplied claim against caller-owned current page HEAD and species
 * BASE (not a concurrent species head). Normal server CAS/conflict handling is
 * deliberately outside this pure function. No supplied data/intent is trusted.
 */
export function verifyPageEditorialAdoption({ pageObject, speciesObject, projectId, actor, data, intent } = {}) {
  let claim;
  try { claim = validatePageEditorialIntent(intent); }
  catch { check(false, 400, 'invalid_editorial_intent', 'Der redaktionelle Übernahmebeleg ist ungültig oder unvollständig.'); }
  const binding = actorBinding(actor, projectId);
  changed(canonical(binding) === canonical(claim.binding) && claim.sourceBindings.projectId === projectId);
  changed(pageObject?.id === claim.sourceBindings.page.objectId
    && pageObject?.revision === claim.sourceBindings.page.objectRevision
    && speciesObject?.id === claim.sourceBindings.species.id
    && speciesObject?.revision === claim.sourceBindings.species.objectRevision);
  let candidate;
  try { candidate = buildPageEditorialAdoption({ pageObject, speciesObject, projectId, actor }); }
  catch { changed(false); }
  let supplied;
  try { validateSpeciesRecord(data, speciesObject.id); supplied = canonical(data); }
  catch { changed(false); }
  changed(supplied === canonical(candidate.data) && canonical(claim) === canonical(candidate.intent));
  return candidate;
}
