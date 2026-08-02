import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sendJson } from "./http.mjs";
import { sourceId } from "../crawler/source-snapshot.mjs";

export function classifyTranslation(translation, source) {
  if (source.schema_version !== 2) {
    return translation.schema_version === 1 ? "ready" : "invalid";
  }
  if (
    translation.schema_version !== 2 ||
    translation.source_revision_id !== source.revision_id
  ) {
    return "stale";
  }
  const expected = source.blocks.map((block) => block.block_id);
  const actual = translation.blocks?.map((block) => block.block_id) || [];
  if (
    expected.length !== actual.length ||
    expected.some((blockId, index) => blockId !== actual[index]) ||
    translation.blocks.some((block) => !block.html_ko)
  ) {
    return "invalid";
  }
  return "ready";
}

export function createTranslationHandler({
  rootDir,
  imageSources,
  runCodexStructured,
}) {
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const videoDetailDir = path.join(rootDir, "data/private/details/videos");
  const translationDir = path.join(rootDir, "data/private/translations");
  const sourceStoreDir = path.join(rootDir, "data/private/source-snapshots");
  const runningTranslations = new Map();

  async function readCurrentSource(slug) {
    let detail;
    try {
      detail = JSON.parse(await readFile(path.join(detailDir, `${slug}.json`), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return JSON.parse(await readFile(path.join(videoDetailDir, `${slug}.json`), "utf8"));
    }
    if (detail.schema_version === 2) return detail;
    const id = detail.source_id || sourceId(detail.source_url);
    try {
      let revisionId;
      try {
        const active = JSON.parse(
          await readFile(path.join(sourceStoreDir, "active-import.json"), "utf8"),
        );
        const manifest = JSON.parse(
          await readFile(
            path.join(sourceStoreDir, "imports", `${active.manifest_hash}.json`),
            "utf8",
          ),
        );
        revisionId = manifest.items.find((item) => item.source_id === id)?.revision_id;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!revisionId) {
        const pointer = JSON.parse(
          await readFile(path.join(sourceStoreDir, "sources", `${id}.json`), "utf8"),
        );
        revisionId = pointer.revision_id;
      }
      return JSON.parse(
        await readFile(path.join(sourceStoreDir, "revisions", `${revisionId}.json`), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") return detail;
      throw error;
    }
  }

  function runArticleTranslation(source, slug = source.slug) {
    const revisionBound = source.schema_version === 2;
    const schema = {
      type: "object",
      properties: {
        title_ko: { type: "string" },
        summary_ko: { type: "string" },
        ...(revisionBound
          ? {
              source_revision_id: { type: "string" },
              blocks: {
                type: "array",
                minItems: source.blocks.length,
                maxItems: source.blocks.length,
                items: {
                  type: "object",
                  properties: {
                    block_id: { type: "string" },
                    html_ko: { type: "string" },
                  },
                  required: ["block_id", "html_ko"],
                  additionalProperties: false,
                },
              },
            }
          : { content_html_ko: { type: "string" } }),
      },
      required: revisionBound
        ? ["title_ko", "summary_ko", "source_revision_id", "blocks"]
        : ["title_ko", "summary_ko", "content_html_ko"],
      additionalProperties: false,
    };

    const prompt = [
      "You are a precise English-to-Korean UX article translator.",
      "Translate the supplied title, summary, and HTML body into natural professional Korean.",
      revisionBound
        ? "Return every block once, in the supplied order, with the exact block_id and translated html_ko. Set source_revision_id to the supplied revision ID."
        : "For content_html_ko, preserve every HTML element, its nesting, ordering, id, href, src, width, height, and all other structural attributes.",
      "Translate human-readable text, image alt text, and figcaptions only.",
      "Do not summarize, omit, add, reinterpret, or move any content.",
      "Keep URLs and proper nouns accurate. Return only the requested structured object.",
      "",
      `TITLE:\n${source.metadata?.title || source.title}`,
      "",
      `SUMMARY:\n${source.metadata?.summary || source.summary || ""}`,
      "",
      revisionBound
        ? `SOURCE REVISION:\n${source.revision_id}\n\nBLOCKS:\n${JSON.stringify(source.blocks)}`
        : `HTML:\n${source.content_html}`,
    ].join("\n");

    return runCodexStructured({
      prompt,
      schema,
      timeoutMessage: "번역 시간이 10분을 초과했습니다.",
      model: "gpt-5.6-terra",
      effort: "high",
      runMeta: { operation: "translation", slug },
    }).then(({ output, envelope }) => ({ translated: output, envelope }));
  }

  async function translateArticle(slug) {
    const source = await readCurrentSource(slug);
    const { translated, envelope } = await runArticleTranslation(source, slug);

    if (
      source.schema_version === 2 &&
      classifyTranslation({ ...translated, schema_version: 2 }, source) !== "ready"
    ) {
      throw new Error("번역 결과가 현재 SourceRevision의 block 계약과 일치하지 않습니다.");
    }

    const originalHtml = source.schema_version === 2
      ? source.blocks.map((block) => block.html).join("")
      : source.content_html;
    const translatedHtml = source.schema_version === 2
      ? translated.blocks.map((block) => block.html_ko).join("")
      : translated.content_html_ko;
    const originalImages = imageSources(originalHtml);
    const translatedImages = imageSources(translatedHtml);
    if (
      originalImages.length !== translatedImages.length ||
      originalImages.some((sourceUrl, index) => sourceUrl !== translatedImages[index])
    ) {
      throw new Error("번역 결과가 원문의 이미지 순서를 보존하지 못했습니다.");
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
      schema_version: source.schema_version === 2 ? 2 : 1,
      slug,
      source_url: source.canonical_url || source.source_url,
      translated_at: new Date().toISOString(),
      provider: envelope.provider,
      model: modelUsage.at(-1)?.model || "fable",
      usage_source: "actual",
      title_ko: translated.title_ko,
      summary_ko: translated.summary_ko,
      ...(source.schema_version === 2
        ? {
            source_id: source.source_id,
            source_revision_id: source.revision_id,
            blocks: translated.blocks,
          }
        : { content_html_ko: translated.content_html_ko }),
      usage: {
        total_cost_usd: envelope.total_cost_usd ?? null,
        duration_ms: envelope.duration_ms ?? null,
        models: modelUsage,
      },
    };

    await mkdir(translationDir, { recursive: true });
    await writeFile(
      path.join(translationDir, `${slug}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    return result;
  }

  return async function handleTranslation(request, response, url) {
    const match = url.pathname.match(
      /^\/api\/translations\/([a-z0-9-]+)$/,
    );
    if (!match) return false;

    const slug = match[1];
    const cachePath = path.join(translationDir, `${slug}.json`);

    if (request.method === "GET") {
      try {
        const [cached, source] = await Promise.all([
          readFile(cachePath, "utf8").then(JSON.parse),
          readCurrentSource(slug),
        ]);
        sendJson(response, 200, {
          ...cached,
          translation_status: classifyTranslation(cached, source),
          current_revision_id: source.revision_id ?? null,
        });
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
        try {
          const [cached, source] = await Promise.all([
            readFile(cachePath, "utf8").then(JSON.parse),
            readCurrentSource(slug),
          ]);
          if (classifyTranslation(cached, source) === "ready") {
            sendJson(response, 200, { ...cached, translation_status: "ready" });
            return true;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }

        if (!runningTranslations.has(slug)) {
          runningTranslations.set(
            slug,
            translateArticle(slug).finally(() => {
              runningTranslations.delete(slug);
            }),
          );
        }
        sendJson(response, 200, await runningTranslations.get(slug));
      } catch (error) {
        const status =
          error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500;
        sendJson(response, status, { error: error.message });
      }
      return true;
    }

    sendJson(response, 405, { error: "허용되지 않은 요청 방식입니다." });
    return true;
  };
}
