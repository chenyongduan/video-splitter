export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === "AbortError" || message === "AbortError";
}
