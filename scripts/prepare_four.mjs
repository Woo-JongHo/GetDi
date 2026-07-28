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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = { error: `Invalid JSON (${response.status})` };
  }
  return { response, body };
}

async function ensureArtifact(kind, slug) {
  const path = `/api/${kind}/${encodeURIComponent(slug)}`;
  const cached = await request(path);
  if (cached.response.ok) {
    process.stderr.write(`[cached] ${kind} ${slug}\n`);
    return { status: "cached", body: cached.body };
  }
  if (cached.response.status !== 404) {
    throw new Error(cached.body.error || `${kind} GET ${cached.response.status}`);
  }
  process.stderr.write(`[create] ${kind} ${slug}\n`);
  const created = await request(path, { method: "POST" });
  if (!created.response.ok) {
    throw new Error(created.body.error || `${kind} POST ${created.response.status}`);
  }
  return { status: "created", body: created.body };
}

async function ensureDraft(slug, analysis) {
  const path = `/api/drafts/${encodeURIComponent(slug)}`;
  const cached = await request(path);
  if (cached.response.status === 404) {
    process.stderr.write(`[create] draft ${slug}\n`);
    const created = await request(path, { method: "POST" });
    if (!created.response.ok) {
      throw new Error(created.body.error || `draft POST ${created.response.status}`);
    }
    return { status: "created", body: created.body };
  }
  if (!cached.response.ok) {
    throw new Error(cached.body.error || `draft GET ${cached.response.status}`);
  }

  const current = cached.body.revisions?.find(
    (revision) => revision.revision === cached.body.current_revision,
  );
  const latestModel = cached.body.model_runs?.at(-1)?.model || "";
  const isV2 =
    latestModel === "gpt-5.6-sol" &&
    current?.cards?.length === analysis.card_plan?.length &&
    current?.analysis_prompt_version === analysis.prompt_version &&
    current?.reference_profile_id === "set-b" &&
    current?.cards?.every((card) => card.visualization_method);
  if (isV2) {
    process.stderr.write(`[cached] draft ${slug} · sol\n`);
    return { status: "cached", body: cached.body };
  }

  process.stderr.write(`[revise] draft ${slug} → gpt-5.6-sol\n`);
  const revised = await request(`${path}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expected_revision: cached.body.current_revision,
      instruction:
        `GetDi Cardnews Production Prompt v2와 새 분석 ${analysis.prompt_version}을 적용해 정확히 ${analysis.card_plan.length}장으로 전체 카드를 다시 작성해줘. 제목 22자, 본문 55자 제한을 지키고 카드마다 visualization_method를 지정해줘.`,
    }),
  });
  if (!revised.response.ok) {
    throw new Error(revised.body.error || `draft revise ${revised.response.status}`);
  }
  return { status: "revised", body: revised.body };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, ...(await worker(items[index])) };
      } catch (error) {
        results[index] = { ok: false, error: error.message };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );
  return results;
}

const prepared = await runWithConcurrency(slugs, 2, async (slug) => {
  const [translation, analysis] = await Promise.all([
    ensureArtifact("translations", slug),
    ensureArtifact("analyses", slug),
  ]);
  return {
    slug,
    translation: translation.status,
    analysis: analysis.status,
    analysisBody: analysis.body,
  };
});

const readySlugs = prepared
  .filter((item) => item.ok)
  .map((item) => item.slug);
const drafted = await runWithConcurrency(readySlugs, 2, async (slug) => {
  const analysis = prepared.find((item) => item.slug === slug)?.analysisBody;
  const draft = await ensureDraft(slug, analysis);
  return {
    slug,
    draft: draft.status,
    revision: draft.body.current_revision,
    cards: draft.body.revisions?.find(
      (item) => item.revision === draft.body.current_revision,
    )?.cards?.length,
  };
});

const result = {
  base_url: baseUrl,
  requested: slugs,
  prepared: prepared.map(({ analysisBody, ...item }) => item),
  drafted,
  failed:
    prepared.filter((item) => !item.ok).length +
    drafted.filter((item) => !item.ok).length,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.failed ? 1 : 0;
