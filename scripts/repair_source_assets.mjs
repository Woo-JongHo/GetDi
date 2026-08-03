import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bodyImages, downloadAsset } from "../crawler/assets.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function writeJsonAtomic(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function repairSourceAssets(slugs, { projectRoot = rootDir } = {}) {
  const repaired = [];
  for (const slug of slugs) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`올바르지 않은 slug: ${slug}`);
    const detailPath = path.join(
      projectRoot,
      "data/private/details/articles",
      `${slug}.json`,
    );
    const detail = JSON.parse(await readFile(detailPath, "utf8"));
    const known = new Set((detail.assets || []).map((asset) => asset.source_url));
    const missing = bodyImages(detail.content_html).filter(
      (image) => !known.has(image.source_url),
    );
    if (!missing.length) continue;
    const assetDir = path.join(
      projectRoot,
      "data/private/assets/nngroup/articles",
      slug,
    );
    const downloaded = [];
    for (const image of missing) {
      downloaded.push(await downloadAsset(image, { assetDir }));
    }
    await writeJsonAtomic(detailPath, {
      ...detail,
      assets: [...(detail.assets || []), ...downloaded],
    });
    repaired.push({ slug, downloaded: downloaded.length });
  }
  return repaired;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  repairSourceAssets(process.argv.slice(2))
    .then((repaired) => {
      const total = repaired.reduce((sum, item) => sum + item.downloaded, 0);
      console.log(`보수 ${repaired.length}개 기사 · 이미지 ${total}개`);
      for (const item of repaired) console.log(`${item.slug}: ${item.downloaded}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
