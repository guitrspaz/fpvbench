/** Expected request failure with an HTTP status. */
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Identify binary/control characters while allowing normal text whitespace. */
export function containsControlText(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      (code < 32 && ![9, 10, 13].includes(code)) ||
      code === 127 ||
      code === 0xfffd
    )
      return true;
  }
  return false;
}

/** Reject dangerous object keys at every level without changing input. */
export function assertSafeObject(value, depth = 0) {
  if (depth > 20) throw new AppError("Object nesting is too deep.");
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new AppError("Unsupported object key.");
      assertSafeObject(value[key], depth + 1);
    }
  }
}
