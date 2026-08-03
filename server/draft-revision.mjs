const COPY_FIELDS = ["eyebrow_ko", "headline_ko", "body_ko"];

export function summarizeDraftChanges(previous, next) {
  const before = new Map((previous.cards || []).map((card) => [card.position, card]));
  return (next.cards || []).flatMap((card) => {
    const old = before.get(card.position);
    if (!old) return [{ position: card.position, changes: ["카드 추가"] }];
    const changes = [];
    if (COPY_FIELDS.some((field) => old[field] !== card[field])) changes.push("문구");
    if (JSON.stringify(old.typography_assignment) !== JSON.stringify(card.typography_assignment)) changes.push("글씨 배정");
    if (JSON.stringify(old.character_assignment) !== JSON.stringify(card.character_assignment)) changes.push("캐릭터 배정");
    if (old.source_image_src !== card.source_image_src) changes.push("본문 이미지");
    if (JSON.stringify(old.source_block_ids) !== JSON.stringify(card.source_block_ids)) changes.push("원문 근거");
    if (JSON.stringify(old.design_rule_ids) !== JSON.stringify(card.design_rule_ids)) changes.push("디자인 근거");
    return changes.length ? [{ position: card.position, changes }] : [];
  });
}
