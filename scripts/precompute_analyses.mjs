import { readFile } from "node:fs/promises";

const baseUrl = (process.env.GETDI_BASE_URL || "http://localhost:5545").replace(
  /\/+$/,
  "",
);
const collectionUrl = new URL(
  "../data/processed/nngroup/ux-design-process/all-items.json",
  import.meta.url,
);
const startDate = "2025-01-01";
const endDate = "2026-12-31";

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function precompute() {
  const collection = JSON.parse(await readFile(collectionUrl, "utf8"));
  const targets = collection.items.filter(
    (item) =>
      item.format === "article" &&
      item.published_date >= startDate &&
      item.published_date <= endDate,
  );
  const result = {
    base_url: baseUrl,
    date_range: { from: startDate, to: endDate },
    target_count: targets.length,
    cached_count: 0,
    generated_count: 0,
    failed_count: 0,
    generated_cost_usd: 0,
    failures: [],
  };

  for (const [index, item] of targets.entries()) {
    const endpoint =
      `${baseUrl}/api/analyses/${encodeURIComponent(item.slug)}`;
    const progress = `[${index + 1}/${targets.length}] ${item.slug}`;

    try {
      const cached = await fetch(endpoint, { cache: "no-store" });
      if (cached.ok) {
        result.cached_count += 1;
        console.error(`${progress}: cached`);
        continue;
      }
      if (cached.status !== 404) {
        const body = await responseBody(cached);
        throw new Error(
          body?.error || `cache check failed with HTTP ${cached.status}`,
        );
      }

      console.error(`${progress}: generating`);
      const generated = await fetch(endpoint, { method: "POST" });
      const body = await responseBody(generated);
      if (!generated.ok) {
        throw new Error(
          body?.error || `generation failed with HTTP ${generated.status}`,
        );
      }

      result.generated_count += 1;
      result.generated_cost_usd += body?.usage?.total_cost_usd || 0;
      console.error(`${progress}: generated`);
    } catch (error) {
      result.failed_count += 1;
      result.failures.push({
        slug: item.slug,
        published_date: item.published_date,
        error: error.message,
      });
      console.error(`${progress}: failed: ${error.message}`);
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.failed_count) process.exitCode = 1;
}

precompute().catch((error) => {
  console.log(
    JSON.stringify(
      {
        base_url: baseUrl,
        date_range: { from: startDate, to: endDate },
        fatal_error: error.message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
