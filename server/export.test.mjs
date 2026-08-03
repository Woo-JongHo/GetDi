import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { cardSvg, createExportHandler, EXPORT_HEIGHT, EXPORT_WIDTH, validateExportInput } from "./export.mjs";

const card = { position: 1, eyebrow_ko: "근거", headline_ko: "검증된 초안", body_ko: "배경 없이 글씨를 배정합니다.", typography_assignment: { title_zone: "top" }, source_block_ids: ["b1"], design_rule_ids: ["LAY-01"], source_image_src: null };

test("미승인 근거와 미확인 이미지 권리는 export를 거부한다", () => {
  const errors = validateExportInput({ cards: [{ ...card, source_image_src: "image.png" }] }, { approvedRuleIds: [], assetRights: new Map([["image.png", "unknown"]]) });
  assert.equal(errors.length, 2);
});

test("승인 근거만 사용한 카드는 gate를 통과한다", () => {
  assert.deepEqual(validateExportInput({ cards: [card] }, { approvedRuleIds: ["LAY-01"] }), []);
});

test("동일 render path가 1080x1350 PNG를 만든다", async () => {
  const buffer = await sharp(Buffer.from(cardSvg(card))).png().toBuffer();
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, EXPORT_WIDTH);
  assert.equal(metadata.height, EXPORT_HEIGHT);
  assert.equal(metadata.format, "png");
});

test("중앙 gate가 immutable manifest와 실제 ZIP을 만든다", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "getdi-export-"));
  await mkdir(path.join(rootDir, "data/private/drafts"), { recursive: true });
  await mkdir(path.join(rootDir, "data/private/details/articles"), { recursive: true });
  await mkdir(path.join(rootDir, "data/state"), { recursive: true });
  await writeFile(path.join(rootDir, "data/private/drafts/a.json"), JSON.stringify({ revisions: [{ revision: 1, source_revision_id: "source-1", reference_profile_id: "set-b", reference_analyzed_at: "now", cards: [card] }] }));
  await writeFile(path.join(rootDir, "data/private/details/articles/a.json"), JSON.stringify({ assets: [] }));
  await writeFile(path.join(rootDir, "data/state/evidence-reviews.json"), JSON.stringify({ events: [{ candidate_id: "design-rule:set-b:LAY-01", status: "approved" }] }));
  const handle = createExportHandler({ rootDir });
  let body;
  const response = { setHeader() {}, end(value) { body = value; } };
  assert.equal(await handle({ method: "POST" }, response, new URL("http://local/api/exports/a/1")), true);
  const payload = JSON.parse(body);
  assert.equal(payload.status, "ready");
  const zip = await readFile(path.join(rootDir, "data/state/export-artifacts", payload.artifact_id, "getdi-cards.zip"));
  assert.equal(zip.subarray(0, 2).toString(), "PK");
});
