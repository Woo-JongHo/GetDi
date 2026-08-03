function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function normalizeModelRun(run) {
  if (run.schema_version === 1 && run.tokens && run.cost && run.stage) {
    return {
      ...run,
      source_block_ids: Array.isArray(run.source_block_ids) ? run.source_block_ids : [],
    };
  }
  const models = run.usage?.models || {};
  const modelRows = Object.values(models);
  const sumNullable = (keys) => {
    const values = modelRows.map((row) => keys.map((key) => row?.[key]).find(Number.isFinite)).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const flatUsage = run.usage || {};
  const input = nullableNumber(flatUsage.input_tokens) ?? sumNullable(["inputTokens", "input_tokens"]);
  const output = nullableNumber(flatUsage.output_tokens) ?? sumNullable(["outputTokens", "output_tokens"]);
  const cached = nullableNumber(flatUsage.cached_input_tokens) ?? sumNullable(["cacheReadInputTokens", "cached_input_tokens"]);
  const cost = nullableNumber(flatUsage.total_cost_usd) ?? nullableNumber(run.total_cost_usd);
  const reported = [input, output, cached].some((value) => value !== null);
  return {
    schema_version: 1,
    id: run.id,
    stage: run.stage || run.operation || "unknown",
    provider: run.provider || "unknown",
    model: run.model || "unknown",
    prompt_version: run.prompt_version || null,
    source_block_ids: Array.isArray(run.source_block_ids) ? run.source_block_ids : [],
    status: run.status || "unknown",
    error_code: run.error_code || (run.status === "failed" ? "MODEL_RUN_FAILED" : null),
    error: run.error || null,
    started_at: run.started_at || null,
    completed_at: run.completed_at || null,
    latency_ms: nullableNumber(run.latency_ms) ?? nullableNumber(run.duration_ms),
    tokens: {
      input,
      output,
      cached_input: cached,
      reasoning_output: nullableNumber(flatUsage.reasoning_output_tokens),
      source: reported ? "actual" : "unavailable",
    },
    cost: { usd: cost, source: cost === null ? "unavailable" : "actual" },
    context: { slug: run.slug || null, requested_variant: run.requested_variant || null, base_revision: run.base_revision ?? null },
  };
}
