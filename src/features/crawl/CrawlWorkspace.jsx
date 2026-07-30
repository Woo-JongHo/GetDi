import React, { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  Check,
  Download,
  Hourglass,
  Play,
  Square,
} from "lucide-react";

import { apiFetch, READ_ONLY } from "../../shared/api.js";

import { Drawer } from "../../shared/Drawer.jsx";

import { ReadOnlyNotice } from "../../shared/ReadOnlyNotice.jsx";

import { ModelLogs } from "../usage/ModelLogs.jsx";

import { UsageDashboard } from "../usage/UsageDashboard.jsx";

const POLL_INTERVAL_MS = 2000;
const YEAR = 2026;

/**
 * 화면 1 — 크롤링.
 *
 * 수집은 요청 사이 60초를 지켜야 해서 몇 시간이 걸린다. 그래서 이 화면의
 * 목적은 "시작 버튼"이 아니라 "지금 무엇을 하고 있고 얼마나 남았는가"다.
 * 상태는 서버가 파일에 적고 이 화면이 2초마다 읽는다 — 브라우저를 닫아도
 * 수집은 계속되고, 다시 열면 진행 중인 지점이 그대로 보인다.
 */
function CrawlWorkspace() {
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await apiFetch(`/api/crawl/state?year=${YEAR}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setSnapshot(payload);
      } catch {
        // 개발 서버가 재시작하는 동안에는 마지막 상태를 그대로 둔다.
      }
    };
    refresh();
    // 배포본에서 상태는 스냅샷 파일이라 변하지 않는다. 2초마다 다시 읽는 것은
    // 같은 답을 받으려고 요청을 쌓는 일이므로 한 번만 읽는다.
    if (READ_ONLY) {
      return () => {
        cancelled = true;
      };
    }
    const poll = window.setInterval(refresh, POLL_INTERVAL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const state = snapshot?.state ?? null;
  // 터미널에서 직접 돌린 수집도 "돌고 있음"이다. 다만 그것은 이 화면이
  // 중지시킬 수 없으므로 구분해 둔다.
  const external = Boolean(snapshot?.external_running);
  const running = Boolean(snapshot?.running) || external;

  const secondsUntilNext = useMemo(() => {
    if (!state?.next_request_at) return null;
    const remaining = Math.ceil(
      (new Date(state.next_request_at).getTime() - now) / 1000,
    );
    return remaining > 0 ? remaining : 0;
  }, [now, state?.next_request_at]);

  async function post(endpoint, body) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await response.json();
      if (!response.ok) setNotice(payload.reason || "요청이 거절되었습니다.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  const progress = state?.total_items
    ? Math.round((state.details_available / state.total_items) * 100)
    : 0;

  return (
    <main className="crawl-layout">
      <div className="eyebrow">
        <span>STEP 01</span>
        <span className="eyebrow-rule" />
        <span>Nielsen Norman Group · {YEAR}년 기사</span>
      </div>

      <div className="crawl-intro">
        <div>
          <h1>크롤링</h1>
          <p className="crawl-lede">
            NN/g에서 {YEAR}년에 나온 기사를 가져온다. 사이트가 요청 사이
            {" "}
            {state?.crawl_delay_seconds ?? 60}초를 쉬라고 정해 두었기 때문에
            시간이 오래 걸린다. 창을 닫아도 수집은 계속되고, 중간에 멈춰도
            다음에 이어서 받는다.
          </p>
        </div>

        <div className="crawl-actions">
          <button
            type="button"
            className="primary-button"
            disabled={READ_ONLY || busy || running}
            onClick={() => post("/api/crawl/start", { year: YEAR })}
          >
            <Play size={16} /> 수집 시작
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={READ_ONLY || busy || !running || external}
            onClick={() => post("/api/crawl/stop")}
          >
            <Square size={15} /> 중지
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={READ_ONLY || busy || running}
            onClick={() =>
              post("/api/crawl/start", { year: YEAR, listingOnly: true })
            }
          >
            목록만 새로 받기
          </button>
        </div>
      </div>

      <ReadOnlyNotice what="수집" />

      {notice && <p className="crawl-notice">{notice}</p>}

      {external && (
        <p className="crawl-notice">
          터미널에서 시작한 수집이 돌고 있다. 진행 상황은 아래에 그대로
          보이지만, 멈추려면 그 터미널에서 Control + C를 누른다.
        </p>
      )}

      <section className="crawl-status">
        <StatusBadge running={running} state={state} />
        <div className="crawl-progress">
          <div className="crawl-progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="crawl-progress-label">
            본문 {state?.details_available ?? 0} / {state?.total_items ?? 0}건
            {state?.total_items ? ` (${progress}%)` : ""}
          </span>
        </div>
      </section>

      <section className="crawl-metrics">
        <Metric label="목록에 잡힌 기사" value={state?.total_items ?? 0} />
        <Metric label="본문 준비됨" value={state?.details_available ?? 0} />
        <Metric
          label="이번 실행 수집"
          value={state?.collected_this_run ?? 0}
          icon={Download}
        />
        <Metric
          label="이번 실행 실패"
          value={state?.failed_this_run ?? 0}
          tone={state?.failed_this_run ? "warn" : null}
          icon={AlertTriangle}
        />
        <Metric
          label="내려받은 이미지"
          value={state?.assets_downloaded_this_run ?? 0}
        />
      </section>

      <section className="crawl-current">
        <h2>지금 하는 일</h2>
        {running && state?.current ? (
          <CurrentWork current={state.current} seconds={secondsUntilNext} />
        ) : (
          <p className="crawl-idle">
            {state?.status === "complete"
              ? "수집이 끝났다. 다음 단계인 카드 리스트로 넘어가면 된다."
              : "수집이 돌고 있지 않다. 위의 수집 시작을 누르면 된다."}
          </p>
        )}
      </section>

      {state?.crawl_delay_source === "fallback" && (
        <p className="crawl-notice">
          robots.txt에서 요청 간격을 읽지 못해 60초로 진행한다.
        </p>
      )}

      <FailureList
        assetFailures={state?.asset_failures ?? []}
        failures={state?.failures ?? []}
      />

      <section className="crawl-log">
        <h2>실행 기록</h2>
        <pre>
          {(snapshot?.log ?? []).slice(-40).join("\n") ||
            "아직 기록이 없다."}
        </pre>
      </section>

      {/* 모델 사용량과 실행 로그는 별도 메뉴로 두지 않는다. 평소에는 접혀 있고
          궁금할 때만 편다 — 작업 단계가 아니라 참고 정보이기 때문이다. */}
      {/* 세션 사용량은 "지금 돌고 있는 이 세션"이 전제다. 배포본에는 그 세션이
          없으므로 서랍째 감춘다 — 열면 빈 것보다 없는 것이 정직하다.
          작업별 누적 토큰은 구조 화면(#/map)이 스냅샷에서 읽어 보여준다. */}
      {!READ_ONLY && (
        <Drawer label="AI를 얼마나 썼는지 보기">
          <UsageDashboard />
        </Drawer>
      )}
      <Drawer label="모델이 주고받은 내용 보기">
        <ModelLogs />
      </Drawer>
    </main>
  );
}

function StatusBadge({ running, state }) {
  if (running) {
    return (
      <span className="crawl-badge is-running">
        <Hourglass size={14} /> 수집 중
        {state?.phase === "listing" ? " · 목록" : " · 본문"}
      </span>
    );
  }
  if (state?.status === "complete") {
    return (
      <span className="crawl-badge is-done">
        <Check size={14} /> 수집 완료
      </span>
    );
  }
  if (state?.status === "partial") {
    return (
      <span className="crawl-badge is-partial">
        <AlertTriangle size={14} /> 일부만 수집됨 — 다시 시작하면 이어받는다
      </span>
    );
  }
  return <span className="crawl-badge">대기 중</span>;
}

function CurrentWork({ current, seconds }) {
  return (
    <div className="crawl-current-card">
      {current.kind === "listing" ? (
        <p>
          목록 {current.page}페이지를 읽는 중
        </p>
      ) : (
        <>
          <p className="crawl-current-title">{current.title || current.slug}</p>
          <p className="crawl-current-meta">
            {current.queue_index} / {current.queue_total}번째 · {current.slug}
          </p>
        </>
      )}
      {seconds !== null && seconds > 0 && (
        <p className="crawl-countdown">
          <Hourglass size={13} /> 다음 요청까지 {seconds}초 기다리는 중
        </p>
      )}
    </div>
  );
}

function FailureList({ assetFailures, failures }) {
  if (!failures.length && !assetFailures.length) return null;
  return (
    <section className="crawl-failures">
      <h2>실패한 것</h2>
      {failures.length > 0 && (
        <ul>
          {failures.map((failure) => (
            <li key={failure.slug}>
              <strong>{failure.slug}</strong> — {failure.error}
            </li>
          ))}
        </ul>
      )}
      {assetFailures.length > 0 && (
        <p className="crawl-failure-note">
          이미지 {assetFailures.length}장을 받지 못했다. 본문은 저장되었고
          해당 이미지 자리만 비어 있다.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, icon: Icon, tone }) {
  return (
    <div className={`crawl-metric ${tone === "warn" ? "is-warn" : ""}`}>
      <span className="crawl-metric-value">
        {Icon && <Icon size={15} />}
        {value}
      </span>
      <span className="crawl-metric-label">{label}</span>
    </div>
  );
}

export { CrawlWorkspace };
