import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSourceRevision,
  promoteSourceRevision,
  sourceId,
  validateSourceRevision,
} from "./source-snapshot.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const blobSha256 = "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460";

function detail(overrides = {}) {
  return {
    source_url: "https://www.nngroup.com/articles/example/",
    title: "Example",
    summary: "Summary",
    published_date: "2026-01-02",
    authors: ["Ada"],
    topics: ["UX"],
    format: "article",
    content_html:
      '<div><h2>Heading</h2><p>Paragraph</p><ul><li>One</li><li>Two</li></ul>' +
      '<blockquote>Quote</blockquote><table><tbody><tr><td>Cell</td></tr></tbody></table>' +
      '<figure><img src="https://cdn.example/a.png" alt="A"><figcaption>Caption</figcaption></figure></div>',
    ...overrides,
  };
}

function asset(overrides = {}) {
  return {
    source_url: "https://cdn.example/a.png",
    blob_sha256: blobSha256,
    bytes: PNG.length,
    mime: "image/png",
    width: 1,
    height: 1,
    alt: "A",
    caption: "Caption",
    credit: null,
    rights_status: "unknown",
    ...overrides,
  };
}

test("SS-01/02: IDs are stable and content changes create a new revision", () => {
  const first = buildSourceRevision(detail(), [asset()]);
  const second = buildSourceRevision(detail(), [asset()]);
  const changed = buildSourceRevision(detail({ title: "Changed" }), [asset()]);
  assert.equal(first.source_id, sourceId(detail().source_url));
  assert.equal(first.revision_id, second.revision_id);
  assert.equal(first.source_id, changed.source_id);
  assert.notEqual(first.revision_id, changed.revision_id);
});

test("SS-03: semantic blocks keep source order without nested duplicates", () => {
  const revision = buildSourceRevision(detail(), [asset()]);
  assert.deepEqual(
    revision.blocks.map(({ block_id, ordinal, type }) => ({ block_id, ordinal, type })),
    [
      { block_id: "B001", ordinal: 1, type: "heading" },
      { block_id: "B002", ordinal: 2, type: "paragraph" },
      { block_id: "B003", ordinal: 3, type: "list" },
      { block_id: "B004", ordinal: 4, type: "quote" },
      { block_id: "B005", ordinal: 5, type: "table" },
      { block_id: "B006", ordinal: 6, type: "figure" },
    ],
  );
  assert.equal(revision.asset_occurrences[0].block_id, "B006");
  assert.match(revision.blocks[5].html, /\/api\/source-assets\//);
});

test("missing image binary and empty body are rejected", () => {
  assert.throws(() => buildSourceRevision(detail(), []), /binary/);
  assert.throws(
    () => buildSourceRevision(detail({ content_html: "<div></div>" }), []),
    /semantic block/,
  );
});

test("SS-05: validation rejects missing, damaged, or dimensionless blobs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "getdi-source-"));
  const blobDir = path.join(root, "blobs");
  await mkdir(blobDir, { recursive: true });
  const revision = buildSourceRevision(detail(), [asset()]);
  await assert.rejects(validateSourceRevision(revision, { blobDir }), /ENOENT/);

  await writeFile(path.join(blobDir, blobSha256), PNG);
  await validateSourceRevision(revision, { blobDir });

  const wrongMime = structuredClone(revision);
  wrongMime.asset_occurrences[0].mime = "image/jpeg";
  await assert.rejects(validateSourceRevision(wrongMime, { blobDir }), /MIME/);

  const dangling = structuredClone(revision);
  dangling.blocks[5].asset_occurrence_ids = ["A999"];
  await assert.rejects(validateSourceRevision(dangling, { blobDir }), /참조/);

  await writeFile(path.join(blobDir, blobSha256), Buffer.from("damaged"));
  await assert.rejects(validateSourceRevision(revision, { blobDir }), /hash/);

  const dimensionless = structuredClone(revision);
  dimensionless.asset_occurrences[0].width = null;
  await assert.rejects(validateSourceRevision(dimensionless, { blobDir }), /dimensions/);
});

test("promotion writes immutable revision and changes the source pointer last", async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), "getdi-store-"));
  await mkdir(path.join(storeDir, "blobs"), { recursive: true });
  await writeFile(path.join(storeDir, "blobs", blobSha256), PNG);
  const revision = buildSourceRevision(detail(), [asset()]);
  const result = await promoteSourceRevision(revision, { storeDir });
  assert.equal(result.revision_id, revision.revision_id);
  const pointer = JSON.parse(
    await readFile(path.join(storeDir, "sources", `${revision.source_id}.json`), "utf8"),
  );
  assert.equal(pointer.revision_id, revision.revision_id);
  const stored = JSON.parse(
    await readFile(path.join(storeDir, "revisions", `${revision.revision_id}.json`), "utf8"),
  );
  assert.equal(stored.revision_id, revision.revision_id);
});
