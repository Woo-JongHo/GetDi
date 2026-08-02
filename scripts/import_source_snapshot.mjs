import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { imageSize } from "image-size";

import {
  buildSourceRevision,
  promoteSourceBundle,
  promoteSourceRevision,
} from "../crawler/source-snapshot.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function writeAtomic(target, payload) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, payload);
  await rename(temporary, target);
}

async function prepareSourceSnapshot(slug, { projectRoot = rootDir } = {}) {
  if (!/^[a-z0-9-]+$/.test(slug || "")) throw new Error("올바른 기사 slug가 필요합니다.");
  const detailPath = path.join(projectRoot, "data/private/details/articles", `${slug}.json`);
  const detail = JSON.parse(await readFile(detailPath, "utf8"));
  const storeDir = path.join(projectRoot, "data/private/source-snapshots");
  const blobDir = path.join(storeDir, "blobs");
  const assets = [];

  for (const asset of detail.assets || []) {
    const sourcePath = path.isAbsolute(asset.local_path)
      ? asset.local_path
      : path.join(projectRoot, asset.local_path);
    const payload = await readFile(sourcePath);
    const sha256 = createHash("sha256").update(payload).digest("hex");
    if (asset.sha256 && asset.sha256 !== sha256) {
      throw new Error(`legacy asset hash가 일치하지 않습니다: ${asset.source_url}`);
    }
    const dimensions = imageSize(payload);
    if (!dimensions.width || !dimensions.height) {
      throw new Error(`asset dimensions를 판독하지 못했습니다: ${asset.source_url}`);
    }
    const mime = (asset.content_type || "application/octet-stream").split(";")[0];
    await writeAtomic(path.join(blobDir, sha256), payload);
    await writeAtomic(
      path.join(blobDir, `${sha256}.json`),
      `${JSON.stringify({ sha256, bytes: payload.length, mime, width: dimensions.width, height: dimensions.height }, null, 2)}\n`,
    );
    assets.push({
      ...asset,
      blob_sha256: sha256,
      mime,
      bytes: payload.length,
      width: dimensions.width,
      height: dimensions.height,
      credit: asset.credit ?? null,
      rights_status: asset.rights_status ?? "unknown",
    });
  }

  const revision = buildSourceRevision(detail, assets);
  return { detail, detailPath, revision, storeDir };
}

export async function importSourceSnapshot(slug, { projectRoot = rootDir } = {}) {
  const { detail, detailPath, revision, storeDir } = await prepareSourceSnapshot(slug, {
    projectRoot,
  });
  await promoteSourceRevision(revision, { storeDir });
  await writeAtomic(
    detailPath,
    `${JSON.stringify({ ...detail, source_id: revision.source_id, revision_id: revision.revision_id }, null, 2)}\n`,
  );
  return revision;
}

export async function importSourceSnapshotBundle(slugs, { projectRoot = rootDir } = {}) {
  if (!Array.isArray(slugs) || !slugs.length) {
    throw new Error("bundle에 기사 slug가 하나 이상 필요합니다.");
  }
  const prepared = [];
  for (const slug of slugs) {
    prepared.push(await prepareSourceSnapshot(slug, { projectRoot }));
  }
  const storeDir = prepared[0].storeDir;
  const result = await promoteSourceBundle(
    prepared.map((item) => item.revision),
    { storeDir },
  );
  for (const { detail, detailPath, revision } of prepared) {
    await writeAtomic(
      detailPath,
      `${JSON.stringify({ ...detail, source_id: revision.source_id, revision_id: revision.revision_id }, null, 2)}\n`,
    );
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bundleMode = process.argv[2] === "--bundle";
  const operation = bundleMode
    ? importSourceSnapshotBundle(process.argv.slice(3))
    : importSourceSnapshot(process.argv[2]);
  operation
    .then((result) => {
      if (bundleMode) {
        console.log(
          `${result.manifest_hash} — item ${result.item_count}, changed ${result.changed}, unchanged ${result.unchanged}`,
        );
      } else {
        console.log(
          `${result.source_id} ${result.revision_id} — block ${result.blocks.length}, asset ${result.asset_occurrences.length}`,
        );
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
