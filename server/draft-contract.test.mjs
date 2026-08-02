import assert from "node:assert/strict";
import test from "node:test";

import { createDraftContract } from "./draft-contract.mjs";

const METHODS = ["statement", "comparison", "warning"];
const { draftOutputSchema, validateDraftOutput } = createDraftContract({
  DRAFT_COPY_LIMITS: { eyebrow: 40, headline: 60, body: 120 },
  DRAFT_VISUALIZATION_METHODS: METHODS,
  analysisBlockIds: () => ["B001"],
  imageSources: () => ["/source.png"],
});

function card(position, role, character = null) {
  return {
    position,
    role,
    eyebrow_ko: "분류",
    headline_ko: `제목 ${position}`,
    body_ko: "본문",
    visualization_method: "statement",
    source_block_ids: ["B001"],
    source_image_src: null,
    typography_assignment: {
      title_zone: "top",
      title_align: "left",
      title_scale: "large",
      body_zone: "middle",
      body_max_lines: 3,
    },
    character_assignment: character,
    design_rule_ids: ["RULE-1"],
  };
}

function draft() {
  return {
    draft_title_ko: "초안",
    cards: [
      card(1, "cover"),
      card(2, "insight"),
      card(3, "insight"),
      card(4, "close"),
    ],
    caption_ko: "캡션",
    hashtags_ko: [],
    caveats_ko: [],
  };
}

const analysis = { card_plan: [{}, {}, {}, {}] };
const source = { content_html: '<img src="/source.png">' };

test("assignment draft schema는 typography와 character를 요구한다", () => {
  const cardSchema = draftOutputSchema({ cardCount: 4 }).properties.cards.items;
  assert.ok(cardSchema.required.includes("typography_assignment"));
  assert.ok(cardSchema.required.includes("character_assignment"));
});

test("유효한 배경 없는 assignment draft를 허용한다", () => {
  assert.doesNotThrow(() =>
    validateDraftOutput(draft(), analysis, source, ["RULE-1"]),
  );
});

test("캐릭터가 3장을 넘으면 거부한다", () => {
  const invalid = draft();
  invalid.cards.forEach((item) => {
    item.character_assignment = {
      pose: "thinking",
      position: "right",
      scale: "small",
      reason_ko: "테스트",
    };
  });
  assert.throws(
    () => validateDraftOutput(invalid, analysis, source, ["RULE-1"]),
    /최대 3장/,
  );
});

test("한국어 필드가 영어로만 작성되면 거부한다", () => {
  const invalid = draft();
  invalid.cards[1].headline_ko = "English only";
  assert.throws(
    () => validateDraftOutput(invalid, analysis, source, ["RULE-1"]),
    /한국어 문구/,
  );
});
