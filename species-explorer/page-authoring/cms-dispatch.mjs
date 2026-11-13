import { isProxy } from 'node:util/types';
import { identifier, digest, text, check, PageAuthoringError } from './contract.mjs';

const INPUT_KEYS = ['projectId', 'attemptId', 'dispatchId', 'planHash', 'targetPath'];
const BINDING_KEYS = ['kind', 'schemaVersion', ...INPUT_KEYS, 'placeholderTitle'];
const CONTEXT_KEYS = ['planHash', 'targetPath', 'projectId', 'attemptId'];
const TARGET_KEYS = ['path', 'exists', 'parentPath', 'parentExists', 'online', 'observationId', 'checkedAt'];
const invalid = condition => {
  if (!condition) throw new PageAuthoringError(400, 'cms_dispatch_binding_invalid', 'Der CMS-Journalbezug ist ungültig oder unvollständig.');
};

// Inspect every descriptor before reading values. Proxies, accessors, symbols,
// inherited records and toJSON hooks must never become journal data.
function record(value, keys, optional = false) {
  invalid(value && typeof value === 'object' && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  const ownKeys = Reflect.ownKeys(value);
  invalid((optional || ownKeys.length === keys.length) && ownKeys.every(key => typeof key === 'string' && keys.includes(key)));
  const descriptors = ownKeys.map(key => [key, Object.getOwnPropertyDescriptor(value, key)]);
  invalid(descriptors.every(([, descriptor]) => descriptor?.enumerable && Object.hasOwn(descriptor, 'value')));
  return Object.fromEntries(descriptors.map(([key, descriptor]) => [key, descriptor.value]));
}

function primitive(validate, value) {
  try { return validate(value); }
  catch (error) {
    if (error instanceof PageAuthoringError) invalid(false);
    throw error;
  }
}

/** Shared FN target-path rule; the browser maps failures to its own input error. */
export function cmsTargetPath(value) {
  invalid(typeof value === 'string' && value.length <= 500 && value === value.trim()
    && /^\/wildlife\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
  return value;
}

/** The temporary root-level draft address is derived from the persisted journal identity. */
export function cmsNeutralDraftPath(dispatchBinding) {
  const { placeholderTitle } = validateCmsDispatchBinding(dispatchBinding);
  const path = `/${placeholderTitle.toLowerCase().replaceAll(' ', '-')}`;
  invalid(path.length <= 160 && /^\/fn-artseitenentwurf-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path));
  return path;
}

/** Checks a fresh read-only result, including the exact existing parent and absent target. */
export function validateCmsTargetObservation(input, targetPath, now = Date.now()) {
  const path = cmsTargetPath(targetPath);
  const value = record(input, TARGET_KEYS, true);
  check(value.path === path && value.exists === false && value.online === true && value.parentExists === true
    && value.parentPath === path.slice(0, path.lastIndexOf('/')),
  'target_not_new', 'Der freie neue Seitenpfad und sein vorhandener Websitebereich konnten nicht bestätigt werden.', 409);
  identifier(value.observationId);
  text(value.checkedAt, 80);
  const checkedAt = Date.parse(value.checkedAt);
  check(Number.isFinite(checkedAt), 'target_observation_invalid', 'Die Zielbeobachtung ist ungültig.', 409);
  const age = now - checkedAt;
  check(Number.isFinite(age) && age >= -30000 && age <= 120000,
    'target_observation_stale', 'Der freie neue Zielpfad muss unmittelbar vor diesem Auftrag geprüft werden.', 409);
  return value;
}

function references(value) {
  return {
    projectId: primitive(identifier, value.projectId),
    attemptId: primitive(identifier, value.attemptId),
    dispatchId: primitive(identifier, value.dispatchId),
    planHash: primitive(digest, value.planHash),
    targetPath: cmsTargetPath(value.targetPath),
  };
}

function binding(value) {
  return { kind: 'fn-cms-dispatch-binding', schemaVersion: 1, ...value,
    placeholderTitle: `FN Artseitenentwurf ${value.dispatchId}` };
}

/** Pure journal reference only. Creation does not dispatch or authorize a CMS write. */
export function createCmsDispatchBinding(input) {
  return binding(references(record(input, INPUT_KEYS)));
}

/** Return an independent copy and, when supplied, match the current journal context. */
export function validateCmsDispatchBinding(input, expected = {}) {
  const value = record(input, BINDING_KEYS), context = record(expected, CONTEXT_KEYS, true);
  invalid(value.kind === 'fn-cms-dispatch-binding' && value.schemaVersion === 1);
  const result = binding(references(value));
  invalid(value.placeholderTitle === result.placeholderTitle);
  for (const key of Object.keys(context)) {
    const validate = key === 'planHash' ? digest : key === 'targetPath' ? cmsTargetPath : identifier;
    const actual = primitive(validate, context[key]);
    if (result[key] !== actual) throw new PageAuthoringError(409, 'cms_dispatch_binding_mismatch',
      'Der CMS-Journalbezug gehört nicht zum aktuellen Seitenauftrag.');
  }
  return result;
}
