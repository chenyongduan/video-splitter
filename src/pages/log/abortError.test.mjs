import assert from "node:assert/strict";
import test from "node:test";

import { isAbortError } from "./abortError.ts";

test("detects abort errors without matching regular failures", () => {
  assert.equal(isAbortError(new DOMException("The operation was aborted", "AbortError")), true);
  assert.equal(isAbortError(new Error("AbortError")), true);
  assert.equal(isAbortError({ name: "AbortError" }), true);
  assert.equal(isAbortError(new Error("AI 请求失败: 500")), false);
});
