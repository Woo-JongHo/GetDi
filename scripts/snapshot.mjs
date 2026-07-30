/**
 * 정적 스냅샷 생성기 — 로컬 결과를 배포 가능한 JSON으로 굽는다.
 *
 * GetDi의 API는 Vite dev 서버 미들웨어다(`vite.config.js`의 configureServer).
 * `vite build` 산출물에는 그것이 없으므로, 배포된 화면이 부를 수 있는 것은
 * 정적 파일뿐이다. 이 스크립트는 `data/private`·`data/processed`에 쌓인
 * 결과를 읽어 **API 응답과 같은 모양**으로 `public/snapshot/`에 쓴다.
 * 프런트는 `src/shared/api.js`가 경로만 바꿔치기하므로 화면 코드는 그대로다.
 *
 * 생성(크롤링·번역·분석·초안)은 여기 없다. 그것들은 모델 CLI와 파일 쓰기가
 * 필요해서 서버리스에서 돌지 않는다 — 로컬에서만 돌리고, 그 결과만 여기로
 * 넘어온다.
 *
 * **일부러 뺀 것**은 manifest의 `excluded`에 남긴다.
 * 조용히 자르면 "전부 담았다"로 읽힌다.
 */

import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, "public/snapshot");
const YEAR = Number(process.env.SNAPSHOT_YEAR || 2026);

/**
 * 모델 로그는 프롬프트 원문과 출력 전문을 품는다. 100건이면 4.2MB인데
 * 그 대부분이 프롬프트다. 디자이너가 "실제로 어떤 프롬프트를 넣었나"를
 * 보는 것은 이 서비스를 공부하는 핵심이므로 최근 것은 통째로 남기고,
 * 나머지는 메타만 남긴다 — 목록과 토큰 수는 100건 전부 보인다.
 */
const FULL_LOG_RUNS = 10;

async function readJsonOrNull(target) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * 절대경로를 저장소 기준 상대경로로 바꾼다.
 *
 * 수집기는 내려받은 이미지의 위치를 절대경로로 적는다
 * (`assets[].local_path`). 그 값은 이 컴퓨터의 홈 디렉터리 이름을 품고 있고,
 * 화면은 그것을 쓰지도 않는데 공개 배포본에 실려 나간다 — 36개 파일에서
 * 실제로 그랬다.
 *
 * 특정 필드만 지우지 않고 전체를 훑는 이유: 경로는 `local_path` 말고도
 * 프롬프트 원문·`prompt_source` 같은 곳에 섞여 들어온다. 필드 이름을
 * 열거하는 방식은 새 필드가 생길 때 조용히 새는데, 값의 모양으로 잡으면
 * 그 구멍이 없다.
 *
 * 지우지 않고 상대경로로 남기는 이유: 어느 파일에서 온 이미지인지는
 * 데이터 구조를 공부하는 사람에게 뜻이 있는 정보다.
 */
function stripAbsolutePaths(text) {
  return text.split(`${rootDir}/`).join("");
}

/** 프롬프트의 대문자 섹션 머리. `REFERENCE IMAGE PROFILES:` 블록의 끝을 찾는 데 쓴다. */
const PROMPT_SECTION = /^[A-Z][A-Z0-9 _/&-]{4,}:$/m;

const REFERENCE_SECTION = "REFERENCE IMAGE PROFILES:";

/**
 * 프롬프트에서 레퍼런스 프로필 분석을 잘라낸다.
 *
 * 초안 생성 프롬프트는 직접 모은 인스타 게시물 18장의 분석을 통째로 품고
 * 들어간다 — 구조·카피 밀도·품질 지적까지 게시물별로 적혀 있다. 레퍼런스
 * 이미지를 공개 배포에서 빼기로 했으므로 그 분석도 빼야 하는데, 이미지
 * 파일만 안 담는 것으로는 프롬프트 경로가 그대로 열려 있었다
 * (`model-logs.json`을 직접 열면 받을 수 있었다).
 *
 * 프롬프트 전체를 버리지 않는 이유: 카드 문구가 어떻게 만들어지는지 보여주는
 * 가장 좋은 자료이고, 그것이 이 저장소를 공부 대상으로 두는 이유다.
 * 잘라낸 자리에 왜 없는지를 남긴다 — 빈 자리는 "원래 안 넣었다"로 읽힌다.
 */
function redactReferenceProfiles(text) {
  const start = text.indexOf(REFERENCE_SECTION);
  if (start < 0) return text;

  const afterHeader = start + REFERENCE_SECTION.length;
  const rest = text.slice(afterHeader);
  const next = rest.match(PROMPT_SECTION);
  const end = next ? afterHeader + next.index : text.length;

  return (
    `${text.slice(0, start)}${REFERENCE_SECTION}\n` +
    "[스냅샷에서 제외 — 직접 모은 인스타 게시물 18장의 분석이라 공개 배포에 담지 않는다.\n" +
    " 로컬에서 실행하면 data/private/references에서 그대로 볼 수 있다.]\n\n" +
    `${text.slice(end)}`
  );
}

/** 문자열 하나에 적용할 정화 전부. 값의 모양으로 잡으므로 새 필드가 생겨도 새지 않는다. */
function sanitizeText(text) {
  return redactReferenceProfiles(stripAbsolutePaths(text));
}

function sanitize(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item)]),
    );
  }
  return value;
}

async function writeJson(relativePath, payload) {
  const target = path.join(outDir, relativePath);
  // 쓰는 자리 한 곳에서 걸러야 새는 곳이 없다 — 호출하는 쪽마다 기억해서
  // 부르게 하면 언젠가 한 곳이 빠진다.
  const safe = sanitize(payload);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(safe)}\n`, "utf8");
  return Buffer.byteLength(JSON.stringify(safe));
}

/** `/api/crawl/items?year=YYYY` — 목록에 번역을 합쳐 준다(server/crawl.mjs와 동일). */
async function buildCrawlItems() {
  const listing = await readJsonOrNull(
    path.join(rootDir, "data/processed/nngroup", String(YEAR), "articles.json"),
  );
  if (!listing) {
    throw new Error(
      `${YEAR}년 목록이 없다. 먼저 \`npm run crawl\`로 수집해야 한다.`,
    );
  }
  const korean = await readJsonOrNull(
    path.join(rootDir, "data/private/listing-ko", `${YEAR}.json`),
  );
  const translations = korean?.items ?? {};
  return {
    listing,
    payload: {
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
    },
  };
}

/**
 * `/api/model-logs` — 최근 것만 원문을 남긴다.
 *
 * 원문을 뺀 건에는 `input_omitted`를 세워 둔다. 화면이 "입력 준비 중"으로
 * 잘못 읽지 않게, 왜 비어 있는지 구별할 수 있어야 한다.
 */
async function buildModelLogs() {
  const logDir = path.join(rootDir, "data/private/model-logs");
  let names = [];
  try {
    names = (await readdir(logDir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { runs: [], fullCount: 0, trimmedCount: 0 };
  }

  const runs = (
    await Promise.all(
      names.map((name) => readJsonOrNull(path.join(logDir, name))),
    )
  )
    .filter(Boolean)
    .sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""))
    .slice(0, 100);

  const trimmed = runs.map((run, index) => {
    if (index < FULL_LOG_RUNS) return run;
    const { input, output, ...meta } = run;
    return {
      ...meta,
      input_omitted: true,
      output_omitted: true,
      omitted_reason: "정적 스냅샷은 최근 실행만 원문을 담는다",
    };
  });

  return {
    runs: trimmed,
    fullCount: Math.min(FULL_LOG_RUNS, runs.length),
    trimmedCount: Math.max(0, runs.length - FULL_LOG_RUNS),
  };
}

/**
 * 원천 데이터가 있는지 본다.
 *
 * `data/private`는 gitignore라 Vercel 빌드 환경에는 없다 — 거기서 다시 구울
 * 수는 없고, 구울 필요도 없다(스냅샷은 커밋되어 함께 clone된다). 그래서
 * 빌드는 `--if-available`로 부르고, 원천이 없으면 이미 커밋된 스냅샷을
 * 확인하는 것으로 갈음한다.
 *
 * 원천도 없고 스냅샷도 없으면 멈춘다. 그대로 빌드하면 화면은 뜨지만 데이터가
 * 하나도 없는 껍데기가 배포된다.
 */
async function verifyCommittedSnapshot() {
  const manifest = await readJsonOrNull(path.join(outDir, "manifest.json"));
  if (!manifest) {
    throw new Error(
      "원천 데이터(data/private)도 커밋된 스냅샷(public/snapshot)도 없다.\n" +
        "로컬에서 `npm run snapshot`을 돌려 스냅샷을 만들고 커밋해야 한다.",
    );
  }
  console.log(
    `커밋된 스냅샷을 쓴다 — ${manifest.generated_at} 기준` +
      ` (본문 ${manifest.counts?.details}건, 분석 ${manifest.counts?.analyses}건)`,
  );
}

/**
 * 다 쓴 뒤 산출물을 되읽어 새어 나간 것이 없는지 본다.
 *
 * `stripAbsolutePaths`를 넣었다는 것과 그것이 실제로 걸렀다는 것은 다른
 * 사실이다. 공개 URL에 올라가는 파일이므로 후자를 확인한다 — 하나라도
 * 걸리면 굽는 것을 실패로 끝내, 새는 스냅샷이 커밋되지 않게 한다.
 */
async function auditOutput() {
  const forbidden = [
    { pattern: /\/Users\/[^/"\s]+/, label: "개인 홈 경로" },
    { pattern: /sk-ant-[A-Za-z0-9-]{8,}/, label: "Anthropic API 키" },
    { pattern: /\bsk-[A-Za-z0-9]{20,}/, label: "OpenAI 형식 API 키" },
    { pattern: /\bghp_[A-Za-z0-9]{20,}/, label: "GitHub 토큰" },
    { pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/, label: "Bearer 토큰" },
    // 레퍼런스 프로필은 manifest에서 제외를 선언한 자료다. 선언과 산출물이
    // 어긋나면 선언이 거짓이 된다 — 이 필드 이름들이 그 자료의 지문이다.
    // 프롬프트를 통해 실제로 새어 나간 적이 있어서 검사에 넣었다.
    //
    // `visual_system`은 넣지 않는다: 우리 초안 산출물도 같은 이름의 필드를
    // 쓴다(`revisions[].visual_system` — 카드 디자인 시스템 서술). 지문이
    // 아니라 겹치는 이름이라 오탐만 낸다. 아래 셋은 레퍼런스 프로필에만 있다.
    { pattern: /"narrative_sequence"/, label: "레퍼런스 프로필 분석" },
    { pattern: /"copy_density"/, label: "레퍼런스 프로필 분석" },
    { pattern: /"quality_findings"/, label: "레퍼런스 프로필 분석" },
  ];

  const found = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
        continue;
      }
      const text = await readFile(target, "utf8");
      for (const { pattern, label } of forbidden) {
        const hit = text.match(pattern);
        if (hit) {
          found.push(
            `${path.relative(outDir, target)} — ${label}: ${hit[0].slice(0, 60)}`,
          );
        }
      }
    }
  }
  await walk(outDir);

  if (found.length) {
    throw new Error(
      `스냅샷에 공개하면 안 되는 값이 ${found.length}건 남았다:\n  ` +
        `${found.slice(0, 10).join("\n  ")}`,
    );
  }
  console.log(
    "  공개 금지 값 검사 통과 (홈 경로·API 키·토큰·레퍼런스 프로필)",
  );
}

async function main() {
  const ifAvailable = process.argv.includes("--if-available");
  // 원천의 판별 기준은 `data/private`다. `data/processed`(목록)는 커밋되므로
  // Vercel에도 있고, 그것으로 판별하면 본문이 0건인 스냅샷을 다시 구워
  // 커밋된 것을 덮어쓴다.
  let sourceExists = true;
  try {
    await readdir(path.join(rootDir, "data/private/details/articles"));
  } catch {
    sourceExists = false;
  }
  if (ifAvailable && !sourceExists) {
    await verifyCommittedSnapshot();
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const { listing, payload: crawlItems } = await buildCrawlItems();
  const slugs = listing.items.map((item) => item.slug);
  let bytes = await writeJson(`crawl-items-${YEAR}.json`, crawlItems);

  const counts = { details: 0, analyses: 0, drafts: 0, translations: 0 };
  const missing = { details: [], analyses: [], drafts: [], translations: [] };

  for (const slug of slugs) {
    const detail = await readJsonOrNull(
      path.join(rootDir, "data/private/details/articles", `${slug}.json`),
    );
    if (detail) {
      bytes += await writeJson(`details/${slug}.json`, detail);
      counts.details += 1;
    } else {
      missing.details.push(slug);
    }

    for (const [kind, sourceDir] of [
      ["analyses", "data/private/analyses"],
      ["drafts", "data/private/drafts"],
      ["translations", "data/private/translations"],
    ]) {
      const document = await readJsonOrNull(
        path.join(rootDir, sourceDir, `${slug}.json`),
      );
      if (document) {
        bytes += await writeJson(`${kind}/${slug}.json`, document);
        counts[kind] += 1;
      } else {
        missing[kind].push(slug);
      }
    }
  }

  // `/api/details` — 무엇이 수집됐는지의 색인. 스냅샷에 실제로 담은 것만
  // 넣는다. 담지 않은 것을 색인하면 카드 리스트가 "준비됨"이라 표시한 뒤
  // 열었을 때 404가 난다.
  bytes += await writeJson("details-index.json", {
    count: counts.details,
    items: slugs
      .filter((slug) => !missing.details.includes(slug))
      .map((slug) => ({ slug, format: "article" })),
  });

  // `/api/crawl/state` — 수집기가 마지막으로 남긴 상태. 단 `details_available`는
  // 마지막 실행이 목록 전용이었던 탓에 0으로 남아 있어, 진행률이 0%로 보인다.
  // 그 값의 뜻은 "수집된 본문이 몇 건인가"이고 그것은 실측 가능하므로
  // 스냅샷 실측치로 정정한다. 정정 사실은 manifest에 남긴다.
  const rawState = await readJsonOrNull(
    path.join(rootDir, "data/state", `crawl-${YEAR}.json`),
  );
  bytes += await writeJson(`crawl-state-${YEAR}.json`, {
    running: false,
    external_running: false,
    state: rawState
      ? {
          ...rawState,
          details_available: counts.details,
          current: null,
          next_request_at: null,
        }
      : null,
    log: [],
    last_exit: null,
    snapshot: true,
  });

  const usageSummary = await readJsonOrNull(
    path.join(rootDir, "data/private/usage-summary.json"),
  );
  bytes += await writeJson(
    "usage-summary.json",
    usageSummary ?? { operations: [], generated_at: null },
  );

  const logs = await buildModelLogs();
  bytes += await writeJson("model-logs.json", { runs: logs.runs });

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    year: YEAR,
    read_only: true,
    counts: {
      ...counts,
      listing_items: slugs.length,
      model_log_runs: logs.runs.length,
      model_log_runs_with_prompt: logs.fullCount,
    },
    missing,
    excluded: [
      {
        what: "레퍼런스 이미지 18장과 그 분석 (/api/references, /api/reference-analysis)",
        why: "직접 수집한 남의 인스타 게시물이라 공개 배포에 담지 않는다",
      },
      {
        what: "모델 프롬프트 안의 REFERENCE IMAGE PROFILES 블록",
        why:
          "초안 생성 프롬프트가 그 분석을 통째로 품고 들어간다." +
          " 이미지 파일만 빼면 이 경로로 그대로 새어 나간다",
      },
      {
        what: "세션 사용량 (/api/session-usage)",
        why: "로컬 Claude Code 세션 파일을 읽는 화면이라 정적 배포에서 뜻이 없다",
      },
      {
        what: `모델 로그 ${logs.trimmedCount}건의 프롬프트·출력 원문`,
        why: `용량 때문에 최근 ${FULL_LOG_RUNS}건만 원문을 담는다. 목록과 토큰 수는 전부 있다`,
      },
      {
        what: "2026년 외 기사와 영상 상세",
        why: "이 배포의 대상은 2026년 기사다. 로컬에는 남아 있다",
      },
    ],
    corrections: [
      {
        field: `crawl-state-${YEAR}.json → state.details_available`,
        from: rawState?.details_available ?? null,
        to: counts.details,
        why: "마지막 수집이 목록 전용이라 0으로 남았다. 실제 본문 건수로 정정",
      },
    ],
  };
  bytes += await writeJson("manifest.json", manifest);

  await auditOutput();

  const megabytes = (bytes / 1024 / 1024).toFixed(2);
  console.log(`스냅샷 ${outDir}`);
  console.log(
    `  목록 ${slugs.length}건 · 본문 ${counts.details} · 분석 ${counts.analyses}` +
      ` · 초안 ${counts.drafts} · 번역 ${counts.translations}`,
  );
  console.log(
    `  모델 로그 ${logs.runs.length}건 (원문 ${logs.fullCount}건, 메타만 ${logs.trimmedCount}건)`,
  );
  console.log(`  합계 ${megabytes} MB`);

  // 초안·번역이 없는 것은 결함이 아니라 아직 만들지 않은 것이다 — 건수로만
  // 센다. 본문이 없는 것은 다르다: 목록에는 있는데 수집이 안 된 상태이므로
  // 어느 기사인지 이름을 밝힌다.
  if (missing.details.length) {
    console.log(
      `\n본문 미수집 ${missing.details.length}건: ${missing.details.join(", ")}`,
    );
    console.log(
      "카드 리스트에서 '미수집'으로 보인다. `npm run crawl` 후 다시 굽는다.",
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
