import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sourceId } from "../crawler/source-snapshot.mjs";
import { createDetailsHandler } from "./details.mjs";

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; },
  };
}

async function fixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "getdi-details-"));
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const videoDetailDir = path.join(rootDir, "data/private/details/videos");
  await mkdir(detailDir, { recursive: true });
  await mkdir(videoDetailDir, { recursive: true });
  return {
    rootDir,
    detailDir,
    videoDetailDir,
    handler: createDetailsHandler({ rootDir, detailDir, videoDetailDir }),
  };
}

test("SS-06/07: details use v2 pointer when present and preserve v1 fallback", async () => {
  const context = await fixture();
  const sourceUrl = "https://www.nngroup.com/articles/example/";
  const legacy = { schema_version: 1, source_url: sourceUrl, title: "Legacy", content_html: "<p>old</p>" };
  await writeFile(path.join(context.detailDir, "example.json"), JSON.stringify(legacy));

  let response = responseRecorder();
  await context.handler(
    { method: "GET" },
    response,
    new URL("http://local/api/details/article/example"),
  );
  assert.equal(JSON.parse(response.body).schema_version, 1);

  const id = sourceId(sourceUrl);
  const revisionId = "rev_" + "a".repeat(64);
  const store = path.join(context.rootDir, "data/private/source-snapshots");
  await mkdir(path.join(store, "sources"), { recursive: true });
  await mkdir(path.join(store, "revisions"), { recursive: true });
  await writeFile(
    path.join(store, "sources", `${id}.json`),
    JSON.stringify({ source_id: id, revision_id: revisionId }),
  );
  await writeFile(
    path.join(store, "revisions", `${revisionId}.json`),
    JSON.stringify({
      schema_version: 2,
      source_id: id,
      revision_id: revisionId,
      canonical_url: sourceUrl,
      metadata: { title: "Revision", authors: [], format: "article" },
      blocks: [{ block_id: "B001", ordinal: 1, type: "paragraph", html: "<p>new</p>", asset_occurrence_ids: [] }],
      asset_occurrences: [],
    }),
  );
  response = responseRecorder();
  await context.handler(
    { method: "GET" },
    response,
    new URL("http://local/api/details/article/example"),
  );
  const payload = JSON.parse(response.body);
  assert.equal(payload.schema_version, 2);
  assert.equal(payload.revision_id, revisionId);
  assert.equal(payload.blocks[0].block_id, "B001");
});

test("SS-10: malformed and missing AssetBlob requests return JSON errors", async () => {
  const context = await fixture();
  let response = responseRecorder();
  await context.handler(
    { method: "GET" },
    response,
    new URL("http://local/api/source-assets/not-a-hash"),
  );
  assert.equal(response.statusCode, 400);

  response = responseRecorder();
  await context.handler(
    { method: "GET" },
    response,
    new URL(`http://local/api/source-assets/${"a".repeat(64)}`),
  );
  assert.equal(response.statusCode, 404);
});
