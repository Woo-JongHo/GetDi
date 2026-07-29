import React, { useEffect, useState } from "react";

import { Activity, Check, FileText, X } from "lucide-react";

import { uncachedInputTokens } from "../../shared/format.js";

function modelLogTokens(run) {
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

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [response, stateResponse] = await Promise.all([
          fetch("/api/model-logs", { cache: "no-store" }),
          fetch("/api/generation-state", { cache: "no-store" }),
        ]);
        const [body, generationState] = await Promise.all([
          response.json(),
          stateResponse.json(),
        ]);
        if (!response.ok) throw new Error(body.error || "로그 조회 실패");
        if (!stateResponse.ok) {
          throw new Error(generationState.error || "생성 단계 조회 실패");
        }
        if (cancelled) return;
        const visibleRuns = (body.runs || []).filter(
          (run) =>
            run.started_at >= generationState.visible_after ||
            (run.status === "completed" &&
              run.operation === "draft_revision" &&
              run.model?.includes("fable")),
        );
        setRuns(visibleRuns);
        setSelectedId((current) => current || visibleRuns[0]?.id || null);
        setError("");
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const selected = runs.find((run) => run.id === selectedId) || runs[0];
  const tokens = modelLogTokens(selected);
  const prompt = selected?.input?.prompt || "";
  const inputSignals = selected
    ? [
        {
          label: "카드뉴스 편집 스킬",
          included:
            prompt.includes("GetDi Cardnews Production Prompt") ||
            prompt.includes("Instagram Cardnews Generation Prompt") ||
            prompt.includes("GetDi High-Fidelity HTML Card Prompt"),
          detail: "논리 재구성·짧은 문장·행동 결론",
        },
        {
          label: "아티클 요약·근거",
          included:
            prompt.includes("GROUNDED ANALYSIS") ||
            prompt.includes("ANNOTATED HTML") ||
            prompt.includes("LOCKED CARD COPY"),
          detail: "핵심 메시지와 source block",
        },
        {
          label: "이미지 레퍼런스 분석",
          included: prompt.includes("REFERENCE IMAGE PROFILES"),
          detail: "18장 분석에서 추출한 구조·무드·규칙",
        },
        {
          label: "사용자 수정 지시",
          included:
            prompt.includes("USER INSTRUCTION") ||
            (prompt.includes("MODEL VARIANT") &&
              prompt.includes("RUNTIME REQUIREMENTS")),
          detail: "현재 요청과 모델 변형",
        },
      ]
    : [];
  const outputCards = selected?.output?.cards || [];

  return (
    <section className="model-log-page">
      <header className="model-log-heading">
        <div>
          <span>MODEL TRACE</span>
          <h1>Input / Output Log</h1>
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
          {runs.length ? (
            runs.map((run) => (
              <button
                type="button"
                className={run.id === selected?.id ? "active" : ""}
                onClick={() => setSelectedId(run.id)}
                key={run.id}
              >
                <div>
                  <span className={`run-status ${run.status}`} />
                  <strong>{run.operation || "model_run"}</strong>
                </div>
                <p>{run.slug || "global"}</p>
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
                  <span>STATUS</span>
                  <strong className={selected.status}>{selected.status}</strong>
                </div>
                <div>
                  <span>MODEL</span>
                  <strong>{selected.model}</strong>
                </div>
                <div>
                  <span>INPUT · CACHE EXCLUDED</span>
                  <strong>{tokens.input.toLocaleString()}</strong>
                </div>
                <div>
                  <span>CACHED</span>
                  <strong>{tokens.cached.toLocaleString()}</strong>
                </div>
                <div>
                  <span>OUTPUT</span>
                  <strong>{tokens.output.toLocaleString()}</strong>
                </div>
                <div>
                  <span>DURATION</span>
                  <strong>
                    {selected.duration_ms != null
                      ? `${(selected.duration_ms / 1000).toFixed(1)}s`
                      : "running"}
                  </strong>
                </div>
              </div>

              {viewMode === "audience" ? (
                <div className="model-audience-view">
                  <section className="model-audience-input">
                    <header>
                      <span>01 · INPUT</span>
                      <h2>무엇을 함께 넣었나</h2>
                    </header>
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
                    <span>02 · MODEL</span>
                    <strong>{selected.model}</strong>
                    <small>
                      {selected.status === "running"
                        ? "생성 중"
                        : `${(selected.duration_ms / 1000).toFixed(1)}초`}
                    </small>
                  </div>

                  <section className="model-audience-output">
                    <header>
                      <span>03 · OUTPUT</span>
                      <h2>
                        {outputCards.length
                          ? `${outputCards.length}장의 카드 초안`
                          : "결과를 기다리는 중"}
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
                    ) : (
                      <div className="model-output-waiting">
                        <span className="spinner" />
                        <p>
                          완료되면 카드 제목과 시각화 방식이 여기에 표시됩니다.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <>
                  <section className="model-io-panel input">
                    <header>
                      <span>MODEL INPUT</span>
                      <strong>실제 전달 프롬프트</strong>
                    </header>
                    <pre>{selected.input?.prompt || "입력 준비 중"}</pre>
                  </section>

                  <details className="model-schema-panel">
                    <summary>STRUCTURED OUTPUT SCHEMA</summary>
                    <pre>
                      {JSON.stringify(selected.input?.schema || {}, null, 2)}
                    </pre>
                  </details>

                  <section className="model-io-panel output">
                    <header>
                      <span>MODEL OUTPUT</span>
                      <strong>구조화 응답 원문</strong>
                    </header>
                    <pre>
                      {selected.output
                        ? JSON.stringify(selected.output, null, 2)
                        : selected.error || "모델 응답을 기다리는 중입니다."}
                    </pre>
                  </section>
                </>
              )}
            </>
          ) : (
            <div className="model-log-placeholder">
              <FileText size={28} />
              <strong>실행을 선택하면 Input과 Output이 표시됩니다.</strong>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export { ModelLogs };
