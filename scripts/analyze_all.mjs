/**
 * 수집한 기사를 하나씩 네 칸(주장·증거·연결·가치)으로 분석한다.
 *
 * 계약: skills/article-refinement/references/summary-method.md
 *
 * 개발 서버를 거치지 않고 분석 모듈을 직접 부른다. 처음에는 API로 돌렸는데,
 * 한 건이 타임아웃되며 서버가 내려가자 남은 57건이 전부 `fetch failed`로
 * 죽었다. 한 시간짜리 배치가 서버 수명에 매달릴 이유가 없다.
 *
 *   node scripts/analyze_all.mjs              # 네 칸이 덜 채워진 기사만
 *   node scripts/analyze_all.mjs --all        # 전부 다시
 *   node scripts/analyze_all.mjs --limit 3    # 몇 건만 시험
 */

import { mkdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAnalysisHandler } from "../server/analysis.mjs";
import { createModelHandler } from "../server/model.mjs";
import { annotateSourceBlocks, imageSources } from "../server/source.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const analysisDir = path.join(rootDir, "data/private/analyses");

function parseArguments(argv) {
  const options = { limit: null, all: false, year: 2026 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--limit") options.limit = Number(argv[++index]);
    else if (flag === "--year") options.year = Number(argv[++index]);
    else if (flag === "--all") options.all = true;
  }
  return options;
}

/** 네 칸이 모두 채워졌는지 본다. 빈 칸은 그 자체로 결함이다. */
function missingFields(analysis) {
  const gaps = [];
  if (!analysis?.core_message?.reasoning_ko) gaps.push("core.reasoning");
  for (const [index, insight] of (analysis?.key_insights || []).entries()) {
    if (!insight.reasoning_ko) gaps.push(`insight${index + 1}.reasoning`);
    if (!insight.source_block_ids?.length) gaps.push(`insight${index + 1}.source`);
  }
  return gaps;
}

async function readAnalysis(slug) {
  try {
    return JSON.parse(
      await readFile(path.join(analysisDir, `${slug}.json`), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** 다시 분석하기 전에 기존 결과를 지우지 않고 옆으로 치운다. */
async function archive(slug, stamp) {
  const source = path.join(analysisDir, `${slug}.json`);
  const target = path.join(analysisDir, "archive", `${slug}.${stamp}.json`);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
}

const options = parseArguments(process.argv.slice(2));
const { runCodexStructured } = createModelHandler({ rootDir });
const { ensureArticleAnalysis } = createAnalysisHandler({
  rootDir,
  annotateSourceBlocks,
  imageSources,
  runCodexStructured,
});

const listing = JSON.parse(
  await readFile(
    path.join(
      rootDir,
      "data/processed/nngroup",
      String(options.year),
      "articles.json",
    ),
    "utf8",
  ),
);

let queue = [];
for (const item of listing.items) {
  const existing = await readAnalysis(item.slug);
  if (options.all || !existing || missingFields(existing).length) {
    queue.push({ ...item, hadAnalysis: Boolean(existing) });
  }
}
if (options.limit !== null) queue = queue.slice(0, Math.max(0, options.limit));

console.log(`${listing.items.length}건 중 ${queue.length}건을 분석한다`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
let done = 0;
let failed = 0;
const gapsFound = [];
const failures = [];

for (const [index, item] of queue.entries()) {
  const label = `[${index + 1}/${queue.length}] ${item.slug}`;
  const startedAt = Date.now();
  try {
    if (item.hadAnalysis) await archive(item.slug, stamp);
    const analysis = await ensureArticleAnalysis(item.slug);
    const gaps = missingFields(analysis);
    if (gaps.length) gapsFound.push({ slug: item.slug, gaps });
    done += 1;
    console.log(
      `${label} — ${Math.round((Date.now() - startedAt) / 1000)}초` +
        (gaps.length ? ` · 빈 칸 ${gaps.length}개` : ""),
    );
  } catch (error) {
    failed += 1;
    failures.push({ slug: item.slug, error: error.message });
    console.log(`${label} — 실패: ${error.message}`);
  }
}

console.log(`\n분석 ${done}건, 실패 ${failed}건`);
if (gapsFound.length) {
  console.log(`네 칸이 덜 채워진 기사 ${gapsFound.length}건:`);
  for (const entry of gapsFound.slice(0, 10)) {
    console.log(`  ${entry.slug}: ${entry.gaps.join(", ")}`);
  }
}
if (failures.length) {
  console.log("실패:");
  for (const entry of failures.slice(0, 10)) {
    console.log(`  ${entry.slug}: ${entry.error}`);
  }
}
process.exit(failed ? 2 : 0);
