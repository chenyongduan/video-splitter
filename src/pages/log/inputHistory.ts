const DEFAULT_HISTORY_LIMIT = 5;

export function addInputHistory(history: string[], value: string, limit = DEFAULT_HISTORY_LIMIT) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return history;

  return [...history.filter((item) => item !== normalizedValue), normalizedValue].slice(-limit);
}

export function getPreviousHistoryCursor(history: string[], currentCursor: number | null) {
  if (history.length === 0) return null;
  if (currentCursor === null) return history.length - 1;
  return Math.max(currentCursor - 1, 0);
}

export function getNextHistoryCursor(history: string[], currentCursor: number | null) {
  if (history.length === 0 || currentCursor === null) return null;
  const nextCursor = currentCursor + 1;
  return nextCursor >= history.length ? null : nextCursor;
}

export function isCursorOnFirstLine(value: string, selectionStart: number | null | undefined) {
  const cursorPosition = selectionStart ?? 0;
  const firstLineEndIndex = value.indexOf("\n");
  return firstLineEndIndex === -1 || cursorPosition <= firstLineEndIndex;
}

export function isCursorOnLastLine(value: string, selectionStart: number | null | undefined) {
  const cursorPosition = selectionStart ?? value.length;
  const lastLineStartIndex = value.lastIndexOf("\n") + 1;
  return cursorPosition >= lastLineStartIndex;
}
