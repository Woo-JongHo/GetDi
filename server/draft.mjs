import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readRequestJson, sendJson } from "./http.mjs";
import { CHARACTER_POSE_IDS, createDraftContract } from "./draft-contract.mjs";


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
  const productionPromptPath = path.join(
    rootDir,
    "skills/article-refinement/references/cardnews-production-prompt.md",
  );
  const runningDrafts = new Map();
  const { draftOutputSchema, validateDraftOutput } = createDraftContract({
    DRAFT_COPY_LIMITS,
    DRAFT_VISUALIZATION_METHODS,
    analysisBlockIds,
    imageSources,
  });


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
      "This is an editing blueprint, not finished artwork. Do not design or describe a background, gradient, decorative SVG, texture, or generated illustration.",
      "Assign typography_assignment on every card. Keep title and body in separate readable zones.",
      `Assign character_assignment to at most 3 cards, using poses only from: ${CHARACTER_POSE_IDS.join(", ")}. Return null when a mascot adds no meaning.`,
      "Prefer a real source_image_src when it explains the card; the mascot must not replace or cover it.",
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

    return false;
  }

  return { handleDraft };
}
