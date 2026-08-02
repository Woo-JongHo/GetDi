import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditOutput,
  publicDetail,
  redactPrivateModelPayload,
} from "./snapshot.mjs";

test("SS-08: public detail is a metadata-only allowlist", () => {
  const result = publicDetail("example", {
    source_url: "https://example.com/article",
    title: "Title",
    authors: ["Ada"],
    published_date: "2026-01-01",
    format: "article",
    summary: "Summary",
    content_html: "<p>private</p>",
    blocks: [{ block_id: "B001", html: "private" }],
    assets: [{ local_path: "/private/file" }],
  });
  assert.equal(result.source_snapshot_available, false);
  assert.equal(result.unavailable_reason, "local_only");
  assert.equal("content_html" in result, false);
  assert.equal("blocks" in result, false);
  assert.equal("assets" in result, false);
});

test("private model operations omit their input and output payload", () => {
  const result = redactPrivateModelPayload({
    operation: "article_analysis",
    input: { prompt: "full source" },
    output: { text: "full result" },
    id: "run-1",
  });
  assert.equal("input" in result, false);
  assert.equal("output" in result, false);
  assert.equal(result.input_omitted, true);
  assert.equal(result.output_omitted, true);
});

test("SS-09: output audit rejects private source payload fingerprints", async () => {
  for (const [name, payload] of [
    ["detail.json", { content_html: "<p>private</p>" }],
    ["translation.json", { content_html_ko: "<p>비공개</p>" }],
    ["revision.json", { blocks: [{ block_id: "B001", html: "private" }] }],
  ]) {
    const target = await mkdtemp(path.join(os.tmpdir(), "getdi-snapshot-"));
    await writeFile(path.join(target, name), JSON.stringify(payload));
    await assert.rejects(auditOutput(target), /공개하면 안 되는 값/);
  }
});
