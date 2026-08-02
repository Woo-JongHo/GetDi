import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sendJson } from "./http.mjs";

export function createTranslationHandler({
  rootDir,
  imageSources,
  runCodexStructured,
}) {
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const videoDetailDir = path.join(rootDir, "data/private/details/videos");
  const translationDir = path.join(rootDir, "data/private/translations");
  const runningTranslations = new Map();

  function runArticleTranslation(source, slug = source.slug) {
    const schema = {
      type: "object",
      properties: {
        title_ko: { type: "string" },
        summary_ko: { type: "string" },
        content_html_ko: { type: "string" },
      },
      required: ["title_ko", "summary_ko", "content_html_ko"],
      additionalProperties: false,
    };

    const prompt = [
      "You are a precise English-to-Korean UX article translator.",
      "Translate the supplied title, summary, and HTML body into natural professional Korean.",
      "For content_html_ko, preserve every HTML element, its nesting, ordering, id, href, src, width, height, and all other structural attributes.",
      "Translate human-readable text, image alt text, and figcaptions only.",
      "Do not summarize, omit, add, reinterpret, or move any content.",
      "Keep URLs and proper nouns accurate. Return only the requested structured object.",
      "",
      `TITLE:\n${source.title}`,
      "",
      `SUMMARY:\n${source.summary || ""}`,
      "",
      `HTML:\n${source.content_html}`,
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
    let source;
    try {
      source = JSON.parse(
        await readFile(path.join(detailDir, `${slug}.json`), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      source = JSON.parse(
        await readFile(path.join(videoDetailDir, `${slug}.json`), "utf8"),
      );
    }
    const { translated, envelope } = await runArticleTranslation(source, slug);

    const originalImages = imageSources(source.content_html);
    const translatedImages = imageSources(translated.content_html_ko);
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
      schema_version: 1,
      slug,
      source_url: source.source_url,
      translated_at: new Date().toISOString(),
      provider: envelope.provider,
      model: modelUsage.at(-1)?.model || "fable",
      usage_source: "actual",
      title_ko: translated.title_ko,
      summary_ko: translated.summary_ko,
      content_html_ko: translated.content_html_ko,
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
        try {
          const cached = JSON.parse(await readFile(cachePath, "utf8"));
          sendJson(response, 200, cached);
          return true;
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
