/**
 * API 한 겹 — 로컬에서는 dev 서버로, 배포본에서는 정적 스냅샷으로 보낸다.
 *
 * GetDi의 API는 Vite dev 서버 미들웨어라 `vite build` 산출물에는 없다.
 * 그래서 배포본에서 `/api/...`를 부르면 전부 실패한다. 화면 코드 스무 곳을
 * 각자 분기시키는 대신, 여기서 경로만 바꿔치기한다 — 호출하는 쪽은
 * `fetch`를 `apiFetch`로 바꾼 것 말고는 달라지지 않는다.
 *
 * 판정 기준은 `import.meta.env.PROD`다. 이것이 참인 것과 API가 없는 것은
 * 같은 사실의 두 표현이다(미들웨어는 dev에만 붙는다). 별도 플래그를 두면
 * 두 값이 갈라질 수 있고, 갈라지면 배포본이 조용히 404를 낸다.
 *
 * 쓰기는 흉내내지 않는다. 정적 배포에서 분석·초안·수집은 애초에 불가능하고
 * (모델 CLI와 파일 쓰기가 필요하다), 되는 척하면 사용자가 눌러 보고 나서야
 * 안 된다는 것을 알게 된다. 그래서 즉시 이유를 담아 거절한다.
 */

/** 배포본은 읽기 전용이다. 로컬 dev에서는 거짓이라 아래 분기가 전부 꺼진다. */
export const READ_ONLY = import.meta.env.PROD;

const SNAPSHOT_ROOT = "/snapshot";

const WRITE_REFUSAL =
  "배포본은 읽기 전용입니다. 수집·번역·분석·초안 생성은 로컬에서만 돌아갑니다.";

const UNSUPPORTED_REFUSAL =
  "이 자료는 배포본에 담지 않았습니다. 로컬에서 실행하면 볼 수 있습니다.";

/** dev 서버와 같은 모양의 JSON 응답을 만들어 준다. */
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SLUG = "([a-z0-9-]+)";

/**
 * `/api/...` 를 스냅샷 파일 경로로 옮긴다. 옮길 곳이 없으면 null이고,
 * 그때는 "담지 않았다"로 거절한다 — 담았는데 못 찾은 것과 구별해야 한다.
 */
function snapshotPath(pathname, params) {
  if (pathname === "/api/crawl/items") {
    return `${SNAPSHOT_ROOT}/crawl-items-${params.get("year") || 2026}.json`;
  }
  if (pathname === "/api/crawl/state") {
    return `${SNAPSHOT_ROOT}/crawl-state-${params.get("year") || 2026}.json`;
  }
  if (pathname === "/api/details") return `${SNAPSHOT_ROOT}/details-index.json`;
  if (pathname === "/api/usage-summary") {
    return `${SNAPSHOT_ROOT}/usage-summary.json`;
  }
  if (pathname === "/api/model-logs") return `${SNAPSHOT_ROOT}/model-logs.json`;

  // 상세는 format이 경로에 있을 수도 없을 수도 있다(server/details.mjs와 동일).
  // 스냅샷에는 기사만 있으므로 어느 쪽이든 같은 파일로 보낸다.
  const detail = pathname.match(
    new RegExp(`^/api/details/(?:(?:article|video)/)?${SLUG}$`),
  );
  if (detail) return `${SNAPSHOT_ROOT}/details/${detail[1]}.json`;

  for (const [prefix, folder] of [
    ["analyses", "analyses"],
    ["drafts", "drafts"],
    ["translations", "translations"],
  ]) {
    const match = pathname.match(new RegExp(`^/api/${prefix}/${SLUG}$`));
    if (match) return `${SNAPSHOT_ROOT}/${folder}/${match[1]}.json`;
  }

  return null;
}

/**
 * 스냅샷에 파일이 없을 때의 본문. dev 서버가 그 경로에서 무엇을 돌려주는지에
 * 맞춘다 — 화면들이 이미 그 모양을 보고 분기하고 있다.
 */
function notFoundBody(pathname) {
  if (pathname.startsWith("/api/details/")) return { status: "not_collected" };
  if (pathname.startsWith("/api/analyses/")) {
    return { error: "아직 분석하지 않은 기사입니다." };
  }
  if (pathname.startsWith("/api/drafts/")) {
    return { error: "아직 초안을 만들지 않은 기사입니다." };
  }
  if (pathname.startsWith("/api/translations/")) {
    return { error: "아직 번역하지 않은 기사입니다." };
  }
  return { error: "찾지 못했습니다." };
}

/**
 * `fetch`와 같은 자리에 넣는다. 로컬에서는 그대로 통과시키므로
 * dev 동작은 이 파일이 없던 때와 같다.
 */
export async function apiFetch(input, init) {
  if (!READ_ONLY) return fetch(input, init);

  const url = new URL(String(input), window.location.origin);
  const method = (init?.method || "GET").toUpperCase();

  if (method !== "GET") {
    return jsonResponse(405, { error: WRITE_REFUSAL, read_only: true });
  }

  const target = snapshotPath(url.pathname, url.searchParams);
  if (!target) {
    return jsonResponse(501, { error: UNSUPPORTED_REFUSAL, read_only: true });
  }

  // 없는 파일에 호스트가 무엇을 주는지는 호스트마다 다르다. Vercel은 404를
  // 주지만 `vite preview`는 SPA fallback 때문에 **200 text/html**을 준다 —
  // 상태 코드만 보면 그 HTML을 성공으로 착각하고, 호출하는 쪽의
  // `response.json()`이 파싱 오류로 터진다. 그래서 상태와 함께 실제로 JSON이
  // 왔는지도 본다. 스냅샷에 없는 것은 "아직 안 만든 기사"이고 그것은
  // 정상 흐름이므로 dev 서버와 같은 404 JSON으로 바꿔 돌려준다.
  let response;
  try {
    response = await fetch(target, { cache: init?.cache });
  } catch {
    return jsonResponse(503, { error: "스냅샷을 불러오지 못했습니다." });
  }
  const isJson = (response.headers.get("Content-Type") || "").includes("json");
  if (!response.ok || !isJson) {
    return jsonResponse(response.ok ? 404 : response.status, {
      ...notFoundBody(url.pathname),
      read_only: true,
    });
  }
  return response;
}

/**
 * 스냅샷을 언제 구웠고 무엇을 뺐는지. 읽기 전용 안내에 쓴다.
 * 로컬에서는 스냅샷이 없을 수 있으므로 null을 돌려준다.
 */
export async function loadSnapshotManifest() {
  if (!READ_ONLY) return null;
  try {
    const response = await fetch(`${SNAPSHOT_ROOT}/manifest.json`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
