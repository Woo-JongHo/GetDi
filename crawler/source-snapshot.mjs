import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import * as cheerio from "cheerio";
import { imageSize } from "image-size";

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

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sourceId(canonicalUrl) {
  return `src_${digest(canonicalUrl).slice(0, 16)}`;
}

function semanticNodes(contentHtml) {
  const $ = cheerio.load(contentHtml || "", null, false);
  const selected = [];

  function visit(node) {
    if (node.type !== "tag") return;
    if (BLOCK_TAGS.has(node.name)) {
      selected.push(node);
      return;
    }
    for (const child of node.children || []) visit(child);
  }

  for (const node of $.root().contents().toArray()) visit(node);
  return { $, selected };
}

function replaceImagesWithLocalUrls($, node, assetByUrl) {
  const images = node.name === "img" ? [node] : $(node).find("img").toArray();
  images.forEach((image) => {
      const sourceUrl = $(image).attr("src");
      const asset = assetByUrl.get(sourceUrl);
      if (!asset) return;
      $(image).attr("src", `/api/source-assets/${asset.blob_sha256}`);
      $(image).removeAttr("srcset");
    });
}

export function buildSourceRevision(detail, assets = []) {
  if (!detail?.source_url) throw new Error("canonical source URL이 없습니다.");
  const { $, selected } = semanticNodes(detail.content_html);
  if (!selected.length) throw new Error("본문 semantic block이 없습니다.");

  const assetByUrl = new Map(assets.map((asset) => [asset.source_url, asset]));
  const occurrences = [];
  const blocks = selected.map((node, index) => {
    const blockId = `B${String(index + 1).padStart(3, "0")}`;
    const occurrenceIds = [];

    const images = node.name === "img" ? [node] : $(node).find("img").toArray();
    images.forEach((image) => {
        const sourceUrl = $(image).attr("src");
        const asset = assetByUrl.get(sourceUrl);
        if (!asset) {
          throw new Error(`본문 이미지 binary가 없습니다: ${sourceUrl || "src 없음"}`);
        }
        const occurrenceId = `A${String(occurrences.length + 1).padStart(3, "0")}`;
        occurrenceIds.push(occurrenceId);
        occurrences.push({
          occurrence_id: occurrenceId,
          block_id: blockId,
          ordinal: occurrences.length + 1,
          source_url: sourceUrl,
          mime: asset.mime,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
          alt: $(image).attr("alt") ?? asset.alt ?? null,
          caption: asset.caption ?? null,
          credit: asset.credit ?? null,
          rights_status: asset.rights_status ?? "unknown",
          blob_sha256: asset.blob_sha256,
        });
      });

    replaceImagesWithLocalUrls($, node, assetByUrl);
    return {
      block_id: blockId,
      ordinal: index + 1,
      type: BLOCK_TAGS.get(node.name),
      html: $.html(node),
      asset_occurrence_ids: occurrenceIds,
    };
  });

  const source = sourceId(detail.source_url);
  const payload = {
    schema_version: 2,
    source_id: source,
    canonical_url: detail.source_url,
    metadata: {
      title: detail.title,
      summary: detail.summary ?? "",
      published_date: detail.published_date ?? null,
      authors: detail.authors ?? [],
      topics: detail.topics ?? [],
      format: detail.format ?? "article",
      duration_minutes: detail.duration_minutes ?? null,
    },
    blocks,
    asset_occurrences: occurrences,
  };
  return {
    ...payload,
    revision_id: `rev_${digest(canonicalJson(payload))}`,
  };
}

export async function validateSourceRevision(revision, { blobDir }) {
  if (revision.schema_version !== 2) throw new Error("지원하지 않는 SourceRevision schema입니다.");
  const blockIds = new Set();
  const referencedOccurrences = new Set();
  for (const [index, block] of revision.blocks.entries()) {
    if (block.ordinal !== index + 1) throw new Error("block ordinal 순서가 올바르지 않습니다.");
    if (blockIds.has(block.block_id)) throw new Error("block ID가 중복됩니다.");
    blockIds.add(block.block_id);
    for (const occurrenceId of block.asset_occurrence_ids || []) {
      if (referencedOccurrences.has(occurrenceId)) throw new Error("asset occurrence 참조가 중복됩니다.");
      referencedOccurrences.add(occurrenceId);
    }
  }

  const occurrenceIds = new Set();
  for (const [index, occurrence] of revision.asset_occurrences.entries()) {
    if (occurrence.ordinal !== index + 1) throw new Error("asset ordinal 순서가 올바르지 않습니다.");
    if (!blockIds.has(occurrence.block_id)) throw new Error("asset이 없는 block을 참조합니다.");
    if (occurrenceIds.has(occurrence.occurrence_id)) throw new Error("asset occurrence ID가 중복됩니다.");
    occurrenceIds.add(occurrence.occurrence_id);
    if (!referencedOccurrences.has(occurrence.occurrence_id)) throw new Error("block이 asset occurrence를 참조하지 않습니다.");
    if (!occurrence.width || !occurrence.height) throw new Error("asset dimensions가 없습니다.");
    const payload = await readFile(path.join(blobDir, occurrence.blob_sha256));
    if (digest(payload) !== occurrence.blob_sha256) throw new Error("asset hash가 일치하지 않습니다.");
    if (payload.length !== occurrence.bytes) throw new Error("asset bytes가 일치하지 않습니다.");
    const decoded = imageSize(payload);
    const decodedMime = decoded.type === "jpg" ? "image/jpeg" : `image/${decoded.type}`;
    if (decodedMime !== occurrence.mime) throw new Error("asset MIME이 binary와 일치하지 않습니다.");
    if (decoded.width !== occurrence.width || decoded.height !== occurrence.height) {
      throw new Error("asset dimensions가 binary와 일치하지 않습니다.");
    }
  }
  if (referencedOccurrences.size !== occurrenceIds.size) {
    throw new Error("존재하지 않는 asset occurrence 참조가 있습니다.");
  }

  const { revision_id: _revisionId, ...payload } = revision;
  if (`rev_${digest(canonicalJson(payload))}` !== revision.revision_id) {
    throw new Error("SourceRevision ID가 payload와 일치하지 않습니다.");
  }
  return true;
}

export async function promoteSourceRevision(revision, { storeDir }) {
  const revisionDir = path.join(storeDir, "revisions");
  const sourceDir = path.join(storeDir, "sources");
  const stagingDir = path.join(storeDir, "staging", revision.revision_id);
  const target = path.join(revisionDir, `${revision.revision_id}.json`);
  const pointer = path.join(sourceDir, `${revision.source_id}.json`);

  await validateSourceRevision(revision, { blobDir: path.join(storeDir, "blobs") });
  await mkdir(stagingDir, { recursive: true });
  await writeFile(
    path.join(stagingDir, "revision.json"),
    `${JSON.stringify(revision, null, 2)}\n`,
    "utf8",
  );
  await mkdir(revisionDir, { recursive: true });
  try {
    await rename(path.join(stagingDir, "revision.json"), target);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await rm(stagingDir, { recursive: true, force: true });

  await mkdir(sourceDir, { recursive: true });
  const pointerTemp = `${pointer}.tmp`;
  await writeFile(
    pointerTemp,
    `${JSON.stringify({ source_id: revision.source_id, revision_id: revision.revision_id }, null, 2)}\n`,
    "utf8",
  );
  await rename(pointerTemp, pointer);
  return { source_id: revision.source_id, revision_id: revision.revision_id };
}

export function buildImportManifest(revisions) {
  const items = revisions
    .map(({ source_id, revision_id, canonical_url }) => ({
      source_id,
      revision_id,
      canonical_url,
    }))
    .sort((left, right) => left.source_id.localeCompare(right.source_id));
  const duplicate = items.find(
    (item, index) => index > 0 && item.source_id === items[index - 1].source_id,
  );
  if (duplicate) throw new Error(`bundle source가 중복됩니다: ${duplicate.source_id}`);
  const payload = { schema_version: 1, item_count: items.length, items };
  return { ...payload, manifest_hash: digest(canonicalJson(payload)) };
}

async function readJsonIfPresent(target) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function promoteSourceBundle(
  revisions,
  { storeDir, beforeActivate = null } = {},
) {
  if (!revisions.length) throw new Error("빈 Source Snapshot bundle은 승격할 수 없습니다.");
  for (const revision of revisions) {
    await validateSourceRevision(revision, { blobDir: path.join(storeDir, "blobs") });
  }

  const manifest = buildImportManifest(revisions);
  const importDir = path.join(storeDir, "imports");
  const revisionDir = path.join(storeDir, "revisions");
  const stagingDir = path.join(storeDir, "staging", `import-${manifest.manifest_hash}`);
  const activePath = path.join(storeDir, "active-import.json");
  const previousActive = await readJsonIfPresent(activePath);
  const previousManifest = previousActive
    ? await readJsonIfPresent(path.join(importDir, `${previousActive.manifest_hash}.json`))
    : null;
  const previousBySource = new Map(
    (previousManifest?.items || []).map((item) => [item.source_id, item.revision_id]),
  );
  const changed = manifest.items.filter(
    (item) => previousBySource.get(item.source_id) !== item.revision_id,
  ).length;
  const unchanged = manifest.items.length - changed;

  await mkdir(stagingDir, { recursive: true });
  await writeFile(
    path.join(stagingDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await mkdir(revisionDir, { recursive: true });
  for (const revision of revisions) {
    const target = path.join(revisionDir, `${revision.revision_id}.json`);
    const existing = await readJsonIfPresent(target);
    if (existing && canonicalJson(existing) !== canonicalJson(revision)) {
      throw new Error(`immutable revision 충돌: ${revision.revision_id}`);
    }
    if (!existing) {
      await writeFile(target, `${JSON.stringify(revision, null, 2)}\n`, "utf8");
    }
  }

  await mkdir(importDir, { recursive: true });
  const manifestPath = path.join(importDir, `${manifest.manifest_hash}.json`);
  const existingManifest = await readJsonIfPresent(manifestPath);
  if (!existingManifest) {
    await rename(path.join(stagingDir, "manifest.json"), manifestPath);
  }
  await rm(stagingDir, { recursive: true, force: true });
  if (beforeActivate) await beforeActivate(manifest);

  const activeTemp = `${activePath}.tmp`;
  await writeFile(
    activeTemp,
    `${JSON.stringify({ manifest_hash: manifest.manifest_hash }, null, 2)}\n`,
    "utf8",
  );
  await rename(activeTemp, activePath);
  return {
    manifest_hash: manifest.manifest_hash,
    item_count: manifest.item_count,
    changed,
    unchanged,
    activated: previousActive?.manifest_hash !== manifest.manifest_hash,
  };
}
