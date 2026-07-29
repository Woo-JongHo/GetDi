import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sendJson } from "./http.mjs";

export const DRAFT_VISUALIZATION_METHODS = [
  "statement",
  "comparison",
  "steps",
  "cycle",
  "checklist",
  "warning",
  "example",
  "quote",
  "number",
];

export const DRAFT_COPY_LIMITS = {
  eyebrow: 24,
  headline: 22,
  body: 55,
};

export function createAnalysisHandler({
  rootDir,
  annotateSourceBlocks,
  imageSources,
  runCodexStructured,
}) {
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const analysisDir = path.join(rootDir, "data/private/analyses");
  const planningPromptPath = path.join(
    rootDir,
    "skills/article-refinement/references/cardnews-generation-prompt.md",
  );
  const runningAnalyses = new Map();

  async function runArticleAnalysis(source, slug = source.slug) {
    const planningPrompt = await readFile(planningPromptPath, "utf8");
    const schema = {
      type: "object",
      properties: {
        analysis_summary_ko: { type: "string" },
        target_reader_ko: { type: "string" },
        core_message: {
          type: "object",
          properties: {
            statement_ko: { type: "string" },
            reasoning_ko: { type: "string" },
            why_it_matters_ko: { type: "string" },
            evidence_excerpt: { type: "string" },
            source_block_ids: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "statement_ko",
            "reasoning_ko",
            "why_it_matters_ko",
            "evidence_excerpt",
            "source_block_ids",
          ],
          additionalProperties: false,
        },
        key_insights: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              title_ko: { type: "string" },
              claim_ko: { type: "string" },
              // 인용이 왜 그 주장이 되는지의 연결 논리(CER의 Reasoning).
              // 이 칸을 쓰다 보면 주장이 원문보다 센 경우가 드러난다.
              // 계약: skills/article-refinement/references/summary-method.md
              reasoning_ko: { type: "string" },
              why_it_matters_ko: { type: "string" },
              evidence_excerpt: { type: "string" },
              source_block_ids: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "title_ko",
              "claim_ko",
              "reasoning_ko",
              "why_it_matters_ko",
              "evidence_excerpt",
              "source_block_ids",
            ],
            additionalProperties: false,
          },
        },
        card_plan: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              position: { type: "integer" },
              role: {
                type: "string",
                enum: ["cover", "context", "insight", "close"],
              },
              headline_ko: {
                type: "string",
                maxLength: DRAFT_COPY_LIMITS.headline,
              },
              purpose_ko: { type: "string" },
              visualization_method: {
                type: "string",
                enum: DRAFT_VISUALIZATION_METHODS,
              },
              source_block_ids: {
                type: "array",
                items: { type: "string" },
              },
              source_image_src: { type: ["string", "null"] },
            },
            required: [
              "position",
              "role",
              "headline_ko",
              "purpose_ko",
              "visualization_method",
              "source_block_ids",
              "source_image_src",
            ],
            additionalProperties: false,
          },
        },
        image_recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              src: { type: "string" },
              usage_ko: { type: "string" },
              reason_ko: { type: "string" },
            },
            required: ["src", "usage_ko", "reason_ko"],
            additionalProperties: false,
          },
        },
        caveats_ko: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "analysis_summary_ko",
        "target_reader_ko",
        "core_message",
        "key_insights",
        "card_plan",
        "image_recommendations",
        "caveats_ko",
      ],
      additionalProperties: false,
    };

    const prompt = [
      planningPrompt,
      "",
      "RUNTIME REQUIREMENTS:",
      "Apply the complete supplied Korean prompt above as the editorial instruction.",
      "You analyze a UX article for a Korean Instagram educational carousel.",
      "This is analysis and planning only, not final publishable copy.",
      "Write all human-readable output in concise natural Korean.",
      "core_message.statement_ko must faithfully compress the whole article into one natural Korean sentence.",
      "Every core message, insight, and card claim must cite only existing data-source-block IDs.",
      "Use direct English evidence excerpts from the source without inventing quotes.",
      "Recommend only images whose exact src appears in the supplied HTML.",
      "Create only as many cards as the article supports, between four and eight.",
      "Use one primary claim per card and keep each headline within 22 Korean characters excluding whitespace.",
      "Choose exactly one allowed visualization_method for every card.",
      "Begin with cover and end with a concrete action or implication.",
      "Do not imitate account-specific mascots, creator identity, logos, or copyrighted brand assets.",
      "Call out uncertainty or rights concerns in caveats_ko.",
      "Return only the requested structured object.",
      "",
      `TITLE:\n${source.title}`,
      "",
      `SUMMARY:\n${source.summary || ""}`,
      "",
      `SOURCE URL:\n${source.source_url}`,
      "",
      `ANNOTATED HTML:\n${annotateSourceBlocks(source.content_html)}`,
    ].join("\n");

    const { output, envelope } = await runCodexStructured({
      prompt,
      schema,
      timeoutMessage: "아티클 분석 시간이 10분을 초과했습니다.",
      model: "gpt-5.6-terra",
      effort: "high",
      runMeta: { operation: "article_analysis", slug },
    });
    return {
      analyzed: output,
      envelope,
      promptHash: createHash("sha256").update(planningPrompt).digest("hex"),
    };
  }

  function analysisBlockIds(analysis) {
    return [
      ...new Set([
        ...(analysis.core_message?.source_block_ids || []),
        ...(analysis.key_insights || []).flatMap(
          (insight) => insight.source_block_ids || [],
        ),
        ...(analysis.card_plan || []).flatMap(
          (card) => card.source_block_ids || [],
        ),
      ]),
    ];
  }

  async function ensureArticleAnalysis(slug) {
    const cachePath = path.join(analysisDir, `${slug}.json`);
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!runningAnalyses.has(slug)) {
      runningAnalyses.set(
        slug,
        analyzeArticle(slug).finally(() => runningAnalyses.delete(slug)),
      );
    }
    return runningAnalyses.get(slug);
  }

  async function analyzeArticle(slug, { archiveExisting = false } = {}) {
    const source = JSON.parse(
      await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
    );
    const { analyzed, envelope, promptHash } = await runArticleAnalysis(
      source,
      slug,
    );
    const validBlockIds = new Set(
      [...annotateSourceBlocks(source.content_html).matchAll(
        /data-source-block="(B\d{3})"/g,
      )].map((match) => match[1]),
    );
    const citedIds = [
      ...(analyzed.core_message?.source_block_ids || []),
      ...(analyzed.key_insights || []).flatMap(
        (insight) => insight.source_block_ids || [],
      ),
      ...(analyzed.card_plan || []).flatMap(
        (card) => card.source_block_ids || [],
      ),
    ];
    if (citedIds.some((id) => !validBlockIds.has(id))) {
      throw new Error("분석 결과가 존재하지 않는 원문 블록을 인용했습니다.");
    }
    if (
      analyzed.card_plan?.length < 4 ||
      analyzed.card_plan?.length > 8 ||
      analyzed.card_plan?.some(
        (card, index) =>
          card.position !== index + 1 ||
          !DRAFT_VISUALIZATION_METHODS.includes(card.visualization_method),
      )
    ) {
      throw new Error("분석 카드 계획은 시각화 방식이 지정된 4~8장이어야 합니다.");
    }
    if (
      !analyzed.core_message?.statement_ko?.trim()
    ) {
      throw new Error("핵심 메시지는 원문 전체를 압축한 한 문장이어야 합니다.");
    }

    const allowedImages = new Set(imageSources(source.content_html));
    if (
      (analyzed.image_recommendations || []).some(
        (image) => !allowedImages.has(image.src),
      ) ||
      (analyzed.card_plan || []).some(
        (card) =>
          card.source_image_src && !allowedImages.has(card.source_image_src),
      )
    ) {
      throw new Error("분석 결과가 원문에 없는 이미지를 추천했습니다.");
    }

    const modelUsage = Object.entries(envelope.modelUsage || {}).map(
      ([model, usage]) => ({
        model,
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        cached_input_tokens: usage.cacheReadInputTokens ?? null,
        cache_creation_input_tokens: usage.cacheCreationInputTokens ?? null,
        cost_usd: usage.costUSD ?? null,
      }),
    );
    const result = {
      schema_version: 1,
      prompt_version: "cardnews-generation-user-v1",
      prompt_source:
        "skills/article-refinement/references/cardnews-generation-prompt.md",
      prompt_sha256: promptHash,
      slug,
      source: {
        title: source.title,
        url: source.source_url,
        retrieved_at: source.retrieved_at,
      },
      created_at: new Date().toISOString(),
      status: "candidate",
      provider: envelope.provider,
      model: modelUsage.at(-1)?.model || envelope.model,
      usage_source: "actual",
      ...analyzed,
      usage: {
        total_cost_usd: envelope.total_cost_usd ?? null,
        duration_ms: envelope.duration_ms ?? null,
        models: modelUsage,
      },
    };

    await mkdir(analysisDir, { recursive: true });
    const analysisPath = path.join(analysisDir, `${slug}.json`);
    if (archiveExisting) {
      try {
        const previous = await readFile(analysisPath, "utf8");
        const historyDir = path.join(analysisDir, "history");
        await mkdir(historyDir, { recursive: true });
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-");
        await writeFile(
          path.join(historyDir, `${slug}-${timestamp}.json`),
          previous,
          "utf8",
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await writeFile(
      analysisPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    return result;
  }

  async function handleAnalysis(request, response, url) {
    const analysisMatch = url.pathname.match(
      /^\/api\/analyses\/([a-z0-9-]+)$/,
    );
    if (!analysisMatch) return false;

    const slug = analysisMatch[1];
    const cachePath = path.join(analysisDir, `${slug}.json`);

    if (request.method === "GET") {
      try {
        sendJson(response, 200, JSON.parse(await readFile(cachePath, "utf8")));
      } catch (error) {
        if (error.code === "ENOENT") {
          sendJson(response, 404, { status: "not_generated" });
          return true;
        }
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    if (request.method === "POST") {
      try {
        const regenerate = url.searchParams.get("regenerate") === "1";
        if (!regenerate) {
          try {
            const cached = JSON.parse(await readFile(cachePath, "utf8"));
            sendJson(response, 200, cached);
            return true;
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }

        if (!runningAnalyses.has(slug)) {
          runningAnalyses.set(
            slug,
            analyzeArticle(slug, {
              archiveExisting: regenerate,
            }).finally(() => {
              runningAnalyses.delete(slug);
            }),
          );
        }
        sendJson(response, 200, await runningAnalyses.get(slug));
      } catch (error) {
        const status = error.code === "ENOENT" ? 404 : 500;
        sendJson(response, status, { error: error.message });
      }
      return true;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }

  return {
    analysisBlockIds,
    ensureArticleAnalysis,
    handleAnalysis,
  };
}
