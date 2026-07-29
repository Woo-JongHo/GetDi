import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

import { parseDetail } from "./detail.mjs";

const crawlerDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(crawlerDir, "..");
const rawDir = path.join(rootDir, "data/private/raw-details/articles");
const expectedDir = path.join(rootDir, "data/private/details/articles");
const scalarFields = [
  "source_url",
  "format",
  "title",
  "published_date",
  "duration_minutes",
  "authors",
  "topics",
  "image_url",
  "youtube_embed_url",
];
const disallowedTags = [
  "script",
  "style",
  "svg",
  "noscript",
  "form",
  "button",
];

// 대조는 Python 파서가 만든 기준선에 대해서만 유효하다. 크롤러를 돌리면
// 같은 디렉터리에 Node가 만든 기사가 쌓이는데, 그것을 "기대값"으로 삼으면
// 자기 자신과 비교하는 것이라 무엇도 증명하지 못한다. 그래서 대상 slug를
// 디렉터리 목록이 아니라 고정된 기준선 파일에서 읽는다.
const baseline = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "crawler/fixtures/python-baseline-slugs.json"),
    "utf8",
  ),
);

function detailPairs() {
  const pairs = baseline.slugs.map((slug) => {
    const htmlFile = `${slug}.html`;
    const expectedPath = path.join(expectedDir, `${slug}.json`);
    assert.ok(
      fs.existsSync(path.join(rawDir, htmlFile)),
      `missing baseline HTML for ${slug}`,
    );
    assert.ok(fs.existsSync(expectedPath), `missing expected JSON for ${slug}`);
    const html = fs.readFileSync(path.join(rawDir, htmlFile), "utf8");
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
    return {
      slug,
      expected,
      actual: parseDetail(html, expected.source_url),
    };
  });

  assert.equal(
    pairs.length,
    baseline.count,
    "the complete Python baseline corpus must be exercised",
  );
  return pairs;
}

function fragment(html) {
  return cheerio.load(html || "", null, false);
}

function tagStructure(html) {
  const $ = fragment(html);

  function visit(node) {
    return [
      node.name,
      (node.children || [])
        .filter((child) => child.type === "tag")
        .map(visit),
    ];
  }

  return $.root()
    .contents()
    .toArray()
    .filter((node) => node.type === "tag")
    .map(visit);
}

function normalizedText(html) {
  return fragment(html).root().text().replace(/\r\n/g, "\n");
}

function normalizedUrl(value, baseUrl) {
  if (value === undefined || value === null) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function imageSequence(html, baseUrl) {
  const $ = fragment(html);
  return $("img")
    .toArray()
    .map((image) => normalizedUrl($(image).attr("src"), baseUrl));
}

function failuresFor(check) {
  return corpus.filter(({ actual, expected }) => !check(actual, expected));
}

function assertNoFailures(failures, label) {
  assert.equal(
    failures.length,
    0,
    `${label}: ${failures.length}/148 failed; first: ${failures
      .slice(0, 10)
      .map(({ slug }) => slug)
      .join(", ")}`,
  );
}

const corpus = detailPairs();

test("detail contract 1: nested tag structure matches on all 148 pages", () => {
  const failures = failuresFor(
    (actual, expected) =>
      isDeepStrictEqual(
        tagStructure(actual.content_html),
        tagStructure(expected.content_html),
      ),
  );
  assertNoFailures(failures, "nested tag structure");
});

test("detail contract 2: decoded, CRLF-normalized visible text matches on all 148 pages", () => {
  const failures = failuresFor(
    (actual, expected) =>
      normalizedText(actual.content_html) ===
      normalizedText(expected.content_html),
  );
  assertNoFailures(failures, "visible text");
});

test("detail contract 3: normalized img src sequence matches on all 148 pages", () => {
  const failures = failuresFor(
    (actual, expected) =>
      isDeepStrictEqual(
        imageSequence(actual.content_html, expected.source_url),
        imageSequence(expected.content_html, expected.source_url),
      ),
  );
  assertNoFailures(failures, "image sequence");
});

test("detail contract 4: no disallowed tags survive on all 148 pages", () => {
  const failures = failuresFor((actual) => {
    const $ = fragment(actual.content_html);
    return disallowedTags.every((tag) => $(tag).length === 0);
  });
  assertNoFailures(failures, "disallowed tags");
});

test("detail contract 5: scalar fields and normalized summary match on all 148 pages", () => {
  const failures = failuresFor((actual, expected) => {
    const scalarsMatch = scalarFields.every((field) =>
      isDeepStrictEqual(actual[field], expected[field]),
    );
    return (
      scalarsMatch &&
      actual.summary.replace(/\r\n/g, "\n") ===
        expected.summary.replace(/\r\n/g, "\n")
    );
  });
  assertNoFailures(failures, "scalar fields and summary");
});
