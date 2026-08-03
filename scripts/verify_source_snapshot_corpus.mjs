import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

import {
  sourceId,
  validateSourceRevision,
} from "../crawler/source-snapshot.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BLOCK_TAGS = new Map([
  ["h2", "heading"],
  ["h3", "heading"],
  ["h4", "heading"],
  ["h5", "heading"],
  ["p", "paragraph"],
  ["ol", "list"],
  ["ul", "list"],
  ["blockquote", "quote"],
  ["table", "table"],
  ["figure", "figure"],
  ["img", "figure"],
]);

function semanticBlocks(html) {
  const $ = cheerio.load(html || "", null, false);
  const nodes = [];
  function visit(node) {
    if (node.type !== "tag") return;
    if (BLOCK_TAGS.has(node.name)) {
      nodes.push(node);
      return;
    }
    for (const child of node.children || []) visit(child);
  }
  for (const node of $.root().contents().toArray()) visit(node);
  return nodes.map((node) => ({
    type: BLOCK_TAGS.get(node.name),
    text: $(node).text().replace(/\r\n/g, "\n"),
  }));
}

function imageUrls(html) {
  const $ = cheerio.load(html || "", null, false);
  return $("img").toArray().map((node) => $(node).attr("src"));
}

export async function verifySourceSnapshotCorpus({ projectRoot = rootDir } = {}) {
  const baseline = JSON.parse(
    await readFile(
      path.join(projectRoot, "crawler/fixtures/python-baseline-slugs.json"),
      "utf8",
    ),
  );
  const storeDir = path.join(projectRoot, "data/private/source-snapshots");
  const active = JSON.parse(
    await readFile(path.join(storeDir, "active-import.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(storeDir, "imports", `${active.manifest_hash}.json`),
      "utf8",
    ),
  );
  const manifestBySource = new Map(
    manifest.items.map((item) => [item.source_id, item]),
  );
  const failures = [];
  for (const slug of baseline.slugs) {
    const detail = JSON.parse(
      await readFile(
        path.join(projectRoot, "data/private/details/articles", `${slug}.json`),
        "utf8",
      ),
    );
    const item = manifestBySource.get(sourceId(detail.source_url));
    if (!item) {
      failures.push({ slug, check: "manifest", reason: "active item 없음" });
      continue;
    }
    const revision = JSON.parse(
      await readFile(
        path.join(storeDir, "revisions", `${item.revision_id}.json`),
        "utf8",
      ),
    );
    try {
      await validateSourceRevision(revision, { blobDir: path.join(storeDir, "blobs") });
    } catch (error) {
      failures.push({ slug, check: "revision", reason: error.message });
      continue;
    }
    if (revision.canonical_url !== detail.source_url) {
      failures.push({ slug, check: "canonical_url" });
    }
    const expectedBlocks = semanticBlocks(detail.content_html);
    const actualBlocks = revision.blocks.map((block) => ({
      type: block.type,
      text: cheerio.load(block.html, null, false).root().text().replace(/\r\n/g, "\n"),
    }));
    if (JSON.stringify(actualBlocks) !== JSON.stringify(expectedBlocks)) {
      failures.push({ slug, check: "semantic_blocks" });
    }
    const expectedImages = imageUrls(detail.content_html);
    const actualImages = revision.asset_occurrences.map((itemValue) => itemValue.source_url);
    if (JSON.stringify(actualImages) !== JSON.stringify(expectedImages)) {
      failures.push({ slug, check: "image_occurrences" });
    }
  }
  return {
    manifest_hash: active.manifest_hash,
    expected: baseline.count,
    active_items: manifest.item_count,
    verified: baseline.count - new Set(failures.map((failure) => failure.slug)).size,
    failures,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifySourceSnapshotCorpus()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.failures.length) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
