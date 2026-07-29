/**
 * 크롤링 화면이 쓰는 API.
 *
 * 수집은 60초 간격 때문에 몇 시간이 걸린다. HTTP 요청 하나로 끝날 수
 * 없으므로 별도 프로세스로 띄우고, 화면은 state 파일을 주기적으로 읽어
 * 진행을 본다. 프로세스가 죽어도 state 파일은 남아 재개가 가능하다.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readRequestJson, sendJson } from "./http.mjs";

/**
 * 수집기는 요청 간격만큼 기다리는 동안에도 state를 갱신한다. 그 간격(기본
 * 60초)보다 넉넉히 잡아, 이보다 오래 조용하면 죽은 것으로 본다.
 */
const STALE_STATE_MS = 150_000;

export function createCrawlHandler({ rootDir }) {
  const runnerPath = path.join(rootDir, "crawler/run.mjs");
  let child = null;
  let lastExit = null;

  function statePath(year) {
    return path.join(rootDir, "data/state", `crawl-${year}.json`);
  }

  function listingPath(year) {
    return path.join(
      rootDir,
      "data/processed/nngroup",
      String(year),
      "articles.json",
    );
  }

  async function readJsonOrNull(target) {
    try {
      return JSON.parse(await readFile(target, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  function start({ year, limit, listingOnly }) {
    if (child) return { started: false, reason: "이미 수집이 돌고 있다" };

    const args = [runnerPath, "--year", String(year)];
    if (limit) args.push("--limit", String(limit));
    if (listingOnly) args.push("--listing-only");

    child = spawn(process.execPath, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const startedAt = new Date().toISOString();
    const log = [];
    const record = (chunk) => {
      log.push(...chunk.toString("utf8").split("\n").filter(Boolean));
      if (log.length > 200) log.splice(0, log.length - 200);
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    child.on("exit", (code) => {
      lastExit = { code, startedAt, endedAt: new Date().toISOString(), log };
      child = null;
    });

    child.log = log;
    return { started: true, startedAt };
  }

  function stop() {
    if (!child) return { stopped: false, reason: "돌고 있는 수집이 없다" };
    child.kill("SIGTERM");
    return { stopped: true };
  }

  return async function handleCrawl(request, response, url) {
    if (
      !url.pathname.startsWith("/api/crawl") &&
      url.pathname !== "/api/usage-summary"
    ) {
      return false;
    }
    const year = Number(url.searchParams.get("year") || 2026);

    if (url.pathname === "/api/crawl/state" && request.method === "GET") {
      const state = await readJsonOrNull(statePath(year));
      // 이 서버가 띄운 수집만 child로 잡힌다. 사용자가 터미널에서 직접
      // `npm run crawl`을 돌렸다면 child는 없지만 수집은 돌고 있다.
      // state 파일이 최근에 갱신됐는지로 그 경우를 구분한다 — 그렇지 않으면
      // 화면이 "대기 중"이라고 거짓말을 한다.
      const updatedAgo = state?.updated_at
        ? Date.now() - new Date(state.updated_at).getTime()
        : Infinity;
      const externalRunning =
        !child && state?.status === "running" && updatedAgo < STALE_STATE_MS;

      sendJson(response, 200, {
        running: Boolean(child),
        external_running: externalRunning,
        state,
        log: child?.log ?? lastExit?.log ?? [],
        last_exit: child ? null : lastExit,
      });
      return true;
    }

    // 서비스 지도가 "이 단계에 토큰이 얼마나 드는가"를 보여줄 때 쓴다.
    // 숫자를 화면에 박아 두면 낡으므로 집계 파일을 그대로 읽어 준다.
    if (url.pathname === "/api/usage-summary" && request.method === "GET") {
      const summary = await readJsonOrNull(
        path.join(rootDir, "data/private/usage-summary.json"),
      );
      sendJson(response, 200, summary ?? { operations: [], generated_at: null });
      return true;
    }

    if (url.pathname === "/api/crawl/items" && request.method === "GET") {
      const listing = await readJsonOrNull(listingPath(year));
      if (!listing) {
        sendJson(response, 200, { items: [], collection: null });
        return true;
      }

      // 번역은 파생물이라 수집 정본과 따로 저장한다(AD-2). 화면에 줄 때만
      // 합치고, 아직 안 옮긴 기사는 원문 그대로 내보낸다.
      const korean = await readJsonOrNull(
        path.join(rootDir, "data/private/listing-ko", `${year}.json`),
      );
      const translations = korean?.items ?? {};
      sendJson(response, 200, {
        ...listing,
        translation: korean
          ? {
              translated_at: korean.translated_at,
              count: Object.keys(translations).length,
            }
          : null,
        items: listing.items.map((item) => ({
          ...item,
          title_ko: translations[item.slug]?.title_ko ?? null,
          summary_ko: translations[item.slug]?.summary_ko ?? null,
        })),
      });
      return true;
    }

    if (url.pathname === "/api/crawl/start" && request.method === "POST") {
      const body = await readRequestJson(request);
      const result = start({
        year: Number(body.year) || year,
        limit: body.limit ? Number(body.limit) : null,
        listingOnly: Boolean(body.listingOnly),
      });
      sendJson(response, result.started ? 202 : 409, result);
      return true;
    }

    if (url.pathname === "/api/crawl/stop" && request.method === "POST") {
      const result = stop();
      sendJson(response, result.stopped ? 202 : 409, result);
      return true;
    }

    return false;
  };
}
