export class ProjectError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ProjectError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(status, code, message, details) {
  throw new ProjectError(status, code, message, details);
}

export function check(condition, status, code, message) {
  if (!condition) fail(status, code, message);
}
