/**
 * NN/g의 robots.txt에서 요청 간격(Crawl-Delay)을 읽는다.
 *
 * 간격을 코드에 상수로 박지 않는 이유: NN/g가 값을 올렸을 때
 * 우리 코드가 그것을 모른 채 조용히 규칙을 어기게 된다.
 * 읽지 못하면 60초로 물러선다 — 모르면 더 느리게 가는 쪽이 안전하다.
 */

export const FALLBACK_DELAY_SECONDS = 60;
/**
 * robots가 간격 제한을 두지 않더라도(0초) 우리는 그 권한을 다 쓰지 않는다.
 * 개인 연구용 캐시가 남의 서버를 초당 여러 번 때릴 이유가 없다.
 */
export const MINIMUM_DELAY_SECONDS = 1;
export const ROBOTS_URL = "https://www.nngroup.com/robots.txt";
export const USER_AGENT = "GetDi/0.1 (+local personal research cache)";

/**
 * robots.txt 본문에서 `User-agent: *` 그룹의 Crawl-Delay를 찾는다.
 *
 * 그룹은 User-agent 줄 하나가 아니라 **연속된 User-agent 줄의 묶음**이다.
 *
 *   User-agent: *
 *   User-agent: ExampleBot
 *   Crawl-Delay: 12
 *
 * 이 셋은 한 그룹이고 12초는 `*`에도 적용된다. User-agent 줄마다 그룹이
 * 바뀐다고 보면 이 경우를 놓친다. 새 그룹은 규칙 줄이 한 번 나온 뒤에
 * 다시 User-agent가 등장할 때 시작된다.
 *
 * 값을 못 읽으면 null을 돌려준다 — 0초와 "확인 못 함"은 다른 사실이므로
 * 0은 0으로 보고한다. 어떻게 대응할지는 resolveCrawlDelay가 정한다.
 */
export function parseCrawlDelay(robotsText) {
  let agents = [];
  let seenRule = false;
  let found = null;

  for (const rawLine of robotsText.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (seenRule) {
        agents = [];
        seenRule = false;
      }
      agents.push(value);
      continue;
    }

    seenRule = true;
    if (field === "crawl-delay" && agents.includes("*")) {
      // Number("")는 0이므로 빈 값을 먼저 걸러야 한다.
      const seconds = value === "" ? Number.NaN : Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) found = seconds;
    }
  }
  return found;
}

/**
 * 실제 robots.txt를 읽어 간격을 정한다.
 * 반환값의 source로 그 값이 실측인지 fallback인지 구분한다 —
 * "확인 못 함"과 "확인했더니 60초"는 다른 사실이다.
 */
export async function resolveCrawlDelay(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(ROBOTS_URL, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      return {
        seconds: FALLBACK_DELAY_SECONDS,
        source: "fallback",
        reason: `robots.txt 응답 ${response.status}`,
      };
    }
    const delay = parseCrawlDelay(await response.text());
    if (delay === null) {
      return {
        seconds: FALLBACK_DELAY_SECONDS,
        source: "fallback",
        reason: "robots.txt에 User-agent: * 의 Crawl-Delay가 없다",
      };
    }
    return {
      seconds: Math.max(delay, MINIMUM_DELAY_SECONDS),
      source: "robots",
      reason:
        delay < MINIMUM_DELAY_SECONDS
          ? `robots가 ${delay}초를 허용하지만 ${MINIMUM_DELAY_SECONDS}초로 늦춘다`
          : null,
    };
  } catch (error) {
    return {
      seconds: FALLBACK_DELAY_SECONDS,
      source: "fallback",
      reason: `robots.txt를 읽지 못했다: ${error.message}`,
    };
  }
}
