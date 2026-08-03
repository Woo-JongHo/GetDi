import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedRuleIds,
  createReviewEvent,
  evidenceCandidates,
} from "./evidence.mjs";

const analysis = {
  sets: [{ id: "set-b", rules: [{ id: "LAY-01", title: "위계", instruction: "위계를 둔다.", evidence_cards: [1, 2], confidence: 0.9 }] }],
};

test("근거 후보는 관찰·해석·규칙과 검토 상태를 분리한다", () => {
  const [candidate] = evidenceCandidates(analysis);
  assert.equal(candidate.kind, "design-rule");
  assert.equal(candidate.review_status, "pending");
  assert.deepEqual(candidate.source_locator.card_indexes, [1, 2]);
  assert.equal(candidate.interpretation, "위계");
  assert.equal(candidate.rule, "위계를 둔다.");
});

test("마지막 append-only 검토 event만 현재 상태가 된다", () => {
  const events = [
    { id: "1", candidate_id: "design-rule:set-b:LAY-01", status: "approved" },
    { id: "2", candidate_id: "design-rule:set-b:LAY-01", status: "needs-change" },
  ];
  assert.equal(evidenceCandidates(analysis, events)[0].review_status, "needs-change");
  assert.deepEqual(approvedRuleIds("set-b", analysis.sets[0].rules, events), []);
});

test("승인된 규칙만 생성 allowlist에 포함한다", () => {
  const event = createReviewEvent({
    candidateId: "design-rule:set-b:LAY-01",
    status: "approved",
    note: "카드 근거 확인",
    now: "2026-08-03T00:00:00.000Z",
    eventId: "event-1",
  });
  assert.deepEqual(approvedRuleIds("set-b", analysis.sets[0].rules, [event]), ["LAY-01"]);
});
