import assert from "node:assert/strict";
import test from "node:test";
import { extractLaoBenchmarkModule } from "./coding-benchmark-contract.js";

test("coding benchmark accepts only bounded, explicitly named ESM candidates", () => {
  const js = "export function sumEvenIntegers(values) { return 0; }";
  assert.equal(extractLaoBenchmarkModule(js, "sumEvenIntegers"), js + "\n");
  assert.equal(extractLaoBenchmarkModule("```javascript\n" + js + "\n```", "sumEvenIntegers"), js + "\n");
  for (const bad of [null, {}, "", "wrong output", "```js\nexport const x = 3;\n```",
    js + "\n```extra", "x".repeat(12_001), "export function foo(){}\r"]) {
    assert.equal(extractLaoBenchmarkModule(bad, "sumEvenIntegers"), null);
  }
  assert.equal(extractLaoBenchmarkModule(js, "../../escape"), null);
});
