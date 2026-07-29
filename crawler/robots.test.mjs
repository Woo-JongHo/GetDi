import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FALLBACK_DELAY_SECONDS,
  MINIMUM_DELAY_SECONDS,
  parseCrawlDelay,
  resolveCrawlDelay,
} from "./robots.mjs";

const crawlerDir = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROBOTS_TXT = fs.readFileSync(
  path.join(crawlerDir, "fixtures/robots.txt"),
  "utf8",
);

function robotsResponse(body) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => body,
  });
}

test("local NN/g robots.txt fixture yields 60 seconds", async () => {
  assert.equal(parseCrawlDelay(REAL_ROBOTS_TXT), 60);
  const resolved = await resolveCrawlDelay(robotsResponse(REAL_ROBOTS_TXT));
  assert.equal(resolved.seconds, 60);
  assert.equal(resolved.source, "robots");
});

test("no wildcard group is indeterminate and resolves to the 60-second fallback", async () => {
  const body = "User-agent: ExampleBot\nCrawl-Delay: 7";
  assert.equal(parseCrawlDelay(body), null);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, FALLBACK_DELAY_SECONDS);
  assert.equal(resolved.source, "fallback");
});

test("a delay under a different user-agent group does not leak", async () => {
  const body = [
    "User-agent: ExampleBot",
    "Crawl-Delay: 7",
    "",
    "User-agent: *",
    "Disallow: /private/",
  ].join("\n");
  assert.equal(parseCrawlDelay(body), null);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, FALLBACK_DELAY_SECONDS);
  assert.equal(resolved.source, "fallback");
});

test("comments and surrounding whitespace are ignored", async () => {
  const body = [
    "# global comment",
    " User-agent : * # wildcard group",
    " Crawl-Delay : 45 # seconds",
  ].join("\n");
  assert.equal(parseCrawlDelay(body), 45);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, 45);
  assert.equal(resolved.source, "robots");
});

test("a missing delay value is indeterminate", async () => {
  const body = "User-agent: *\nCrawl-Delay:";
  assert.equal(parseCrawlDelay(body), null);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, FALLBACK_DELAY_SECONDS);
  assert.equal(resolved.source, "fallback");
});

test("a non-numeric delay value is indeterminate", async () => {
  const body = "User-agent: *\nCrawl-Delay: slowly";
  assert.equal(parseCrawlDelay(body), null);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, FALLBACK_DELAY_SECONDS);
  assert.equal(resolved.source, "fallback");
});

test("zero is parsed as fact but raised to the one-second minimum policy", async () => {
  const body = "User-agent: *\nCrawl-Delay: 0";
  assert.equal(parseCrawlDelay(body), 0);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, MINIMUM_DELAY_SECONDS);
  assert.equal(resolved.seconds, 1);
  assert.equal(resolved.source, "robots");
});

test("a wildcard group after another group uses only the wildcard delay", async () => {
  const body = [
    "User-agent: ExampleBot",
    "Crawl-Delay: 3",
    "",
    "User-agent: *",
    "Crawl-Delay: 60",
  ].join("\n");
  assert.equal(parseCrawlDelay(body), 60);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, 60);
  assert.equal(resolved.source, "robots");
});

test("consecutive user-agent records before rules form one group", async () => {
  const body = [
    "User-agent: *",
    "User-agent: ExampleBot",
    "Crawl-Delay: 12",
  ].join("\n");
  assert.equal(parseCrawlDelay(body), 12);
  const resolved = await resolveCrawlDelay(robotsResponse(body));
  assert.equal(resolved.seconds, 12);
  assert.equal(resolved.source, "robots");
});
