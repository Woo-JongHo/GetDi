export const EVIDENCE_KINDS = [
  "direct-source",
  "design-rule",
  "user-instruction",
  "inference",
  "unsupported",
];

export const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs-change",
];

export function candidateId(profileId, ruleId) {
  return `design-rule:${profileId}:${ruleId}`;
}

export function latestReviewByCandidate(events = []) {
  const latest = new Map();
  for (const event of events) latest.set(event.candidate_id, event);
  return latest;
}

export function evidenceCandidates(document, events = []) {
  const latest = latestReviewByCandidate(events);
  return (document.sets || []).flatMap((profile) =>
    (profile.rules || []).map((rule) => {
      const id = candidateId(profile.id, rule.id);
      const review = latest.get(id);
      return {
        id,
        target: { type: "DesignDecision", id: rule.id },
        kind: "design-rule",
        observation: `카드 ${rule.evidence_cards?.join(", ") || "미지정"}에서 반복 관찰`,
        interpretation: rule.title,
        rule: rule.instruction,
        source_locator: {
          type: "reference-cards",
          profile_id: profile.id,
          card_indexes: rule.evidence_cards || [],
        },
        confidence: rule.confidence ?? null,
        review_status: review?.status || "pending",
        review_event_id: review?.id || null,
      };
    }),
  );
}

export function createReviewEvent({ candidateId: id, status, note = "", now, eventId }) {
  if (!id?.startsWith("design-rule:")) throw new Error("근거 후보 ID가 올바르지 않습니다.");
  if (!REVIEW_STATUSES.includes(status) || status === "pending") {
    throw new Error("승인, 반려, 수정 요청 중 하나를 선택해주세요.");
  }
  return {
    id: eventId,
    candidate_id: id,
    status,
    note: String(note).trim().slice(0, 500),
    created_at: now,
  };
}

export function approvedRuleIds(profileId, rules, events = []) {
  const latest = latestReviewByCandidate(events);
  return rules
    .filter((rule) => latest.get(candidateId(profileId, rule.id))?.status === "approved")
    .map((rule) => rule.id);
}
