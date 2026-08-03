import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

import { parseDetail } from "../crawler/detail.mjs";

export function contractSignature(html, pageUrl = "https://www.nngroup.com/articles/fixture/") {
  const $ = cheerio.load(html);
  const parsed = parseDetail(html, pageUrl);
  const body = cheerio.load(parsed.content_html || "", null, false);
  return {
    selectors: {
      title: $("h1.article-h1").length,
      article_body: $(".article-body, article").length,
      canonical: $("link[rel='canonical']").length,
    },
    semantic_tags: body.root().find("h2,h3,h4,h5,p,li,blockquote,figure,img,table").map((_, node) => node.name).get(),
    asset_sources: body.root().find("img").map((_, node) => $(node).attr("src") || "").get(),
    visible_text_length: body.root().text().replace(/\s+/g, " ").trim().length,
    parsed_required: {
      title: Boolean(parsed.title),
      source_url: Boolean(parsed.source_url),
      content_html: Boolean(parsed.content_html),
    },
  };
}

function walkDiff(before, after, prefix = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) || Array.isArray(after) || typeof before !== "object" || typeof after !== "object" || !before || !after) {
    return [{ path: prefix || "$", before, after }];
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => walkDiff(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

export function hermesReport(fixtures) {
  const changes = fixtures.flatMap(({ slug, baseline, candidate, pageUrl }) =>
    walkDiff(contractSignature(baseline, pageUrl), contractSignature(candidate, pageUrl)).map((change) => ({ slug, ...change })),
  );
  const critical = changes.some((change) => change.path.startsWith("parsed_required") && change.after === false);
  return {
    schema_version: 1,
    status: changes.length ? "change-detected" : "stable",
    severity: critical ? "critical" : changes.length ? "review" : "none",
    affected_slugs: [...new Set(changes.map((change) => change.slug))],
    changes,
    proposal: changes.length ? { status: "pending", action: "parser selector 또는 sanitizer 변경안을 사람이 검토한 뒤 canary를 다시 실행한다." } : null,
    code_modified: false,
  };
}

export function canaryDecision(report, proposal) {
  if (proposal?.status !== "approved") return { promoted: false, reason: "복구 제안이 승인되지 않았습니다." };
  if (report.status !== "stable") return { promoted: false, reason: "canary fixture가 아직 기준선과 다릅니다." };
  return { promoted: true, reason: "승인된 제안이 모든 대표 fixture 계약을 통과했습니다." };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []));
  if (!args.baseline || !args.candidate || !args.report) throw new Error("--baseline, --candidate, --report가 필요합니다.");
  const report = hermesReport([{ slug: args.slug || "fixture", baseline: await readFile(args.baseline, "utf8"), candidate: await readFile(args.candidate, "utf8"), pageUrl: args.url }]);
  const proposal = args.proposal ? JSON.parse(await readFile(args.proposal, "utf8")) : null;
  const output = { ...report, canary: canaryDecision(report, proposal), generated_at: new Date().toISOString() };
  await writeFile(args.report, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`${output.status} · ${output.severity} · 영향 ${output.affected_slugs.length}건 · 승격 ${output.canary.promoted ? "가능" : "불가"}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
