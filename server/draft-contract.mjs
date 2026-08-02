// Draft의 공개 구조와 저장 전 검증은 이 파일이 함께 소유한다.
export const CHARACTER_POSE_IDS = [
  "thinking", "pointing", "comparing", "checking",
  "warning", "celebrating", "confused", "reading",
];

export function createDraftContract({
  DRAFT_COPY_LIMITS,
  DRAFT_VISUALIZATION_METHODS,
  analysisBlockIds,
  imageSources,
}) {
  function draftOutputSchema({
    cardCount = null,
    blockIds = [],
    allowedImages = [],
    allowedRules = ["NAR-01", "LAY-01", "CLR-01", "IMG-01"],
  } = {}) {
    return {
      type: "object",
      properties: {
        draft_title_ko: { type: "string" },
        cards: {
          type: "array",
          minItems: cardCount || 4,
          maxItems: cardCount || 8,
          items: {
            type: "object",
            properties: {
              position: { type: "integer" },
              role: {
                type: "string",
                enum: [
                  "cover",
                  "context",
                  "insight",
                  "warning",
                  "action",
                  "close",
                ],
              },
              eyebrow_ko: {
                type: "string",
                maxLength: DRAFT_COPY_LIMITS.eyebrow,
              },
              headline_ko: {
                type: "string",
                maxLength: DRAFT_COPY_LIMITS.headline,
              },
              body_ko: {
                type: "string",
                maxLength: DRAFT_COPY_LIMITS.body,
              },
              visualization_method: {
                type: "string",
                enum: DRAFT_VISUALIZATION_METHODS,
              },
              source_block_ids: {
                type: "array",
                items: blockIds.length
                  ? { type: "string", enum: blockIds }
                  : { type: "string" },
              },
              source_image_src: allowedImages.length
                ? {
                    type: ["string", "null"],
                    enum: [...allowedImages, null],
                  }
                : { type: ["string", "null"], enum: [null] },
              typography_assignment: {
                type: "object",
                properties: {
                  title_zone: { type: "string", enum: ["top", "middle"] },
                  title_align: { type: "string", enum: ["left", "center"] },
                  title_scale: { type: "string", enum: ["display", "large", "medium"] },
                  body_zone: { type: "string", enum: ["middle", "bottom"] },
                  body_max_lines: { type: "integer", minimum: 2, maximum: 6 },
                },
                required: ["title_zone", "title_align", "title_scale", "body_zone", "body_max_lines"],
                additionalProperties: false,
              },
              character_assignment: {
                type: ["object", "null"],
                properties: {
                  pose: { type: "string", enum: CHARACTER_POSE_IDS },
                  position: { type: "string", enum: ["left", "right", "bottom"] },
                  scale: { type: "string", enum: ["small", "medium", "large"] },
                  reason_ko: { type: "string", maxLength: 120 },
                },
                required: ["pose", "position", "scale", "reason_ko"],
                additionalProperties: false,
              },
              design_rule_ids: {
                type: "array",
                items: {
                  type: "string",
                  enum: allowedRules,
                },
              },
            },
            required: [
              "position",
              "role",
              "eyebrow_ko",
              "headline_ko",
              "body_ko",
              "visualization_method",
              "source_block_ids",
              "source_image_src",
              "typography_assignment",
              "character_assignment",
              "design_rule_ids",
            ],
            additionalProperties: false,
          },
        },
        caption_ko: { type: "string" },
        hashtags_ko: {
          type: "array",
          items: { type: "string" },
        },
        caveats_ko: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "draft_title_ko",
        "cards",
        "caption_ko",
        "hashtags_ko",
        "caveats_ko",
      ],
      additionalProperties: false,
    };
  }

  function validateDraftOutput(draft, analysis, source, allowedRuleIds) {
    const allowedBlocks = new Set(analysisBlockIds(analysis));
    const allowedImages = new Set(imageSources(source.content_html));
    const allowedRules = new Set(allowedRuleIds);
    const positions = draft.cards.map((card) => card.position);
    const visibleLength = (value) =>
      Array.from((value || "").replace(/\s/g, "")).length;
    if (
      draft.cards.length < 4 ||
      draft.cards.length > 8 ||
      draft.cards.length !== analysis.card_plan?.length ||
      positions.some((position, index) => position !== index + 1)
    ) {
      throw new Error("Draft는 분석 계획과 같은 수의 4~8장이어야 합니다.");
    }
    if (
      draft.cards[0]?.role !== "cover" ||
      !["action", "close"].includes(draft.cards.at(-1)?.role)
    ) {
      throw new Error("Draft는 표지로 시작하고 행동 제안으로 끝나야 합니다.");
    }
    if (
      draft.cards.some(
        (card) =>
          visibleLength(card.eyebrow_ko) > DRAFT_COPY_LIMITS.eyebrow ||
          visibleLength(card.headline_ko) > DRAFT_COPY_LIMITS.headline ||
          visibleLength(card.body_ko) > DRAFT_COPY_LIMITS.body,
      )
    ) {
      throw new Error("Draft 문구가 카드의 글자 수 제한을 초과했습니다.");
    }
    if (
      draft.cards.some(
        (card) =>
          !DRAFT_VISUALIZATION_METHODS.includes(card.visualization_method),
      )
    ) {
      throw new Error("Draft의 시각화 방식이 허용 목록에 없습니다.");
    }
    if (
      draft.cards.some((card) =>
        card.source_block_ids.some((id) => !allowedBlocks.has(id)),
      )
    ) {
      throw new Error("Draft가 분석에 없는 원문 블록을 인용했습니다.");
    }
    if (
      draft.cards.some(
        (card) =>
          card.source_image_src && !allowedImages.has(card.source_image_src),
      )
    ) {
      throw new Error("Draft가 원문에 없는 이미지를 사용했습니다.");
    }
    const assignedCharacters = draft.cards.filter(
      (card) => card.character_assignment,
    );
    if (
      assignedCharacters.length > 3 ||
      assignedCharacters.some(
        (card) => !CHARACTER_POSE_IDS.includes(card.character_assignment.pose),
      )
    ) {
      throw new Error("Draft 캐릭터는 허용 pose로 최대 3장에만 배정할 수 있습니다.");
    }
    if (
      draft.cards.some((card) =>
        card.design_rule_ids.some((id) => !allowedRules.has(id)),
      )
    ) {
      throw new Error("Draft가 Reference Library에 없는 규칙을 사용했습니다.");
    }
  }

  return { draftOutputSchema, validateDraftOutput };
}
