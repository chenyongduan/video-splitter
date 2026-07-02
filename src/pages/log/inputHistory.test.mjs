import assert from "node:assert/strict";
import test from "node:test";

import {
  addInputHistory,
  getNextHistoryCursor,
  getPreviousHistoryCursor,
  isCursorOnFirstLine,
  isCursorOnLastLine,
} from "./inputHistory.ts";

test("keeps only the latest five unique input history items", () => {
  const history = ["a", "b", "c", "d", "e"];

  assert.deepEqual(addInputHistory(history, "f"), ["b", "c", "d", "e", "f"]);
  assert.deepEqual(addInputHistory(history, "c"), ["a", "b", "d", "e", "c"]);
  assert.deepEqual(addInputHistory(history, "   "), history);
});

test("moves backward through input history without passing the oldest item", () => {
  const history = ["first", "second", "third"];

  assert.equal(getPreviousHistoryCursor(history, null), 2);
  assert.equal(getPreviousHistoryCursor(history, 2), 1);
  assert.equal(getPreviousHistoryCursor(history, 0), 0);
  assert.equal(getPreviousHistoryCursor([], null), null);
});

test("moves forward through input history and clears after the newest item", () => {
  const history = ["first", "second", "third"];

  assert.equal(getNextHistoryCursor(history, 0), 1);
  assert.equal(getNextHistoryCursor(history, 1), 2);
  assert.equal(getNextHistoryCursor(history, 2), null);
  assert.equal(getNextHistoryCursor(history, null), null);
});

test("detects whether the cursor is on the first line", () => {
  assert.equal(isCursorOnFirstLine("abc", 3), true);
  assert.equal(isCursorOnFirstLine("abc\ndef", 3), true);
  assert.equal(isCursorOnFirstLine("abc\ndef", 4), false);
});

test("detects whether the cursor is on the last line", () => {
  assert.equal(isCursorOnLastLine("abc", 0), true);
  assert.equal(isCursorOnLastLine("abc\ndef", 4), true);
  assert.equal(isCursorOnLastLine("abc\ndef", 3), false);
});
