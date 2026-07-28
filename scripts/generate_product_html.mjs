const baseUrl = (process.env.GETDI_BASE_URL || "http://localhost:5545").replace(
  /\/$/,
  "",
);
const slug = "product-sense-definition";
const results = [];

for (const model of ["sol", "fable"]) {
  process.stderr.write(`[generate] ${model} HTML ${slug}\n`);
  const response = await fetch(
    `${baseUrl}/api/html-drafts/${encodeURIComponent(slug)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    results.push({ ok: false, model, error: body.error || response.status });
    break;
  }
  const revision = body.revisions.find(
    (item) => item.revision === body.current_revision,
  );
  results.push({
    ok: true,
    model,
    revision: body.current_revision,
    cards: revision.cards.length,
    visual_system: revision.visual_system?.name_ko,
  });
}

const failed = results.filter((item) => !item.ok).length;
process.stdout.write(`${JSON.stringify({ slug, results, failed }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
