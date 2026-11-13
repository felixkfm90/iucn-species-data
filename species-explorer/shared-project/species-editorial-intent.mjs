import { isProxy } from 'node:util/types';
import { check } from './errors.mjs';
import { canonicalJson, digest } from './security.mjs';
import { identifier, slug, digest as boundHash } from '../page-authoring/contract.mjs';

const SOURCE_CODE = 'invalid_editorial_source_bindings';
const INTENT_CODE = 'invalid_editorial_intent';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PAGE_OBJECT_ID = /^fn-species-page-[a-f0-9]{64}$/;
const ROLES = ['admin', 'publisher', 'contributor'];
const message = 'Der redaktionelle Übernahmebeleg enthält ungültige oder unvollständige Bindungen.';
const clone = value => JSON.parse(canonicalJson(value));

// Validate descriptors before reading values. In particular, neither getters,
// toJSON, hidden properties, symbols nor Proxy traps may manufacture a proof.
function exact(value, keys, code) {
  check(value !== null && typeof value === 'object' && !isProxy(value) && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype, 400, code, message);
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(descriptors);
  check(actual.length === keys.length && actual.every(key => typeof key === 'string' && keys.includes(key)
    && descriptors[key].enumerable === true && Object.hasOwn(descriptors[key], 'value')), 400, code, message);
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

function primitive(rule, value, code) {
  try { return rule(value); }
  catch { check(false, 400, code, message); }
}

function revision(value) {
  check(typeof value === 'string' && UUID.test(value), 400, SOURCE_CODE, message);
  return value;
}

/**
 * Pure structural validation of exact source claims, not a lookup or authority
 * check. The future queue/server must obtain the actual current server heads.
 */
export function validateEditorialSourceBindings(input) {
  const source = exact(input, ['projectId', 'page', 'species'], SOURCE_CODE);
  const page = exact(source.page, ['objectId', 'objectRevision', 'dataRevision', 'contentHash', 'imagesHash', 'dataHash'], SOURCE_CODE);
  const species = exact(source.species, ['id', 'objectRevision', 'dataHash', 'sourceHash'], SOURCE_CODE);
  check(typeof page.objectId === 'string' && PAGE_OBJECT_ID.test(page.objectId), 400, SOURCE_CODE, message);
  return clone({ projectId: primitive(identifier, source.projectId, SOURCE_CODE),
    page: { objectId: page.objectId, objectRevision: revision(page.objectRevision),
      dataRevision: primitive(boundHash, page.dataRevision, SOURCE_CODE), contentHash: primitive(boundHash, page.contentHash, SOURCE_CODE),
      imagesHash: primitive(boundHash, page.imagesHash, SOURCE_CODE), dataHash: primitive(boundHash, page.dataHash, SOURCE_CODE) },
    species: { id: primitive(slug, species.id, SOURCE_CODE), objectRevision: revision(species.objectRevision),
      dataHash: primitive(boundHash, species.dataHash, SOURCE_CODE), sourceHash: primitive(boundHash, species.sourceHash, SOURCE_CODE) } });
}

/**
 * This evidence grants no permission. The caller-supplied projection hash must
 * come from the trusted Node projector; renderer claims are never its proof.
 * A later write still needs real actor authorization and projection recomputation.
 */
export function createPageEditorialIntent(input) {
  const value = exact(input, ['sourceBindings', 'projectionHash', 'actor'], INTENT_CODE);
  return validatePageEditorialIntent({ kind: 'page-editorial-adoption', schemaVersion: 1,
    binding: value.actor, sourceBindings: value.sourceBindings, projectionHash: value.projectionHash });
}

/** Return independent canonical data; preserve every bound identifier exactly. */
export function validatePageEditorialIntent(input) {
  const value = exact(input, ['kind', 'schemaVersion', 'binding', 'sourceBindings', 'projectionHash'], INTENT_CODE);
  check(value.kind === 'page-editorial-adoption' && value.schemaVersion === 1, 400, INTENT_CODE, message);
  const actor = exact(value.binding, ['projectId', 'userId', 'role'], INTENT_CODE);
  check(typeof actor.role === 'string' && ROLES.includes(actor.role), 400, INTENT_CODE, message);
  const binding = { projectId: primitive(identifier, actor.projectId, INTENT_CODE), userId: primitive(identifier, actor.userId, INTENT_CODE), role: actor.role };
  const sourceBindings = validateEditorialSourceBindings(value.sourceBindings);
  check(binding.projectId === sourceBindings.projectId, 400, INTENT_CODE, message);
  return clone({ kind: 'page-editorial-adoption', schemaVersion: 1, binding, sourceBindings,
    projectionHash: primitive(boundHash, value.projectionHash, INTENT_CODE) });
}

export function pageEditorialIntentHash(intent) {
  return digest(canonicalJson(validatePageEditorialIntent(intent)));
}
