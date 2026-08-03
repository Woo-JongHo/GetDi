import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";

import { ZipArchive } from "archiver";
import sharp from "sharp";

import { sendJson } from "./http.mjs";

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1350;
export const EXPORT_MAX_BYTES = 1_200_000;
export const RENDERER_VERSION = "assignment-svg-v1";

function escapeXml(value = "") {
  return String(value).replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  })[character]);
}

function wrap(value, limit) {
  const characters = Array.from(String(value || ""));
  const lines = [];
  while (characters.length) lines.push(characters.splice(0, limit).join(""));
  return lines.slice(0, 6);
}

export function validateExportInput(revision, { approvedRuleIds = [], assetRights = new Map() } = {}) {
  const approved = new Set(approvedRuleIds);
  const errors = [];
  for (const card of revision.cards || []) {
    for (const ruleId of card.design_rule_ids || []) {
      if (!approved.has(ruleId)) errors.push(`${card.position}번 카드의 디자인 근거 ${ruleId}가 승인되지 않았습니다.`);
    }
    if (card.source_image_src) {
      const status = assetRights.get(card.source_image_src) || "unknown";
      if (status !== "export-approved") errors.push(`${card.position}번 카드 이미지 권리가 ${status} 상태입니다.`);
    }
    if (!(card.source_block_ids || []).length) errors.push(`${card.position}번 카드에 원문 근거가 없습니다.`);
  }
  return errors;
}

export function cardSvg(card) {
  const title = wrap(card.headline_ko, 14);
  const body = wrap(card.body_ko, 26);
  const titleY = card.typography_assignment?.title_zone === "middle" ? 430 : 180;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${EXPORT_HEIGHT}">
  <style>text{font-family:Arial,'Apple SD Gothic Neo',sans-serif;fill:#111214}.eyebrow{font-size:30px;font-weight:700}.title{font-size:74px;font-weight:800}.body{font-size:34px;font-weight:500}</style>
  <text class="eyebrow" x="84" y="110">${escapeXml(card.eyebrow_ko)}</text>
  ${title.map((line, index) => `<text class="title" x="84" y="${titleY + index * 90}">${escapeXml(line)}</text>`).join("\n  ")}
  ${body.map((line, index) => `<text class="body" x="84" y="${820 + index * 52}">${escapeXml(line)}</text>`).join("\n  ")}
</svg>`;
}

async function zipBuffers(entries) {
  const output = new PassThrough();
  const chunks = [];
  output.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);
  });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);
  for (const entry of entries) archive.append(entry.buffer, { name: entry.name });
  await archive.finalize();
  return done;
}

export function createExportHandler({ rootDir }) {
  const draftDir = path.join(rootDir, "data/private/drafts");
  const detailDir = path.join(rootDir, "data/private/details/articles");
  const artifactRoot = path.join(rootDir, "data/state/export-artifacts");

  async function createArtifact(slug, revisionNumber) {
    const document = JSON.parse(await readFile(path.join(draftDir, `${slug}.json`), "utf8"));
    const revision = document.revisions.find((item) => item.revision === revisionNumber);
    if (!revision) throw Object.assign(new Error("Draft revision을 찾지 못했습니다."), { statusCode: 404 });
    const detail = JSON.parse(await readFile(path.join(detailDir, `${slug}.json`), "utf8"));
    const rights = new Map((detail.assets || []).map((asset) => [asset.source_url || asset.src, asset.rights_status || "unknown"]));
    const reviews = await readFile(path.join(rootDir, "data/state/evidence-reviews.json"), "utf8").then(JSON.parse).catch((error) => {
      if (error.code === "ENOENT") return { events: [] };
      throw error;
    });
    const latest = new Map();
    for (const event of reviews.events || []) latest.set(event.candidate_id, event);
    const approved = [...latest.values()].filter((event) => event.status === "approved").map((event) => event.candidate_id.split(":").at(-1));
    const errors = validateExportInput(revision, { approvedRuleIds: approved, assetRights: rights });
    if (errors.length) throw Object.assign(new Error("Export 검증에 실패했습니다."), { statusCode: 422, validation: errors });

    const input = { slug, revision: revisionNumber, source_revision_id: revision.source_revision_id || null, reference_profile_id: revision.reference_profile_id, reference_analyzed_at: revision.reference_analyzed_at, renderer_version: RENDERER_VERSION };
    const artifactId = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const artifactDir = path.join(artifactRoot, artifactId);
    try {
      return JSON.parse(await readFile(path.join(artifactDir, "manifest.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const files = [];
    for (const card of revision.cards) {
      const buffer = await sharp(Buffer.from(cardSvg(card))).png().toBuffer();
      const metadata = await sharp(buffer).metadata();
      if (metadata.width !== EXPORT_WIDTH || metadata.height !== EXPORT_HEIGHT || metadata.format !== "png" || buffer.byteLength > EXPORT_MAX_BYTES) {
        throw Object.assign(new Error(`${card.position}번 카드 출력 규격이 올바르지 않습니다.`), { statusCode: 422 });
      }
      files.push({ name: `card-${String(card.position).padStart(2, "0")}.png`, buffer, bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex"), width: metadata.width, height: metadata.height, mime_type: "image/png" });
    }
    const manifest = { schema_version: 1, artifact_id: artifactId, status: "ready", created_at: new Date().toISOString(), input, validation: { passed: true, max_bytes: EXPORT_MAX_BYTES }, files: files.map(({ buffer, ...file }) => file) };
    const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const zip = await zipBuffers([...files, { name: "manifest.json", buffer: manifestBuffer }]);
    const temporaryDir = `${artifactDir}.tmp-${process.pid}`;
    await mkdir(temporaryDir, { recursive: true });
    for (const file of files) await writeFile(path.join(temporaryDir, file.name), file.buffer);
    await writeFile(path.join(temporaryDir, "manifest.json"), manifestBuffer);
    await writeFile(path.join(temporaryDir, "getdi-cards.zip"), zip);
    await mkdir(artifactRoot, { recursive: true });
    await rename(temporaryDir, artifactDir);
    return manifest;
  }

  return async function handleExport(request, response, url) {
    const createMatch = url.pathname.match(/^\/api\/exports\/([a-z0-9-]+)\/(\d+)$/);
    if (createMatch && request.method === "POST") {
      try {
        sendJson(response, 201, await createArtifact(createMatch[1], Number(createMatch[2])));
      } catch (error) {
        sendJson(response, error.statusCode || 500, { error: error.message, validation: error.validation || [] });
      }
      return true;
    }
    const downloadMatch = url.pathname.match(/^\/api\/export-artifacts\/([a-f0-9]{64})\/download$/);
    if (downloadMatch && request.method === "GET") {
      try {
        const filePath = path.join(artifactRoot, downloadMatch[1], "getdi-cards.zip");
        const info = await stat(filePath);
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/zip");
        response.setHeader("Content-Length", info.size);
        response.setHeader("Content-Disposition", `attachment; filename="getdi-${downloadMatch[1].slice(0, 8)}.zip"`);
        response.end(await readFile(filePath));
      } catch (error) {
        sendJson(response, 404, { error: "다운로드 가능한 ExportArtifact가 없습니다." });
      }
      return true;
    }
    return false;
  };
}
