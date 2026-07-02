import assert from "node:assert/strict";
import test from "node:test";

import { formatAnalysisElapsed } from "./analysisElapsed.ts";

test("formats analysis elapsed seconds with minutes only after one minute", () => {
  assert.equal(formatAnalysisElapsed(0), "0s");
  assert.equal(formatAnalysisElapsed(59), "59s");
  assert.equal(formatAnalysisElapsed(60), "1m 0s");
  assert.equal(formatAnalysisElapsed(75), "1m 15s");
});
