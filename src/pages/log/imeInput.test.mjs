import assert from "node:assert/strict";
import test from "node:test";

import { shouldSubmitOnEnter } from "./imeInput.ts";

test("submits only plain enter outside IME composition", () => {
  assert.equal(shouldSubmitOnEnter({ shiftKey: false }, false), true);
  assert.equal(shouldSubmitOnEnter({ shiftKey: true }, false), false);
  assert.equal(shouldSubmitOnEnter({ isComposing: true }, false), false);
  assert.equal(shouldSubmitOnEnter({ nativeEvent: { isComposing: true } }, false), false);
  assert.equal(shouldSubmitOnEnter({ nativeEvent: { keyCode: 229 } }, false), false);
  assert.equal(shouldSubmitOnEnter({ keyCode: 229 }, false), false);
  assert.equal(shouldSubmitOnEnter({ shiftKey: false }, true), false);
});
