import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LISTING_URL, parseListing } from "./listing.mjs";

const crawlerDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(crawlerDir, "..");
const listingPath = path.join(
  rootDir,
  "data/private/raw-listing/articles-page-001.html",
);
const pythonSource = path.join(
  os.homedir(),
  "woo/00_project/00_universe/GatherDesign/src",
);
const comparedFields = [
  "format",
  "title",
  "url",
  "slug",
  "published_date",
  "summary",
  "thumbnail_url",
];

function pythonListing() {
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "from gatherdesign.nngroup import parse_topic_listing",
    "html = Path(sys.argv[1]).read_text(encoding='utf-8')",
    "print(json.dumps(parse_topic_listing(html, sys.argv[2]), ensure_ascii=False))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, listingPath, LISTING_URL], {
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: pythonSource },
  });

  assert.equal(
    result.status,
    0,
    `Python listing parser failed:\n${result.stderr || result.stdout}`,
  );
  return JSON.parse(result.stdout);
}

function comparableValue(item, field) {
  return item[field] === undefined ? null : item[field];
}

const html = fs.readFileSync(listingPath, "utf8");
const expected = pythonListing();
const actual = parseListing(html, LISTING_URL);

test("listing contract: both parsers return all 30 items", () => {
  assert.equal(expected.items.length, 30, "Python fixture result changed");
  assert.equal(actual.items.length, 30, "Node must return all fixture items");
});

for (const field of comparedFields) {
  test(`listing contract: ${field} matches by value for all 30 items`, () => {
    const mismatches = [];
    for (let index = 0; index < expected.items.length; index += 1) {
      const expectedValue = comparableValue(expected.items[index], field);
      const actualValue = comparableValue(actual.items[index], field);
      try {
        assert.deepEqual(actualValue, expectedValue);
      } catch {
        mismatches.push({
          index,
          slug: expected.items[index].slug,
          actual: actualValue,
          expected: expectedValue,
        });
      }
    }
    assert.deepEqual(mismatches, []);
  });
}
