import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { classifyTranslation, createTranslationHandler } from "./translation.mjs";

const source = {
  schema_version: 2,
  revision_id: "rev_current",
  blocks: [
    { block_id: "B001", html: "<h2>Title</h2>" },
    { block_id: "B002", html: "<p>Body</p>" },
  ],
};

function translation(overrides = {}) {
  return {
    schema_version: 2,
    source_revision_id: "rev_current",
    blocks: [
      { block_id: "B001", html_ko: "<h2>제목</h2>" },
      { block_id: "B002", html_ko: "<p>본문</p>" },
    ],
    ...overrides,
  };
}

test("revision-bound translation is ready only for the exact block sequence", () => {
  assert.equal(classifyTranslation(translation(), source), "ready");
  assert.equal(
    classifyTranslation(translation({ source_revision_id: "rev_old" }), source),
    "stale",
  );
  assert.equal(classifyTranslation({ schema_version: 1 }, source), "stale");
  assert.equal(
    classifyTranslation(
      translation({ blocks: [{ block_id: "B001", html_ko: "<h2>제목</h2>" }] }),
      source,
    ),
    "invalid",
  );
  assert.equal(
    classifyTranslation(
      translation({
        blocks: [
          { block_id: "B002", html_ko: "<p>본문</p>" },
          { block_id: "B001", html_ko: "<h2>제목</h2>" },
        ],
      }),
      source,
    ),
    "invalid",
  );
});

test("legacy source accepts only the legacy translation contract", () => {
  assert.equal(
    classifyTranslation({ schema_version: 1 }, { schema_version: 1 }),
    "ready",
  );
  assert.equal(
    classifyTranslation({ schema_version: 2 }, { schema_version: 1 }),
    "invalid",
  );
});

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; },
  };
}

test("translation API marks old cache stale and regenerates against current revision", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "getdi-translation-"));
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const storeDir = path.join(rootDir, "data/private/source-snapshots");
  const translationDir = path.join(rootDir, "data/private/translations");
  await mkdir(detailDir, { recursive: true });
  await mkdir(path.join(storeDir, "sources"), { recursive: true });
  await mkdir(path.join(storeDir, "revisions"), { recursive: true });
  await mkdir(translationDir, { recursive: true });
  await writeFile(
    path.join(detailDir, "example.json"),
    JSON.stringify({
      source_url: "https://www.nngroup.com/articles/example/",
      source_id: "src_example",
      title: "Legacy",
      content_html: "<p>Legacy</p>",
    }),
  );
  await writeFile(
    path.join(storeDir, "sources", "src_example.json"),
    JSON.stringify({ source_id: "src_example", revision_id: "rev_current" }),
  );
  await writeFile(
    path.join(storeDir, "revisions", "rev_current.json"),
    JSON.stringify({
      schema_version: 2,
      source_id: "src_example",
      revision_id: "rev_current",
      canonical_url: "https://www.nngroup.com/articles/example/",
      metadata: { title: "Current", summary: "Summary" },
      blocks: source.blocks,
      asset_occurrences: [],
    }),
  );
  await writeFile(
    path.join(translationDir, "example.json"),
    JSON.stringify({ schema_version: 1, content_html_ko: "<p>과거</p>" }),
  );

  const handler = createTranslationHandler({
    rootDir,
    imageSources: () => [],
    runCodexStructured: async () => ({
      output: {
        title_ko: "현재",
        summary_ko: "요약",
        source_revision_id: "rev_current",
        blocks: translation().blocks,
      },
      envelope: { provider: "test", modelUsage: {} },
    }),
  });
  let response = responseRecorder();
  await handler(
    { method: "GET" },
    response,
    new URL("http://local/api/translations/example"),
  );
  assert.equal(JSON.parse(response.body).translation_status, "stale");

  response = responseRecorder();
  await handler(
    { method: "POST" },
    response,
    new URL("http://local/api/translations/example"),
  );
  const regenerated = JSON.parse(response.body);
  assert.equal(regenerated.schema_version, 2);
  assert.equal(regenerated.source_revision_id, "rev_current");
  assert.equal(regenerated.blocks[1].block_id, "B002");
  assert.equal(
    JSON.parse(await readFile(path.join(translationDir, "example.json"), "utf8"))
      .source_revision_id,
    "rev_current",
  );
});
