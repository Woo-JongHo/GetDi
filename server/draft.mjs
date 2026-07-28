import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readRequestJson, sendJson } from "./http.mjs";

export function createDraftHandler({
  rootDir,
  DRAFT_COPY_LIMITS,
  DRAFT_VISUALIZATION_METHODS,
  analysisBlockIds,
  ensureArticleAnalysis,
  imageSources,
  normalizeModelUsage,
  readReferenceProfile,
  runClaudeStructured,
  runCodexStructured,
}) {
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const draftDir = path.join(rootDir, "data/private/drafts");
  const htmlPromptPath = path.join(
    rootDir,
    "skills/article-refinement/references/html-card-production-prompt.md",
  );
  const generationStatePath = path.join(
    rootDir,
    "data/private/generation-state.json",
  );
  const productionPromptPath = path.join(
    rootDir,
    "skills/article-refinement/references/cardnews-production-prompt.md",
  );
  const runningDrafts = new Map();
  const runningHtmlDrafts = new Map();
  const runningHtmlCovers = new Map();

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

  function htmlVariantSchema(cardCount) {
    return {
      type: "object",
      properties: {
        visual_system: {
          type: "object",
          properties: {
            name_ko: { type: "string" },
            rationale_ko: { type: "string" },
            palette: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
            },
            diversity_notes_ko: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "name_ko",
            "rationale_ko",
            "palette",
            "diversity_notes_ko",
          ],
          additionalProperties: false,
        },
        global_css: { type: "string" },
        cards: {
          type: "array",
          minItems: cardCount,
          maxItems: cardCount,
          items: {
            type: "object",
            properties: {
              position: { type: "integer" },
              layout_name_ko: { type: "string" },
              reference_rule_ids: {
                type: "array",
                items: { type: "string" },
              },
              template_html: { type: "string" },
            },
            required: [
              "position",
              "layout_name_ko",
              "reference_rule_ids",
              "template_html",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["visual_system", "global_css", "cards"],
      additionalProperties: false,
    };
  }

  function htmlCoverSchema() {
    return {
      type: "object",
      properties: {
        visual_system: {
          type: "object",
          properties: {
            name_ko: { type: "string" },
            rationale_ko: { type: "string" },
            palette: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
            },
          },
          required: ["name_ko", "rationale_ko", "palette"],
          additionalProperties: false,
        },
        global_css: { type: "string" },
        card: {
          type: "object",
          properties: {
            layout_name_ko: { type: "string" },
            reference_rule_ids: {
              type: "array",
              items: { type: "string" },
            },
            template_html: { type: "string" },
          },
          required: [
            "layout_name_ko",
            "reference_rule_ids",
            "template_html",
          ],
          additionalProperties: false,
        },
      },
      required: ["visual_system", "global_css", "card"],
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
    if (
      draft.cards.some((card) =>
        card.design_rule_ids.some((id) => !allowedRules.has(id)),
      )
    ) {
      throw new Error("Draft가 Reference Library에 없는 규칙을 사용했습니다.");
    }
  }

  async function generateDraft(slug) {
    const source = JSON.parse(
      await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
    );
    const analysis = await ensureArticleAnalysis(slug);
    const productionPrompt = await readFile(productionPromptPath, "utf8");
    const reference = await readReferenceProfile("set-b");
    const allowedRuleIds = reference.profile.rules.map((rule) => rule.id);
    const prompt = [
      productionPrompt,
      "",
      "RUNTIME REQUIREMENTS:",
      `Return the same number of cards as GROUNDED ANALYSIS.card_plan (${analysis.card_plan?.length || "4-8"}), never more than 8.`,
      "Every card must cite source_block_ids already present in the analysis.",
      "Use source_image_src only when it appears in the analysis image recommendations; otherwise return null.",
      `Use design_rule_ids only from this Reference Library allowlist: ${allowedRuleIds.join(", ")}.`,
      "Never copy the reference account mascot, people, creator identity, or logos.",
      "Do not invent facts. Keep rights and uncertainty notes in caveats_ko.",
      "Return only the requested structured object.",
      "",
      `REFERENCE IMAGE PROFILES:\n${JSON.stringify(reference.profile)}`,
      "",
      `SOURCE TITLE:\n${source.title}`,
      "",
      `SOURCE URL:\n${source.source_url}`,
      "",
      `GROUNDED ANALYSIS:\n${JSON.stringify(analysis)}`,
    ].join("\n");
    const allowedImages = imageSources(source.content_html);
    const { output, envelope } = await runCodexStructured({
      prompt,
      schema: draftOutputSchema({
        cardCount: analysis.card_plan?.length,
        blockIds: analysisBlockIds(analysis),
        allowedImages,
        allowedRules: allowedRuleIds,
      }),
      timeoutMessage: "Draft 생성 시간이 3분을 초과했습니다.",
      runMeta: { operation: "draft_generation", slug },
    });
    validateDraftOutput(output, analysis, source, allowedRuleIds);
    const modelUsage = normalizeModelUsage(envelope);
    const now = new Date().toISOString();
    const document = {
      schema_version: 1,
      slug,
      source: analysis.source,
      status: "draft",
      created_at: now,
      updated_at: now,
      current_revision: 1,
      revisions: [
        {
          revision: 1,
          created_at: now,
          instruction: "Reference Library 기반 최초 생성",
          prompt_profile: "cardnews-production-v2",
          analysis_prompt_version: analysis.prompt_version || "legacy",
          analysis_created_at: analysis.created_at,
          reference_profile_id: reference.profile.id,
          reference_analyzed_at: reference.analyzed_at,
          ...output,
        },
      ],
      model_runs: [
        {
          purpose: "draft_generation",
          revision: 1,
          provider: envelope.provider,
          model: modelUsage.at(-1)?.model || "fable",
          usage_source: "actual",
          total_cost_usd: envelope.total_cost_usd ?? null,
          duration_ms: envelope.duration_ms ?? null,
          models: modelUsage,
        },
      ],
    };
    await mkdir(draftDir, { recursive: true });
    await writeFile(
      path.join(draftDir, `${slug}.json`),
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8",
    );
    return document;
  }

  async function reviseDraft(
    slug,
    instruction,
    expectedRevision,
    modelSelection = "sol",
  ) {
    if (!instruction?.trim()) throw new Error("수정 지시를 입력해주세요.");
    const cachePath = path.join(draftDir, `${slug}.json`);
    const document = JSON.parse(await readFile(cachePath, "utf8"));
    if (document.current_revision !== expectedRevision) {
      const error = new Error("다른 수정본이 먼저 생성됐습니다. 최신 Draft를 다시 불러오세요.");
      error.code = "REVISION_CONFLICT";
      throw error;
    }
    const source = JSON.parse(
      await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
    );
    const analysis = await ensureArticleAnalysis(slug);
    const current = document.revisions.find(
      (revision) => revision.revision === document.current_revision,
    );
    const productionPrompt = await readFile(productionPromptPath, "utf8");
    const reference = await readReferenceProfile("set-b");
    const allowedRuleIds = reference.profile.rules.map((rule) => rule.id);
    const allowedBlockIds = analysisBlockIds(analysis);
    const allowedImages = imageSources(source.content_html);
    const prompt = [
      productionPrompt,
      "",
      "Revise the existing Korean Instagram carousel draft according to the user's instruction.",
      `Return exactly ${analysis.card_plan.length} cards, matching GROUNDED ANALYSIS.card_plan.`,
      "Discard source_block_ids from the current draft when they are not in the new grounded analysis.",
      `Use source_block_ids only from this exact allowlist: ${allowedBlockIds.join(", ")}.`,
      `Use design_rule_ids only from this exact Reference Library allowlist: ${allowedRuleIds.join(", ")}.`,
      "Preserve all hard copy limits.",
      "Do not introduce facts, images, or design rules not present in the existing draft and grounded analysis.",
      "The user's instruction may describe typography, background, mood, tone, length, headline, order, or emphasis.",
      "Never copy the reference account mascot, people, creator identity, or logos.",
      "Return a complete replacement draft using the requested schema.",
      "",
      `USER INSTRUCTION:\n${instruction.trim()}`,
      "",
      `REFERENCE IMAGE PROFILES:\n${JSON.stringify(reference.profile)}`,
      "",
      `CURRENT DRAFT:\n${JSON.stringify(current)}`,
      "",
      `GROUNDED ANALYSIS:\n${JSON.stringify(analysis)}`,
    ].join("\n");
    const useFable = modelSelection === "fable";
    const { output, envelope } = useFable
      ? await runClaudeStructured({
          prompt,
          schema: draftOutputSchema({
            cardCount: analysis.card_plan.length,
            blockIds: allowedBlockIds,
            allowedImages,
            allowedRules: allowedRuleIds,
          }),
          timeoutMessage: "Fable Draft 수정 시간이 3분을 초과했습니다.",
          runMeta: {
            operation: "draft_revision",
            slug,
            requested_variant: "fable",
            base_revision: document.current_revision,
          },
        })
      : await runCodexStructured({
          prompt,
          schema: draftOutputSchema({
            cardCount: analysis.card_plan.length,
            blockIds: allowedBlockIds,
            allowedImages,
            allowedRules: allowedRuleIds,
          }),
          timeoutMessage: "Sol Draft 수정 시간이 10분을 초과했습니다.",
          runMeta: {
            operation: "draft_revision",
            slug,
            requested_variant: "sol",
            base_revision: document.current_revision,
          },
        });
    validateDraftOutput(output, analysis, source, allowedRuleIds);
    const revisionNumber = document.current_revision + 1;
    const now = new Date().toISOString();
    const modelUsage = normalizeModelUsage(envelope);
    document.current_revision = revisionNumber;
    document.updated_at = now;
    document.revisions.push({
      revision: revisionNumber,
      created_at: now,
      instruction: instruction.trim(),
      model_variant: useFable ? "fable" : "sol",
      prompt_profile: "cardnews-production-v2",
      analysis_prompt_version: analysis.prompt_version || "legacy",
      analysis_created_at: analysis.created_at,
      reference_profile_id: reference.profile.id,
      reference_analyzed_at: reference.analyzed_at,
      ...output,
    });
    document.model_runs.push({
      purpose: "draft_revision",
      revision: revisionNumber,
      provider: useFable ? "Claude Code" : envelope.provider,
      model: modelUsage.at(-1)?.model || "fable",
      usage_source: "actual",
      total_cost_usd: envelope.total_cost_usd ?? null,
      duration_ms: envelope.duration_ms ?? null,
      models: modelUsage,
    });
    await writeFile(cachePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
  }

  function validateHtmlVariant(output, sourceCards, allowedRuleIds) {
    if (
      output.cards.length !== sourceCards.length ||
      output.cards.some((card, index) => card.position !== index + 1)
    ) {
      throw new Error("HTML 결과의 카드 수와 position이 원본 카드와 다릅니다.");
    }
    const forbidden = /<(script|iframe|form|input|button)\b|javascript:|@import/i;
    if (forbidden.test(output.global_css)) {
      throw new Error("HTML 결과 CSS에 금지된 외부 실행 요소가 있습니다.");
    }
    const allowedRules = new Set(allowedRuleIds);
    output.cards.forEach((rendered, index) => {
      const sourceCard = sourceCards[index];
      if (
        forbidden.test(rendered.template_html) ||
        !rendered.template_html.includes("<article") ||
        !rendered.template_html.includes("{{HEADLINE}}") ||
        !rendered.template_html.includes("{{POSITION}}") ||
        !rendered.template_html.includes("{{COUNT}}")
      ) {
        throw new Error(`${rendered.position}번 카드 HTML 계약이 올바르지 않습니다.`);
      }
      const requiredCopy =
        sourceCard.role === "cover"
          ? ["{{EYEBROW}}"]
          : ["{{SIGNATURE}}", "{{BODY}}"];
      if (requiredCopy.some((placeholder) =>
        !rendered.template_html.includes(placeholder))) {
        throw new Error(`${rendered.position}번 카드의 카피 placeholder가 없습니다.`);
      }
      if (
        rendered.reference_rule_ids.some((id) => !allowedRules.has(id))
      ) {
        throw new Error(`${rendered.position}번 카드가 알 수 없는 레퍼런스 규칙을 사용했습니다.`);
      }
      if (
        rendered.template_html.includes("{{SOURCE_IMAGE}}") &&
        !sourceCard.source_image_src
      ) {
        throw new Error(`${rendered.position}번 카드에 허용되지 않은 이미지 placeholder가 있습니다.`);
      }
    });
  }

  async function generateHtmlRevision(slug, modelSelection = "sol") {
    const cachePath = path.join(draftDir, `${slug}.json`);
    const document = JSON.parse(await readFile(cachePath, "utf8"));
    const useFable = modelSelection === "fable";
    const sourceRun = [...document.model_runs]
      .reverse()
      .find((run) =>
        useFable
          ? run.model?.includes("fable")
          : run.model?.includes("gpt-5.6-sol"),
      );
    if (!sourceRun) {
      throw new Error(`${modelSelection} 카피 revision을 찾지 못했습니다.`);
    }
    const sourceRevision = document.revisions.find(
      (revision) => revision.revision === sourceRun.revision,
    );
    if (!sourceRevision) {
      throw new Error("HTML 생성에 사용할 카피 revision을 찾지 못했습니다.");
    }
    const reference = await readReferenceProfile("set-b");
    const allowedRuleIds = reference.profile.rules.map((rule) => rule.id);
    const htmlPrompt = await readFile(htmlPromptPath, "utf8");
    const prompt = [
      htmlPrompt,
      "",
      "RUNTIME REQUIREMENTS:",
      `Create exactly ${sourceRevision.cards.length} visually distinct cards.`,
      "Use a different composition for each visualization_method while keeping one coherent visual system.",
      "The result must feel like a professionally art-directed Korean editorial carousel, not a dashboard and not a generic CSS demo.",
      "Use detailed inline SVG scenes and diagrams tied to each card's meaning.",
      "Keep all Korean copy placeholders inside safe areas and allow the supplied copy to fit without clipping.",
      `Use reference_rule_ids only from: ${allowedRuleIds.join(", ")}.`,
      "Return only the requested JSON object.",
      "",
      `MODEL VARIANT:\n${useFable ? "Claude Fable 5" : "GPT-5.6 Sol max"}`,
      "",
      `REFERENCE IMAGE PROFILES:\n${JSON.stringify(reference.profile)}`,
      "",
      `LOCKED CARD COPY:\n${JSON.stringify(sourceRevision.cards)}`,
    ].join("\n");
    const schema = htmlVariantSchema(sourceRevision.cards.length);
    const { output, envelope } = useFable
      ? await runClaudeStructured({
          prompt,
          schema,
          timeoutMessage: "Fable HTML 생성 시간이 3분을 초과했습니다.",
          runMeta: {
            operation: "html_card_generation",
            slug,
            requested_variant: "fable",
            base_revision: sourceRevision.revision,
          },
        })
      : await runCodexStructured({
          prompt,
          schema,
          timeoutMessage: "Sol HTML 생성 시간이 10분을 초과했습니다.",
          runMeta: {
            operation: "html_card_generation",
            slug,
            requested_variant: "sol",
            base_revision: sourceRevision.revision,
          },
        });
    validateHtmlVariant(output, sourceRevision.cards, allowedRuleIds);

    const revisionNumber = document.current_revision + 1;
    const now = new Date().toISOString();
    const modelUsage = normalizeModelUsage(envelope);
    const renderedCards = sourceRevision.cards.map((card, index) => ({
      ...card,
      layout_name_ko: output.cards[index].layout_name_ko,
      render_template: output.cards[index].template_html,
      design_rule_ids: output.cards[index].reference_rule_ids,
    }));
    document.current_revision = revisionNumber;
    document.updated_at = now;
    document.revisions.push({
      revision: revisionNumber,
      created_at: now,
      instruction: "Reference Library set-b 기반 고품질 HTML/SVG 생성",
      model_variant: useFable ? "fable" : "sol",
      prompt_profile: "html-card-production-v1",
      analysis_prompt_version: sourceRevision.analysis_prompt_version,
      analysis_created_at: sourceRevision.analysis_created_at,
      reference_profile_id: reference.profile.id,
      reference_analyzed_at: reference.analyzed_at,
      render_mode: "model-html",
      render_css: output.global_css,
      visual_system: output.visual_system,
      source_copy_revision: sourceRevision.revision,
      draft_title_ko: sourceRevision.draft_title_ko,
      cards: renderedCards,
      caption_ko: sourceRevision.caption_ko,
      hashtags_ko: sourceRevision.hashtags_ko,
      caveats_ko: sourceRevision.caveats_ko,
    });
    document.model_runs.push({
      purpose: "html_card_generation",
      revision: revisionNumber,
      provider: useFable ? "Claude Code" : envelope.provider,
      model: modelUsage.at(-1)?.model || (useFable ? "claude-fable-5" : "gpt-5.6-sol"),
      usage_source: "actual",
      total_cost_usd: envelope.total_cost_usd ?? null,
      duration_ms: envelope.duration_ms ?? null,
      models: modelUsage,
    });
    await writeFile(cachePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
  }

  async function generateCoverRevision(slug, feedback = "") {
    const cachePath = path.join(draftDir, `${slug}.json`);
    const document = JSON.parse(await readFile(cachePath, "utf8"));
    const sourceRun = [...document.model_runs]
      .reverse()
      .find(
        (run) =>
          run.purpose === "draft_revision" &&
          run.model?.includes("gpt-5.6-sol"),
      );
    const sourceRevision = document.revisions.find(
      (revision) => revision.revision === sourceRun?.revision,
    );
    const sourceCard = sourceRevision?.cards.find((card) => card.position === 1);
    if (!sourceCard) throw new Error("Sol 표지 카피를 찾지 못했습니다.");

    const reference = await readReferenceProfile("set-b");
    const allowedRuleIds = reference.profile.rules.map((rule) => rule.id);
    const htmlPrompt = await readFile(htmlPromptPath, "utf8");
    const prompt = [
      htmlPrompt,
      "",
      "COVER-ONLY REVISION:",
      "Create only the first cover card as a fully art-directed 1080×1350 HTML/CSS/inline-SVG composition.",
      "Fill the complete canvas with no white strip or unstyled body area.",
      "Do not use a corporate analytics dashboard, a stack of UI cards, generic blobs, or a simple geometric demo.",
      "Create one coherent editorial illustration scene with depth, texture, layered lighting, and a clear visual metaphor for the locked copy.",
      "Keep the upper title area readable, but integrate the title with the visual scene more closely than a dashboard header.",
      `Use reference_rule_ids only from: ${allowedRuleIds.join(", ")}.`,
      "",
      `DB EVALUATION FEEDBACK:\n${feedback}`,
      "",
      `REFERENCE IMAGE PROFILES:\n${JSON.stringify(reference.profile)}`,
      "",
      `LOCKED COVER COPY:\n${JSON.stringify(sourceCard)}`,
    ].join("\n");
    const schema = htmlCoverSchema();
    const { output, envelope } = await runCodexStructured({
      prompt,
      schema,
      timeoutMessage: "Sol 표지 HTML 생성 시간이 10분을 초과했습니다.",
      runMeta: {
        operation: "cover_html_generation",
        slug,
        requested_variant: "sol",
        base_revision: sourceRevision.revision,
        evaluation_threshold: 85,
      },
    });
    validateHtmlVariant(
      {
        global_css: output.global_css,
        cards: [{ position: 1, ...output.card }],
      },
      [sourceCard],
      allowedRuleIds,
    );

    const revisionNumber = document.current_revision + 1;
    const now = new Date().toISOString();
    const modelUsage = normalizeModelUsage(envelope);
    document.current_revision = revisionNumber;
    document.updated_at = now;
    document.revisions.push({
      revision: revisionNumber,
      created_at: now,
      instruction: "DB 유사도 평가 피드백 기반 Sol 표지 재생성",
      model_variant: "sol",
      prompt_profile: "html-card-production-v1-cover-loop",
      reference_profile_id: reference.profile.id,
      reference_analyzed_at: reference.analyzed_at,
      render_mode: "model-html",
      render_css: output.global_css,
      visual_system: output.visual_system,
      source_copy_revision: sourceRevision.revision,
      display_card_count: sourceRevision.cards.length,
      evaluation_feedback: feedback,
      draft_title_ko: sourceRevision.draft_title_ko,
      cards: [
        {
          ...sourceCard,
          layout_name_ko: output.card.layout_name_ko,
          render_template: output.card.template_html,
          design_rule_ids: output.card.reference_rule_ids,
        },
      ],
      caption_ko: sourceRevision.caption_ko,
      hashtags_ko: sourceRevision.hashtags_ko,
      caveats_ko: sourceRevision.caveats_ko,
    });
    document.model_runs.push({
      purpose: "cover_html_generation",
      revision: revisionNumber,
      provider: envelope.provider,
      model: modelUsage.at(-1)?.model || "gpt-5.6-sol",
      usage_source: "actual",
      total_cost_usd: envelope.total_cost_usd ?? null,
      duration_ms: envelope.duration_ms ?? null,
      models: modelUsage,
    });
    await writeFile(cachePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
  }

  async function handleGenerationState(request, response, url) {
    if (
      url.pathname === "/api/generation-state" &&
      request.method === "GET"
    ) {
      try {
        sendJson(
          response,
          200,
          JSON.parse(await readFile(generationStatePath, "utf8")),
        );
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    return false;
  }

  async function handleDraft(request, response, url) {
    const draftMatch = url.pathname.match(
      /^\/api\/drafts\/([a-z0-9-]+)(\/revise)?$/,
    );
    if (draftMatch) {
      const slug = draftMatch[1];
      const isRevision = Boolean(draftMatch[2]);
      const cachePath = path.join(draftDir, `${slug}.json`);

      if (request.method === "GET" && !isRevision) {
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

      if (request.method === "POST" && !isRevision) {
        try {
          try {
            const cached = JSON.parse(await readFile(cachePath, "utf8"));
            sendJson(response, 200, cached);
            return true;
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          if (!runningDrafts.has(slug)) {
            runningDrafts.set(
              slug,
              generateDraft(slug).finally(() => runningDrafts.delete(slug)),
            );
          }
          sendJson(response, 200, await runningDrafts.get(slug));
        } catch (error) {
          const status = error.code === "ENOENT" ? 404 : 500;
          sendJson(response, status, { error: error.message });
        }
        return true;
      }

      if (request.method === "POST" && isRevision) {
        try {
          const body = await readRequestJson(request);
          sendJson(
            response,
            200,
            await reviseDraft(
              slug,
              body.instruction,
              body.expected_revision,
              body.model || "sol",
            ),
          );
        } catch (error) {
          sendJson(
            response,
            error.code === "REVISION_CONFLICT" ? 409 : 500,
            { error: error.message },
          );
        }
        return true;
      }

      sendJson(response, 405, { error: "Method not allowed" });
      return true;
    }

    const htmlDraftMatch = url.pathname.match(
      /^\/api\/html-drafts\/([a-z0-9-]+)$/,
    );
    if (htmlDraftMatch) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return true;
      }
      const slug = htmlDraftMatch[1];
      try {
        const body = await readRequestJson(request);
        const model = body.model === "fable" ? "fable" : "sol";
        const key = `${slug}:${model}`;
        if (!runningHtmlDrafts.has(key)) {
          runningHtmlDrafts.set(
            key,
            generateHtmlRevision(slug, model).finally(() => {
              runningHtmlDrafts.delete(key);
            }),
          );
        }
        sendJson(response, 200, await runningHtmlDrafts.get(key));
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    const htmlCoverMatch = url.pathname.match(
      /^\/api\/html-covers\/([a-z0-9-]+)$/,
    );
    if (htmlCoverMatch) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return true;
      }
      const slug = htmlCoverMatch[1];
      try {
        const body = await readRequestJson(request);
        if (!runningHtmlCovers.has(slug)) {
          runningHtmlCovers.set(
            slug,
            generateCoverRevision(slug, body.feedback || "").finally(() => {
              runningHtmlCovers.delete(slug);
            }),
          );
        }
        sendJson(response, 200, await runningHtmlCovers.get(slug));
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return true;
    }

    return false;
  }

  return { handleDraft, handleGenerationState };
}
