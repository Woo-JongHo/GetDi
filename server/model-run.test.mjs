import assert from "node:assert/strict";
import test from "node:test";
import { normalizeModelRun } from "./model-run.mjs";

test("provider별 usage를 nullable 공통 ModelRun으로 정규화한다", () => {
  const run = normalizeModelRun({ id: "1", operation: "analysis", provider: "Claude Code", model: "fable", status: "completed", usage: { models: { fable: { inputTokens: 10, outputTokens: 4 } } } });
  assert.equal(run.stage, "analysis");
  assert.deepEqual(run.tokens, { input: 10, output: 4, cached_input: null, reasoning_output: null, source: "actual" });
  assert.equal(run.cost.source, "unavailable");
});

test("미제공 토큰은 0이 아니라 unavailable null이다", () => {
  const run = normalizeModelRun({ id: "2", stage: "draft", status: "failed", error: "timeout" });
  assert.equal(run.tokens.input, null);
  assert.equal(run.tokens.source, "unavailable");
  assert.equal(run.error_code, "MODEL_RUN_FAILED");
});
