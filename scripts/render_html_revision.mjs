import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [slug = "product-sense-definition", revisionArg, positionArg = "1"] =
  process.argv.slice(2);
const document = JSON.parse(
  await readFile(
    path.join(rootDir, "data/private/drafts", `${slug}.json`),
    "utf8",
  ),
);
const revisionNumber = Number(revisionArg || document.current_revision);
const position = Number(positionArg);
const revision = document.revisions.find(
  (item) => item.revision === revisionNumber,
);
if (!revision?.render_css) {
  throw new Error(`HTML revision을 찾지 못했습니다: ${revisionNumber}`);
}
const card = revision.cards.find((item) => item.position === position);
if (!card?.render_template) {
  throw new Error(`HTML card를 찾지 못했습니다: ${position}`);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const replacements = {
  "{{EYEBROW}}": escapeHtml(card.eyebrow_ko || ""),
  "{{SIGNATURE}}": escapeHtml("네카라쿠배 디자이너, 피그마스터"),
  "{{HEADLINE}}": escapeHtml(card.headline_ko || ""),
  "{{BODY}}": escapeHtml(card.body_ko || ""),
  "{{POSITION}}": String(card.position).padStart(2, "0"),
  "{{COUNT}}": String(
    revision.display_card_count || revision.cards.length,
  ).padStart(2, "0"),
  "{{SOURCE_IMAGE}}": escapeHtml(card.source_image_src || ""),
};
let markup = card.render_template;
for (const [placeholder, value] of Object.entries(replacements)) {
  markup = markup.replaceAll(placeholder, value);
}

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<style>
*{box-sizing:border-box}
html,body{width:1080px;height:1350px;margin:0;overflow:hidden}
body{font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
${revision.render_css}
</style></head><body>${markup}</body></html>`;

const temporaryDir = await mkdtemp(path.join(tmpdir(), "getdi-html-card-"));
const htmlPath = path.join(temporaryDir, "card.html");
const outputDir = path.join(
  rootDir,
  "data/private/previews",
  slug,
  `r${revisionNumber}`,
);
const outputPath = path.join(
  outputDir,
  `${String(position).padStart(2, "0")}.png`,
);
await mkdir(outputDir, { recursive: true });
await writeFile(htmlPath, html, "utf8");

const result = spawnSync(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-sandbox",
    "--force-device-scale-factor=1",
    "--window-size=1080,1350",
    `--screenshot=${outputPath}`,
    `file://${htmlPath}`,
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "Chrome render failed");
}
process.stdout.write(`${outputPath}\n`);
