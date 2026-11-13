export class LanguageCheckError extends Error {
  constructor(code, message, statusCode = 409) {
    super(message); this.name = "LanguageCheckError"; this.code = code; this.statusCode = statusCode;
  }
}
export function requireValue(condition, code, message, statusCode = 409) {
  if (!condition) throw new LanguageCheckError(code, message, statusCode);
}
export const cancelled = () => new LanguageCheckError("LANGUAGE_CHECK_CANCELLED", "Die Sprachprüfung wurde abgebrochen.");
