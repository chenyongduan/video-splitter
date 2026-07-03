import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAssistantHtml } from "./htmlMessage.ts";

test("keeps table markup while removing unsafe tags and attributes", () => {
  const html = [
    '<p onclick="bad()">学生数据</p>',
    '<table style="width:100%"><thead><tr><th>姓名</th></tr></thead><tbody><tr><td>小明</td></tr></tbody></table>',
    '<script>alert(1)</script>',
    '<img src=x onerror="bad()">',
  ].join("");

  assert.equal(
    sanitizeAssistantHtml(html),
    "<p>学生数据</p><table><thead><tr><th>姓名</th></tr></thead><tbody><tr><td>小明</td></tr></tbody></table>"
  );
});
