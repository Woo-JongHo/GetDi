/**
 * 본문 안의 이미지를 로컬로 내려받는다.
 *
 * 이미지 URL만 저장하면 원문이 바뀌거나 사라졌을 때 카드 초안이
 * 근거를 잃는다. 그래서 binary를 받아 SHA-256으로 식별해 두고,
 * URL·순서·alt·캡션을 함께 기록한다.
 */

import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { USER_AGENT } from "./robots.mjs";

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
]);
const MIME_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
};

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

function extensionFor(url, contentType) {
  const suffix = path.extname(new URL(url).pathname).toLowerCase();
  if (IMAGE_EXTENSIONS.has(suffix)) return suffix;
  const mime = (contentType || "").split(";")[0].trim().toLowerCase();
  return MIME_EXTENSIONS[mime] || ".bin";
}

async function writeAtomic(target, data) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, target);
}

export async function downloadAsset(image, { assetDir, format, slug, index }) {
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
  const urlDigest = createHash("sha256")
    .update(image.source_url)
    .digest("hex")
    .slice(0, 10);
  const fileName = `${String(index).padStart(2, "0")}-${urlDigest}${extensionFor(
    image.source_url,
    contentType,
  )}`;
  const target = path.join(assetDir, `${format}s`, slug, fileName);
  await writeAtomic(target, payload);

  return {
    kind: "body_image",
    source_url: image.source_url,
    local_path: target,
    sha256: createHash("sha256").update(payload).digest("hex"),
    bytes: payload.length,
    content_type: contentType,
    alt: image.alt,
    caption: image.caption,
  };
}
