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

async function regenerate(slug) {
  process.stderr.write(`[regenerate] analysis ${slug}\n`);
  const response = await fetch(
    `${baseUrl}/api/analyses/${encodeURIComponent(slug)}?regenerate=1`,
    { method: "POST" },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `analysis POST ${response.status}`);
  }
  return {
    slug,
    prompt_version: body.prompt_version,
    model: body.model,
    core_message: body.core_message?.statement_ko,
    cards: body.card_plan?.length,
  };
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < slugs.length) {
    const index = cursor;
    cursor += 1;
    try {
      results[index] = { ok: true, ...(await regenerate(slugs[index])) };
    } catch (error) {
      results[index] = { ok: false, slug: slugs[index], error: error.message };
    }
  }
}

await Promise.all([worker(), worker()]);
const failed = results.filter((item) => !item.ok).length;
process.stdout.write(`${JSON.stringify({ results, failed }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
