import assert from "node:assert/strict";
import test from "node:test";

import { summarizeDraftChanges } from "./draft-revision.mjs";

test("카드별 문구·배정·근거 변경을 분류한다", () => {
  const base = { cards: [{ position: 1, headline_ko: "전", eyebrow_ko: "눈", body_ko: "본문", typography_assignment: {}, character_assignment: null, source_image_src: null, source_block_ids: ["b1"], design_rule_ids: [] }] };
  const next = { cards: [{ ...base.cards[0], headline_ko: "후", character_assignment: { pose: "thinking" }, source_block_ids: ["b2"] }] };
  assert.deepEqual(summarizeDraftChanges(base, next), [{ position: 1, changes: ["문구", "캐릭터 배정", "원문 근거"] }]);
});

test("바뀌지 않은 카드는 변경 요약에서 제외한다", () => {
  const revision = { cards: [{ position: 1, headline_ko: "같음" }] };
  assert.deepEqual(summarizeDraftChanges(revision, revision), []);
});
