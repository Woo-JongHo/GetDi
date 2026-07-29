/**
 * 수집 배치 실행기.
 *
 * NN/g는 robots.txt에서 요청 간격 60초를 요구한다. 기사 100건이면
 * 한 시간 반짜리 작업이 된다는 뜻이다. 그래서 이 파일의 절반은
 * "어디까지 했는지"를 남기는 데 쓴다 — 중단되어도 같은 자리에서
 * 다시 시작할 수 있어야 하고, 화면이 진행 상황을 읽을 수 있어야 한다.
 *
 * 실행:
 *   node crawler/run.mjs                 # 목록 + 상세 전부
 *   node crawler/run.mjs --limit 2       # 상세를 2건만 (시험용)
 *   node crawler/run.mjs --listing-only  # 목록만
 *   node crawler/run.mjs --year 2025     # 다른 연도
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadAsset, bodyImages } from "./assets.mjs";
import { parseDetail } from "./detail.mjs";
import { listingPageUrl, parseListing } from "./listing.mjs";
import { resolveCrawlDelay, USER_AGENT } from "./robots.mjs";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 대상 연도 항목이 하나도 없는 페이지가 이만큼 연속되면 목록 수집을 끝낸다. */
const EMPTY_PAGE_STOP = 2;
/** 페이지네이션 표시를 믿지 않기 위한 상한. */
const MAX_LISTING_PAGES = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeAtomicJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function writeAtomicText(target, text) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, target);
}

async function readJsonOrNull(target) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function fileExists(target) {
  try {
    await readFile(target);
    return true;
  } catch {
    return false;
  }
}

export function createCrawler({
  rootDir = ROOT_DIR,
  year = 2026,
  onProgress = () => {},
} = {}) {
  const paths = {
    listing: path.join(rootDir, "data/processed/nngroup", String(year), "articles.json"),
    state: path.join(rootDir, "data/state", `crawl-${year}.json`),
    detailDir: path.join(rootDir, "data/private/details/articles"),
    rawDir: path.join(rootDir, "data/private/raw-details/articles"),
    assetDir: path.join(rootDir, "data/private/assets"),
  };

  let state = {
    year,
    status: "idle",
    phase: null,
    crawl_delay_seconds: null,
    crawl_delay_source: null,
    listing_pages_fetched: 0,
    total_items: 0,
    details_available: 0,
    collected_this_run: 0,
    failed_this_run: 0,
    assets_downloaded_this_run: 0,
    current: null,
    next_request_at: null,
    failures: [],
    asset_failures: [],
    last_request_epoch: null,
    updated_at: null,
  };

  async function saveState(patch = {}) {
    state = { ...state, ...patch, updated_at: new Date().toISOString() };
    await writeAtomicJson(paths.state, state);
    onProgress(state);
    return state;
  }

  /**
   * robots.txt가 요구한 간격만큼 기다린 뒤 요청한다.
   * 기다리는 동안에도 state를 갱신해 화면이 남은 시간을 보여줄 수 있게 한다.
   */
  async function fetchPolitely(url, delaySeconds) {
    if (state.last_request_epoch !== null) {
      const readyAt = state.last_request_epoch + delaySeconds * 1000;
      const waitMs = readyAt - Date.now();
      if (waitMs > 0) {
        await saveState({ next_request_at: new Date(readyAt).toISOString() });
        await sleep(waitMs);
      }
    }
    await saveState({
      last_request_epoch: Date.now(),
      next_request_at: null,
    });

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`응답 ${response.status}`);
    return response.text();
  }

  /**
   * 목록 페이지를 훑어 대상 연도의 기사만 모은다.
   *
   * 페이지 1에는 최신 목록 뒤에 인기글이 섞여 오래된 기사가 함께 나온다.
   * 연도로 거르면 그것들은 자연히 빠지므로 별도 처리를 두지 않았다.
   */
  async function collectListing(delaySeconds) {
    const bySlug = new Map();
    let emptyStreak = 0;
    let page = 1;

    await saveState({ status: "running", phase: "listing" });

    while (page <= MAX_LISTING_PAGES && emptyStreak < EMPTY_PAGE_STOP) {
      const url = listingPageUrl(page);
      await saveState({
        current: { kind: "listing", page, url },
        listing_pages_fetched: page - 1,
      });

      const { items } = parseListing(await fetchPolitely(url, delaySeconds), url);
      const matched = items.filter(
        (item) =>
          item.format === "article" &&
          item.published_date?.startsWith(`${year}-`),
      );

      let added = 0;
      for (const item of matched) {
        if (bySlug.has(item.slug)) continue;
        bySlug.set(item.slug, item);
        added += 1;
      }

      emptyStreak = added === 0 ? emptyStreak + 1 : 0;
      await saveState({
        listing_pages_fetched: page,
        total_items: bySlug.size,
      });
      page += 1;
    }

    const collected = [...bySlug.values()].sort((a, b) =>
      a.published_date < b.published_date ? 1 : -1,
    );
    await writeAtomicJson(paths.listing, {
      schema_version: 1,
      source: { name: "Nielsen Norman Group", url: "https://www.nngroup.com" },
      selection: { year, format: "article" },
      collection: {
        retrieved_at: new Date().toISOString(),
        item_count: collected.length,
        pages_fetched: state.listing_pages_fetched,
      },
      items: collected,
    });
    return collected;
  }

  /** 이미 상세를 받아 둔 기사는 건너뛴다 — 재개의 핵심이다. */
  async function pendingItems(items) {
    const pending = [];
    for (const item of items) {
      const target = path.join(paths.detailDir, `${item.slug}.json`);
      if (!(await fileExists(target))) pending.push(item);
    }
    return pending;
  }

  async function collectDetail(item, delaySeconds) {
    const html = await fetchPolitely(item.url, delaySeconds);
    const detail = parseDetail(html, item.url);
    await writeAtomicText(path.join(paths.rawDir, `${item.slug}.html`), html);

    const images = bodyImages(detail.content_html);
    const assets = [];
    const failures = [];
    for (const [index, image] of images.entries()) {
      try {
        assets.push(
          await downloadAsset(image, {
            assetDir: paths.assetDir,
            format: detail.format,
            slug: item.slug,
            index: index + 1,
          }),
        );
      } catch (error) {
        failures.push({ url: image.source_url, error: error.message });
      }
    }

    detail.assets = assets;
    detail.asset_failures = failures;
    await writeAtomicJson(
      path.join(paths.detailDir, `${item.slug}.json`),
      detail,
    );
    return { assets: assets.length, failures };
  }

  async function collectDetails(items, { limit = null } = {}) {
    const delaySeconds = state.crawl_delay_seconds;
    let queue = await pendingItems(items);
    if (limit !== null) queue = queue.slice(0, Math.max(0, limit));

    await saveState({
      status: "running",
      phase: "details",
      total_items: items.length,
      details_available: items.length - queue.length,
    });

    for (const [index, item] of queue.entries()) {
      await saveState({
        current: {
          kind: "detail",
          queue_index: index + 1,
          queue_total: queue.length,
          slug: item.slug,
          title: item.title,
          url: item.url,
        },
      });
      try {
        const result = await collectDetail(item, delaySeconds);
        await saveState({
          collected_this_run: state.collected_this_run + 1,
          details_available: state.details_available + 1,
          assets_downloaded_this_run:
            state.assets_downloaded_this_run + result.assets,
          asset_failures: [...state.asset_failures, ...result.failures],
        });
      } catch (error) {
        await saveState({
          failed_this_run: state.failed_this_run + 1,
          failures: [
            ...state.failures,
            { slug: item.slug, url: item.url, error: error.message },
          ],
        });
      }
    }

    return state;
  }

  async function run({ limit = null, listingOnly = false } = {}) {
    const previous = await readJsonOrNull(paths.state);
    const delay = await resolveCrawlDelay();
    await saveState({
      // 재개 시에도 직전 요청 시각을 이어받아 간격을 지킨다.
      last_request_epoch: previous?.last_request_epoch ?? null,
      crawl_delay_seconds: delay.seconds,
      crawl_delay_source: delay.source,
      status: "running",
      failures: [],
      asset_failures: [],
      collected_this_run: 0,
      failed_this_run: 0,
      assets_downloaded_this_run: 0,
    });

    const existing = await readJsonOrNull(paths.listing);
    const items = existing?.items?.length
      ? existing.items
      : await collectListing(delay.seconds);

    if (listingOnly) {
      return saveState({
        status: "complete",
        phase: "listing",
        current: null,
        total_items: items.length,
      });
    }

    await collectDetails(items, { limit });
    const remaining = await pendingItems(items);
    return saveState({
      status: remaining.length ? "partial" : "complete",
      phase: "details",
      current: null,
    });
  }

  return { collectDetails, collectListing, paths, run, get state() { return state; } };
}

function parseArguments(argv) {
  const options = { limit: null, listingOnly: false, year: 2026 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--limit") options.limit = Number(argv[++index]);
    else if (flag === "--year") options.year = Number(argv[++index]);
    else if (flag === "--listing-only") options.listingOnly = true;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  const crawler = createCrawler({
    year: options.year,
    onProgress(current) {
      if (current.phase === "listing" && current.current?.page) {
        console.log(
          `목록 ${current.current.page}페이지 — 지금까지 ${current.total_items}건`,
        );
      } else if (current.current?.slug) {
        console.log(
          `[${current.current.queue_index}/${current.current.queue_total}] ${current.current.slug}`,
        );
      }
    },
  });
  const final = await crawler.run(options);
  console.log(
    `\n${final.status} — 수집 ${final.collected_this_run}건, 실패 ${final.failed_this_run}건, ` +
      `이미지 ${final.assets_downloaded_this_run}장 (간격 ${final.crawl_delay_seconds}초 · ${final.crawl_delay_source})`,
  );
  process.exit(final.status === "complete" ? 0 : 2);
}
