const baseUrl = (process.env.GETDI_BASE_URL || "http://localhost:5545").replace(
  /\/$/,
  "",
);
const slugs = [
  "product-sense-definition",
  "design-system-maturity",
  "after-design-critique",
  "design-disposables",
];

async function createFableVariant(slug) {
  const analysisResponse = await fetch(
    `${baseUrl}/api/analyses/${encodeURIComponent(slug)}`,
  );
  const analysis = await analysisResponse.json();
  if (!analysisResponse.ok) {
    throw new Error(analysis.error || `분석을 찾지 못했습니다: ${slug}`);
  }
  const path = `/api/drafts/${encodeURIComponent(slug)}`;
  const cachedResponse = await fetch(`${baseUrl}${path}`);
  const document = await cachedResponse.json();
  if (!cachedResponse.ok) {
    throw new Error(document.error || `Draft를 찾지 못했습니다: ${slug}`);
  }
  const latestRun = document.model_runs?.at(-1);
  const current = document.revisions?.find(
    (revision) => revision.revision === document.current_revision,
  );
  if (
    latestRun?.model?.includes("fable") &&
    current?.cards?.length === analysis.card_plan?.length &&
    current?.analysis_prompt_version === analysis.prompt_version &&
    current?.reference_profile_id === "set-b" &&
    current?.cards?.every((card) => card.visualization_method)
  ) {
    process.stderr.write(`[cached] fable ${slug}\n`);
    return {
      slug,
      status: "cached",
      revision: document.current_revision,
      cards: current.cards.length,
    };
  }

  process.stderr.write(`[create] fable ${slug}\n`);
  const response = await fetch(`${baseUrl}${path}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expected_revision: document.current_revision,
      model: "fable",
      instruction:
        `Sol 버전과 같은 GetDi Cardnews Production Prompt v2, 새 분석 ${analysis.prompt_version}, 같은 원문 근거와 Reference Library set-b 프로필을 사용해 정확히 ${analysis.card_plan.length}장으로 독립적인 Fable 비교 버전을 만들어줘. 제목 22자, 본문 55자와 visualization_method 계약을 지켜줘.`,
    }),
  });
  const revised = await response.json();
  if (!response.ok) {
    throw new Error(revised.error || `Fable 생성 실패: ${response.status}`);
  }
  const revision = revised.revisions.find(
    (item) => item.revision === revised.current_revision,
  );
  return {
    slug,
    status: "created",
    revision: revised.current_revision,
    cards: revision.cards.length,
    model: revised.model_runs.at(-1)?.model,
  };
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < slugs.length) {
    const index = cursor;
    cursor += 1;
    try {
      results[index] = { ok: true, ...(await createFableVariant(slugs[index])) };
    } catch (error) {
      results[index] = { ok: false, slug: slugs[index], error: error.message };
    }
  }
}

await Promise.all([worker(), worker()]);
const failed = results.filter((item) => !item.ok).length;
process.stdout.write(`${JSON.stringify({ results, failed }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
