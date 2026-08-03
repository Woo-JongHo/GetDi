import React, { useEffect, useState } from "react";

import { Activity, Check, FileText, X } from "lucide-react";

import { apiFetch, READ_ONLY } from "../../shared/api.js";

import { uncachedInputTokens } from "../../shared/format.js";

function modelLogTokens(run) {
  if (run?.tokens) {
    return {
      input: run.tokens.input == null ? null : Math.max(0, run.tokens.input - (run.tokens.cached_input || 0)),
      cached: run.tokens.cached_input,
      output: run.tokens.output,
    };
  }
  if (run?.usage?.input_tokens != null) {
    return {
      input: uncachedInputTokens(run.usage),
      cached: run.usage.cached_input_tokens || 0,
      output: run.usage.output_tokens || 0,
    };
  }
  return Object.values(run?.usage?.models || {}).reduce(
    (totals, usage) => ({
      input:
        totals.input +
        Math.max(
          0,
          (usage.inputTokens || 0) - (usage.cacheReadInputTokens || 0),
        ),
      cached: totals.cached + (usage.cacheReadInputTokens || 0),
      output: totals.output + (usage.outputTokens || 0),
    }),
    { input: 0, cached: 0, output: 0 },
  );
}

function ModelLogs() {
  const [runs, setRuns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("audience");
  const [filters, setFilters] = useState({ period: "all", stage: "all", provider: "all" });

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        // 실행 기록은 서버가 최근 100건으로 이미 잘라 준다. 여기서 더 거르지
        // 않는다 — 하드코딩된 날짜로 과거를 가리던 발표용 장치가 있었고
        // (`/api/generation-state`), Story 9.3이 그것을 걷어내기로 했다.
        const response = await apiFetch("/api/model-logs", {
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "로그 조회 실패");
        if (cancelled) return;
        const runs = body.runs || [];
        setRuns(runs);
        setSelectedId((current) => current || runs[0]?.id || null);
        setError("");
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    };
    refresh();
    // 배포본의 로그는 스냅샷 파일이라 변하지 않는다. 2초마다 다시 받으면
    // 서랍을 열어 둔 동안 수 MB짜리 같은 파일을 계속 내려받는다.
    if (READ_ONLY) {
      return () => {
        cancelled = true;
      };
    }
    const interval = window.setInterval(refresh, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const visibleRuns = runs.filter((run) => {
    if (filters.stage !== "all" && run.stage !== filters.stage) return false;
    if (filters.provider !== "all" && run.provider !== filters.provider) return false;
    if (filters.period === "24h" && Date.now() - new Date(run.started_at).getTime() > 86_400_000) return false;
    return true;
  });
  const selected = visibleRuns.find((run) => run.id === selectedId) || visibleRuns[0];
  const tokens = modelLogTokens(selected);
  const inputSignals = selected
    ? [
        {
          label: "카드뉴스 편집 스킬",
          included: ["draft_generation", "draft_revision", "html_card_generation"].includes(selected.stage),
          detail: "논리 재구성·짧은 문장·행동 결론",
        },
        {
          label: "아티클 요약·근거",
          included: selected.source_block_ids?.length > 0,
          detail: "핵심 메시지와 source block",
        },
        {
          label: "이미지 레퍼런스 분석",
          included: ["draft_generation", "draft_revision"].includes(selected.stage),
          detail: "18장 분석에서 추출한 구조·무드·규칙",
        },
        {
          label: "사용자 수정 지시",
          included: selected.stage === "draft_revision",
          detail: "현재 요청과 모델 변형",
        },
      ]
    : [];
  // 초안 생성은 `cards`를, 기사 분석은 `card_plan`을 낸다. `cards`만 보면
  // 분석 실행 99건이 전부 "결과를 기다리는 중"으로 보인다 — 완료된 실행에
  // 스피너가 도는 것은 거짓 상태다. 같은 자리에 담을 수 있는 모양이므로
  // 옮겨 준다.
  const outputCards = [];

  return (
    <section className="model-log-page">
      <header className="model-log-heading">
        <div>
          <span>모델 실행 기록</span>
          <h1>호출 계측 기록</h1>
        </div>
        <div className="model-log-view-toggle">
          <button
            type="button"
            className={viewMode === "audience" ? "active" : ""}
            onClick={() => setViewMode("audience")}
          >
            청중용 보기
          </button>
          <button
            type="button"
            className={viewMode === "raw" ? "active" : ""}
            onClick={() => setViewMode("raw")}
          >
            원문 보기
          </button>
        </div>
      </header>

      {error && <div className="model-log-error">{error}</div>}

      <div className="model-log-layout">
        <aside className="model-run-list">
          <div className="model-run-filters">
            <select aria-label="기간" value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}>
              <option value="all">전체 기간</option><option value="24h">최근 24시간</option>
            </select>
            <select aria-label="단계" value={filters.stage} onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))}>
              <option value="all">전체 단계</option>{[...new Set(runs.map((run) => run.stage))].map((stage) => <option value={stage} key={stage}>{stage}</option>)}
            </select>
            <select aria-label="제공자" value={filters.provider} onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value }))}>
              <option value="all">전체 제공자</option>{[...new Set(runs.map((run) => run.provider))].map((provider) => <option value={provider} key={provider}>{provider}</option>)}
            </select>
          </div>
          {visibleRuns.length ? (
            visibleRuns.map((run) => (
              <button
                type="button"
                className={run.id === selected?.id ? "active" : ""}
                onClick={() => setSelectedId(run.id)}
                key={run.id}
              >
                <div>
                  <span className={`run-status ${run.status}`} />
                  <strong>{run.stage || "모델 실행"}</strong>
                </div>
                <p>{run.context?.slug || "공통"}</p>
                <small>
                  {run.model} ·{" "}
                  {new Date(run.started_at).toLocaleTimeString("ko-KR")}
                </small>
              </button>
            ))
          ) : (
            <div className="model-run-empty">
              <Activity size={22} />
              <strong>아직 기록된 실행이 없습니다.</strong>
              <p>다음 생성부터 자동으로 기록됩니다.</p>
            </div>
          )}
        </aside>

        <section className="model-log-detail">
          {selected ? (
            <>
              <div className="model-log-meta">
                <div>
                  <span>상태</span>
                  <strong className={selected.status}>
                    {selected.status === "running"
                      ? "실행 중"
                      : selected.status === "completed"
                        ? "완료"
                        : selected.status === "failed"
                          ? "실패"
                          : selected.status}
                  </strong>
                </div>
                <div>
                  <span>모델</span>
                  <strong>{selected.model}</strong>
                </div>
                <div>
                  <span>입력 · 캐시 제외</span>
                  <strong>{tokens.input == null ? "정보 없음" : tokens.input.toLocaleString()}</strong>
                </div>
                <div>
                  <span>캐시</span>
                  <strong>{tokens.cached == null ? "정보 없음" : tokens.cached.toLocaleString()}</strong>
                </div>
                <div>
                  <span>출력</span>
                  <strong>{tokens.output == null ? "정보 없음" : tokens.output.toLocaleString()}</strong>
                </div>
                <div>
                  <span>소요 시간</span>
                  <strong>
                    {selected.latency_ms != null
                      ? `${(selected.latency_ms / 1000).toFixed(1)}s`
                      : "실행 중"}
                  </strong>
                </div>
              </div>

              {viewMode === "audience" ? (
                <div className="model-audience-view">
                  <section className="model-audience-input">
                    <header>
                      <span>01 · 입력</span>
                      <h2>무엇을 함께 넣었나</h2>
                    </header>
                    {/* 신호는 프롬프트 원문을 훑어 판정한다. 원문이 없으면
                        판정할 수 없다 — 그때 X를 찍으면 "안 넣었다"는 거짓이
                        된다. 없다는 사실을 그대로 말한다. */}
                      <div className="model-signal-grid">
                        {inputSignals.map((signal) => (
                          <article
                            className={signal.included ? "included" : "missing"}
                            key={signal.label}
                          >
                            {signal.included ? (
                              <Check size={16} />
                            ) : (
                              <X size={16} />
                            )}
                            <div>
                              <strong>{signal.label}</strong>
                              <p>{signal.detail}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                  </section>

                  <div className="model-audience-arrow">
                    <span>02 · 모델</span>
                    <strong>{selected.model}</strong>
                    <small>
                      {selected.status === "running"
                        ? "생성 중"
                        : selected.latency_ms == null ? "정보 없음" : `${(selected.latency_ms / 1000).toFixed(1)}초`}
                    </small>
                  </div>

                  <section className="model-audience-output">
                    <header>
                      <span>03 · 출력</span>
                      <h2>
                        {outputCards.length
                          ? `${outputCards.length}장의 카드 초안`
                          : selected.status === "running"
                            ? "결과를 기다리는 중"
                            : "카드 목록이 없는 실행"}
                      </h2>
                    </header>
                    {outputCards.length ? (
                      <ol>
                        {outputCards.map((card) => (
                          <li key={card.position}>
                            <span>{String(card.position).padStart(2, "0")}</span>
                            <div>
                              <strong>{card.headline_ko}</strong>
                              <p>{card.body_ko}</p>
                            </div>
                            <em>{card.visualization_method}</em>
                          </li>
                        ))}
                      </ol>
                    ) : selected.status === "running" ? (
                      <div className="model-output-waiting">
                        <span className="spinner" />
                        <p>
                          완료되면 카드 제목과 시각화 방식이 여기에 표시됩니다.
                        </p>
                      </div>
                    ) : (
                      // 끝난 실행에 스피너를 돌리지 않는다. 왜 비어 있는지는
                      // 원문을 뺐기 때문일 수도, 애초에 카드를 내지 않는
                      // 작업이었기 때문일 수도 있다 — 구별해서 말한다.
                      <p className="model-output-omitted">
                        {selected.output_omitted
                          ? selected.omitted_reason ||
                            "이 실행의 응답 원문은 스냅샷에 담지 않았습니다."
                          : selected.error ||
                            "이 실행은 카드 목록을 내지 않는 작업입니다. 원문은 RAW 보기에서 확인합니다."}
                      </p>
                    )}
                  </section>
                </div>
              ) : (
                <section className="model-io-panel input">
                    <header>
                      <span>공통 계약</span>
                      <strong>ModelRun 원문</strong>
                    </header>
                    <pre>{JSON.stringify(selected, null, 2)}</pre>
                    <p className="model-output-omitted">
                      프롬프트와 모델 응답 전문은 telemetry에 복제하지 않습니다. 외부 전달 범위는 source_block_ids로 확인합니다.
                    </p>
                  </section>
              )}
            </>
          ) : (
            <div className="model-log-placeholder">
              <FileText size={28} />
              <strong>실행을 선택하면 입력과 출력이 표시됩니다.</strong>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export { ModelLogs };
