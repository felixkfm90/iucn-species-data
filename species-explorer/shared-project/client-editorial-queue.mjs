import { isProxy } from "node:util/types";
import { check } from "./errors.mjs";
import { canonicalJson, objectJson } from "./security.mjs";
import { validatePageEditorialIntent } from "./species-editorial-intent.mjs";

const KEYS = ["changeId", "kind", "id", "baseRevision", "data", "intent"];
const CODE = "invalid_editorial_request";
const MESSAGE = "Die gespeicherte redaktionelle Übernahme ist nicht eindeutig an Inhalt, Ausgangsfassung und persönliche Projektanmeldung gebunden.";
const limits = { maxBytes: 4 * 1024 * 1024 + 16 * 1024, maxNodes: 300000 };

function exactRequest(request) {
  check(request && typeof request === "object" && !isProxy(request) && !Array.isArray(request)
    && Object.getPrototypeOf(request) === Object.prototype, 400, CODE, MESSAGE);
  const descriptors = Object.getOwnPropertyDescriptors(request), keys = Reflect.ownKeys(descriptors);
  check(keys.length === KEYS.length && keys.every(key => typeof key === "string" && KEYS.includes(key)
    && descriptors[key].enumerable === true && Object.hasOwn(descriptors[key], "value")), 400, CODE, MESSAGE);
  return Object.fromEntries(KEYS.map(key => [key, descriptors[key].value]));
}

/** Validate a sealed queue request without rebasing, editing or authorizing it. */
export function validateSealedEditorialRequest(input, { changeId, kind, id, baseRevision, data, projectId, userId, role } = {}) {
  const request = exactRequest(input), intent = validatePageEditorialIntent(request.intent);
  check(typeof request.changeId === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(request.changeId)
    && request.changeId === changeId && request.kind === "species" && kind === "species" && request.id === id
    && request.id === intent.sourceBindings.species.id && request.baseRevision === baseRevision
    && request.baseRevision === intent.sourceBindings.species.objectRevision
    && intent.binding.projectId === projectId && intent.binding.userId === userId
    && (role === undefined || intent.binding.role === role), 400, CODE, MESSAGE);
  check(request.data?.type === "fn-species-record" && request.data.schemaVersion === 2 && request.data.id === request.id,
    400, CODE, MESSAGE);
  check(objectJson(request.data) === objectJson(data)
    && canonicalJson(request.data.editorial?.sourceBindings) === canonicalJson(intent.sourceBindings), 400, CODE, MESSAGE);
  return JSON.parse(canonicalJson({ ...request, intent }, limits));
}
