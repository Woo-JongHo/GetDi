import { createServer } from "vite";

const shouldTranslate = process.argv.includes("--translate");
const shouldAnalyze = process.argv.includes("--analyze");
const shouldGenerate = process.argv.includes("--generate");
const shouldRevise = process.argv.includes("--revise");
const smokePort = Number(process.env.GETDI_SMOKE_PORT || 5546);
const baseUrl = `http://localhost:${smokePort}`;
const slugArgument = process.argv.find((argument) =>
  argument.startsWith("--slug="),
);
const translationSlug =
  slugArgument?.slice("--slug=".length) || "product-sense-definition";
// 어느 단계에서 죽든 실패로 남기고, 끝까지 간 경우에만 0으로 바꾼다.
let exitCode = 1;
const server = await createServer({
  server: {
    host: "localhost",
    port: smokePort,
    strictPort: true,
  },
});

try {
  await server.listen();
  const home = await fetch(`${baseUrl}/`);
  const homeBody = await home.text();
  console.log(
    JSON.stringify({
      check: "home",
      status: home.status,
      bytes: Buffer.byteLength(homeBody),
      hasRoot: homeBody.includes('id="root"'),
    }),
  );

  const sessionUsage = await fetch(
    `${baseUrl}/api/session-usage`,
  );
  const sessionPayload = await sessionUsage.json();
  console.log(
    JSON.stringify({
      check: "session-usage",
      status: sessionUsage.status,
      input: sessionPayload.usage?.input_tokens,
      output: sessionPayload.usage?.output_tokens,
      contextPercent: sessionPayload.context_percent,
      messages: sessionPayload.messages?.length,
      error: sessionPayload.error,
    }),
  );

  const translationUrl =
    `${baseUrl}/api/translations/${translationSlug}`;
  const cached = await fetch(translationUrl);
  console.log(
    JSON.stringify({
      check: "translation-cache",
      status: cached.status,
    }),
  );

  if (shouldTranslate) {
    const translated = await fetch(translationUrl, { method: "POST" });
    const payload = await translated.json();
    console.log(
      JSON.stringify({
        check: "translation",
        status: translated.status,
        model: payload.model,
        title: payload.title_ko,
        htmlBytes: Buffer.byteLength(payload.content_html_ko || ""),
        imageCount: [
          ...(payload.content_html_ko || "").matchAll(/<img\b/gi),
        ].length,
        usageSource: payload.usage_source,
        error: payload.error,
      }),
    );
  }

  const reference = await fetch(
    `${baseUrl}/api/instagram/reference/1`,
  );
  const referenceBytes = await reference.arrayBuffer();
  console.log(
    JSON.stringify({
      check: "instagram-reference",
      status: reference.status,
      contentType: reference.headers.get("content-type"),
      bytes: referenceBytes.byteLength,
    }),
  );

  const analysisUrl =
    `${baseUrl}/api/analyses/product-sense-definition`;
  const analysisCache = await fetch(analysisUrl);
  console.log(
    JSON.stringify({
      check: "analysis-cache",
      status: analysisCache.status,
    }),
  );

  if (shouldAnalyze) {
    const analyzed = await fetch(analysisUrl, { method: "POST" });
    const payload = await analyzed.json();
    console.log(
      JSON.stringify({
        check: "article-analysis",
        status: analyzed.status,
        model: payload.model,
        insights: payload.key_insights?.length,
        cards: payload.card_plan?.length,
        images: payload.image_recommendations?.length,
        usageSource: payload.usage_source,
        error: payload.error,
      }),
    );
  }

  const draftUrl =
    `${baseUrl}/api/drafts/product-sense-definition`;
  const draftCache = await fetch(draftUrl);
  const cachedDraft =
    draftCache.ok ? await draftCache.json() : null;
  console.log(
    JSON.stringify({
      check: "draft-cache",
      status: draftCache.status,
      revision: cachedDraft?.current_revision,
    }),
  );

  let generatedDraft = cachedDraft;
  if (shouldGenerate) {
    const generated = await fetch(draftUrl, { method: "POST" });
    generatedDraft = await generated.json();
    console.log(
      JSON.stringify({
        check: "draft-generation",
        status: generated.status,
        revision: generatedDraft.current_revision,
        cards: generatedDraft.revisions?.at(-1)?.cards?.length,
        error: generatedDraft.error,
      }),
    );
  }

  if (shouldRevise) {
    if (!generatedDraft) {
      generatedDraft = await (await fetch(draftUrl, { method: "POST" })).json();
    }
    const revised = await fetch(`${draftUrl}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: "표지 제목을 더 짧고 직접적으로 다듬어줘.",
        expected_revision: generatedDraft.current_revision,
      }),
    });
    const revisedDraft = await revised.json();
    console.log(
      JSON.stringify({
        check: "draft-revision",
        status: revised.status,
        revision: revisedDraft.current_revision,
        revisions: revisedDraft.revisions?.length,
        error: revisedDraft.error,
      }),
    );
  }
  exitCode = 0;
} catch (error) {
  console.error(error);
}

// Vite dev 서버의 close()는 남아 있는 의존성 스캔 작업 때문에 돌아오지 않을
// 수 있다. 기다리면 검사가 다 끝난 뒤에도 프로세스가 매달린다. 검사 결과는
// 이미 나왔으므로 종료를 요청만 하고 결과 코드를 들고 나간다.
server.close();
process.exit(exitCode);
