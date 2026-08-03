import assert from "node:assert/strict";
import test from "node:test";
import { canaryDecision, hermesReport } from "./hermes_contract_canary.mjs";

const baseline = `<html><head><link rel="canonical" href="https://www.nngroup.com/articles/a/"><meta name="description" content="요약"></head><body><h1 class="article-h1">제목</h1><article><div class="article-body"><p>본문 문장</p><img src="/a.png" alt="a"></div></article></body></html>`;

test("구조·block·asset 변화와 영향 slug를 보고하고 코드를 수정하지 않는다", () => {
  const report = hermesReport([{ slug: "a", baseline, candidate: baseline.replace("<p>본문 문장</p>", "<h2>바뀐 구조</h2>") }]);
  assert.equal(report.status, "change-detected");
  assert.deepEqual(report.affected_slugs, ["a"]);
  assert.equal(report.code_modified, false);
});

test("승인된 제안도 canary가 안정적일 때만 승격한다", () => {
  const stable = hermesReport([{ slug: "a", baseline, candidate: baseline }]);
  assert.equal(canaryDecision(stable, { status: "pending" }).promoted, false);
  assert.equal(canaryDecision(stable, { status: "approved" }).promoted, true);
  const changed = hermesReport([{ slug: "a", baseline, candidate: baseline.replace("<p>본문 문장</p>", "<p>완전히 달라진 긴 문장</p>") }]);
  assert.equal(canaryDecision(changed, { status: "approved" }).promoted, false);
});
