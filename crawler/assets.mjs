/**
 * 본문 안의 이미지를 로컬로 내려받는다.
 *
 * 이미지 URL만 저장하면 원문이 바뀌거나 사라졌을 때 카드 초안이
 * 근거를 잃는다. 그래서 binary를 받아 SHA-256으로 식별해 두고,
 * URL·순서·alt·캡션을 함께 기록한다.
 */

import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { imageSize } from "image-size";
import { USER_AGENT } from "./robots.mjs";

function squish(text) {
  return (text || "").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * 정제된 본문 HTML에서 이미지 목록을 순서대로 뽑는다.
 * 같은 URL이 여러 번 나오면 첫 등장만 남긴다.
 */
export function bodyImages(contentHtml) {
  const $ = cheerio.load(contentHtml || "");
  const seen = new Set();
  const images = [];

  $("img").each((_, element) => {
    const $image = $(element);
    const sourceUrl = $image.attr("src");
    if (!sourceUrl || seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    const caption = squish($image.closest("figure").find("figcaption").text());
    images.push({
      source_url: sourceUrl,
      alt: $image.attr("alt") ?? null,
      caption: caption || null,
    });
  });

  return images;
}

async function writeAtomic(target, data) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, target);
}

export async function downloadAsset(image, { assetDir }) {
  const response = await fetch(image.source_url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`이미지 응답 ${response.status}`);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const blobSha256 = createHash("sha256").update(payload).digest("hex");
  let dimensions;
  try {
    dimensions = imageSize(payload);
  } catch {
    throw new Error("이미지 dimensions를 판독하지 못했습니다.");
  }
  if (!dimensions.width || !dimensions.height) {
    throw new Error("이미지 dimensions가 없습니다.");
  }
  const target = path.join(assetDir, blobSha256);
  await writeAtomic(target, payload);
  await writeAtomic(
    `${target}.json`,
    Buffer.from(
      `${JSON.stringify({
        sha256: blobSha256,
        bytes: payload.length,
        mime: (contentType || "application/octet-stream").split(";")[0],
        width: dimensions.width,
        height: dimensions.height,
      }, null, 2)}\n`,
    ),
  );

  return {
    kind: "body_image",
    source_url: image.source_url,
    local_path: target,
    sha256: blobSha256,
    blob_sha256: blobSha256,
    bytes: payload.length,
    content_type: contentType,
    mime: (contentType || "application/octet-stream").split(";")[0],
    width: dimensions.width,
    height: dimensions.height,
    alt: image.alt,
    caption: image.caption,
    credit: null,
    rights_status: "unknown",
  };
}
