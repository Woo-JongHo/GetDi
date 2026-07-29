import React, { useEffect, useRef, useState } from "react";

import { Coins, Maximize2, Minus, Plus, Wrench } from "lucide-react";

/**
 * 서비스 지도 — 디자이너가 "이게 어떻게 돌아가는가"를 한 화면에서 본다.
 *
 * 왼쪽은 실제 화면 넷, 오른쪽은 그 화면에서 일어나는 일 여섯이고
 * 둘을 선으로 잇는다. 흐름은 위에서 아래로 흐른다.
 *
 * 특히 두 가지를 드러낸다.
 *   돈이 드는 곳  — 모델을 부르는 단계와 실제로 쓴 토큰
 *   손댈 수 있는 곳 — 결과가 마음에 안 들 때 고칠 파일
 *
 * 토큰 수치는 화면에 적어 두지 않는다. 적어 두면 낡는다.
 * `npm run usage`가 만든 집계를 그대로 읽어 보여준다.
 */

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 1180;
const FRAME_X = 56;
const FRAME_WIDTH = 300;
const CARD_X = 620;
const CARD_WIDTH = 600;

/** 왼쪽 — 실제 화면. y와 높이는 오른쪽 카드와 나란히 보이도록 잡았다. */
const SCREENS = [
  {
    id: "crawl",
    no: "01",
    title: "크롤링",
    route: "#/",
    y: 60,
    height: 250,
    note: "수집을 시작하고 진행을 본다",
  },
  {
    id: "cards",
    no: "02",
    title: "카드 리스트",
    route: "#/cards",
    y: 340,
    height: 130,
    note: "받아온 기사를 훑고 고른다",
  },
  {
    id: "summary",
    no: "03",
    title: "요약본",
    route: "#/summary/…",
    y: 500,
    height: 160,
    note: "주장·근거·연결·가치로 읽는다",
  },
  {
    id: "draft",
    no: "04",
    title: "인스타 초안",
    route: "#/draft/…",
    y: 690,
    height: 400,
    note: "카드 문구를 만들고 고친다",
  },
];

/** 오른쪽 — 그 화면에서 실제로 일어나는 일. */
const STAGES = [
  {
    id: "collect",
    screen: "crawl",
    y: 60,
    title: "수집",
    what: "NN/g에서 2026년 기사 목록과 본문·이미지를 받아 온다.",
    cost: null,
    costNote: "모델을 부르지 않는다. 대신 시간이 든다 — 요청 사이 60초.",
    tune: [
      { file: "crawler/listing.mjs", why: "어떤 기사를 목록으로 잡을지" },
      { file: "crawler/detail.mjs", why: "본문에서 무엇을 남기고 버릴지" },
    ],
  },
  {
    id: "translate",
    screen: "crawl",
    y: 205,
    title: "제목 의역",
    what: "목록의 제목·요약을 한국어로 옮긴다. 직역하지 않는다.",
    cost: "listing-translation",
    costNote: "12건씩 묶어 부른다. 기사 하나당 비용은 그만큼 나뉜다.",
    tune: [{ file: "crawler/translate.mjs", why: "번역 말투와 길이 기준" }],
  },
  {
    id: "browse",
    screen: "cards",
    y: 350,
    title: "고르기",
    what: "본문이 준비된 기사만 다음 단계로 갈 수 있다.",
    cost: null,
    costNote: "모델을 부르지 않는다. 이미 받아 둔 것을 보여줄 뿐이다.",
    tune: [{ file: "src/features/cards/CardList.jsx", why: "정렬·필터 기준" }],
  },
  {
    id: "analyze",
    screen: "summary",
    y: 500,
    title: "분석",
    what: "기사 하나를 주장·근거 갈래·연결·가치로 접는다.",
    cost: "article_analysis",
    costNote: "본문 전문을 통째로 보내기 때문에 input이 크다.",
    tune: [
      {
        file: "references/summary-method.md",
        why: "요약의 칸 자체. 형식의 정본이다",
      },
      {
        file: "references/cardnews-generation-prompt.md",
        why: "카드 몇 장에 무엇을 맡길지",
      },
    ],
  },
  {
    id: "draft",
    screen: "draft",
    y: 690,
    title: "초안 생성",
    what: "분석을 카드 문구로 옮긴다. 카드당 주장 하나.",
    cost: "draft_generation",
    costNote: "분석 결과와 레퍼런스 규칙을 함께 보낸다.",
    tune: [
      {
        file: "references/cardnews-production-prompt.md",
        why: "카드 문구의 말투·길이",
      },
    ],
  },
  {
    id: "revise",
    screen: "draft",
    y: 830,
    title: "말로 고치기",
    what: "“3번을 질문형으로”처럼 지시하면 새 버전을 만든다.",
    cost: "draft_revision",
    costNote: "고칠 때마다 부른다. 여러 번 고치면 그만큼 쌓인다.",
    tune: [
      {
        file: "references/cardnews-production-prompt.md",
        why: "수정본도 같은 카피 규칙을 따른다",
      },
    ],
  },
  {
    id: "render",
    screen: "draft",
    y: 970,
    title: "카드 그리기",
    what: "문구를 1080×1350 카드로 만든다.",
    cost: "html_card_generation",
    costNote: "가장 비싸고 오래 걸린다. 출력이 통째로 HTML이라서다.",
    tune: [
      {
        file: "src/features/draft/cardLayout.js",
        why: "배경·글자 크기·줄 나눔. 모델이 아니라 코드가 정한다",
      },
      {
        file: "references/html-card-production-prompt.md",
        why: "모델이 HTML을 만들 때의 규칙",
      },
    ],
  },
];

const compact = new Intl.NumberFormat("ko-KR");

function ServiceMap() {
  const [usage, setUsage] = useState(null);
  const [scale, setScale] = useState(0.62);
  const [selected, setSelected] = useState("analyze");
  const viewportRef = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    fetch("/api/usage-summary", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  /** 처음 열었을 때 지도가 통째로 보이도록 맞춘다. */
  function fitCanvas() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.min(
      (viewport.clientWidth - 48) / CANVAS_WIDTH,
      (viewport.clientHeight - 48) / CANVAS_HEIGHT,
    );
    setScale(Math.max(0.2, Math.min(1, next)));
  }

  useEffect(() => {
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    return () => window.removeEventListener("resize", fitCanvas);
  }, []);

  // 드래그로 캔버스를 민다. 확대하면 화면 밖으로 나가는 부분이 생기기 때문이다.
  function onPointerDown(event) {
    if (event.target.closest("button, a")) return;
    const viewport = viewportRef.current;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const pan = panRef.current;
    if (!pan) return;
    const viewport = viewportRef.current;
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  }

  function endPan() {
    panRef.current = null;
  }

  const byOperation = new Map(
    (usage?.operations ?? []).map((row) => [row.operation, row]),
  );
  const active = STAGES.find((stage) => stage.id === selected) ?? STAGES[0];
  const screenOf = (id) => SCREENS.find((screen) => screen.id === id);

  return (
    <main className="map-shell">
      <header className="map-topbar">
        <div>
          <span>SERVICE MAP</span>
          <strong>기사 하나가 카드 여덟 장이 되기까지</strong>
        </div>
        <div className="map-legend">
          <span className="is-paid">
            <Coins size={13} /> 모델을 부른다
          </span>
          <span>
            <Wrench size={13} /> 고칠 수 있는 곳
          </span>
        </div>
      </header>

      <section
        className="map-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="map-scaled"
          style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}
        >
          <div
            className="map-world"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${scale})`,
            }}
          >
            {/* 화면과 단계를 잇는 선. 직각으로 꺾어 흐름이 읽히게 한다. */}
            <svg
              className="map-wires"
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              aria-hidden="true"
            >
              {STAGES.map((stage) => {
                const screen = screenOf(stage.screen);
                const startX = FRAME_X + FRAME_WIDTH;
                const startY = screen.y + screen.height / 2;
                const endY = stage.y + 46;
                const mid = CARD_X - 44;
                return (
                  <g
                    key={stage.id}
                    className={selected === stage.id ? "is-active" : ""}
                  >
                    <path
                      d={`M ${startX} ${startY} H ${mid} V ${endY} H ${CARD_X}`}
                    />
                    <circle cx={startX} cy={startY} r="5" />
                    <circle cx={CARD_X} cy={endY} r="5" />
                  </g>
                );
              })}
            </svg>

            {SCREENS.map((screen) => (
              <div
                className="map-frame"
                key={screen.id}
                style={{
                  left: FRAME_X,
                  top: screen.y,
                  width: FRAME_WIDTH,
                  height: screen.height,
                }}
              >
                <div className="map-frame-head">
                  <span>{screen.no}</span>
                  <strong>{screen.title}</strong>
                </div>
                <code>{screen.route}</code>
                <p>{screen.note}</p>
              </div>
            ))}

            {STAGES.map((stage) => {
              const row = stage.cost ? byOperation.get(stage.cost) : null;
              const unknown = row?.usage_source === "unavailable";
              return (
                <button
                  type="button"
                  key={stage.id}
                  className={`map-node ${stage.cost ? "is-paid" : "is-free"} ${
                    selected === stage.id ? "is-selected" : ""
                  }`}
                  style={{ left: CARD_X, top: stage.y, width: CARD_WIDTH }}
                  onClick={() => setSelected(stage.id)}
                  onMouseEnter={() => setSelected(stage.id)}
                >
                  <div className="map-node-head">
                    <strong>{stage.title}</strong>
                    {stage.cost ? (
                      <i className="map-node-cost">
                        <Coins size={12} />
                        {row && !unknown
                          ? `in ${compact.format(row.per_run.input_tokens)} · out ${compact.format(row.per_run.output_tokens)}`
                          : unknown
                            ? "기록 없음"
                            : "아직 돌린 적 없음"}
                      </i>
                    ) : (
                      <i className="map-node-free">토큰 안 씀</i>
                    )}
                  </div>
                  <p>{stage.what}</p>
                  <div className="map-node-files">
                    {stage.tune.map((item) => (
                      <code key={item.file}>{item.file}</code>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="map-detail">
        <span className="map-detail-kicker">
          {screenOf(active.screen).no} · {screenOf(active.screen).title}
        </span>
        <h2>{active.title}</h2>
        <p>{active.what}</p>

        <div className="map-detail-block">
          <span>
            <Coins size={13} /> 토큰
          </span>
          {(() => {
            const row = active.cost ? byOperation.get(active.cost) : null;
            if (!active.cost) return <strong>안 쓴다</strong>;
            if (!row) return <strong className="muted">아직 돌린 적 없음</strong>;
            if (row.usage_source === "unavailable") {
              return (
                <strong className="muted">
                  기록 없음 — 이 모델이 사용량을 돌려주지 않는다
                </strong>
              );
            }
            return (
              <strong>
                건당 in {compact.format(row.per_run.input_tokens)} · out{" "}
                {compact.format(row.per_run.output_tokens)}
                <em>
                  {Math.round(row.per_run.duration_ms / 1000)}초 · 지금까지{" "}
                  {row.runs}회
                </em>
              </strong>
            );
          })()}
          <p>{active.costNote}</p>
        </div>

        <div className="map-detail-block">
          <span>
            <Wrench size={13} /> 여기를 고치면 결과가 바뀐다
          </span>
          {active.tune.map((item) => (
            <div className="map-detail-file" key={item.file}>
              <code>{item.file}</code>
              <p>{item.why}</p>
            </div>
          ))}
        </div>

        <p className="map-detail-meta">
          {usage?.generated_at ? (
            <>
              {new Date(usage.generated_at).toLocaleString("ko-KR")} 기준 ·{" "}
              <code>npm run usage</code>로 갱신
            </>
          ) : (
            <>
              아직 집계한 적이 없다. <code>npm run usage</code>를 한 번 돌리면
              실제 숫자가 들어온다.
            </>
          )}
          <br />
          비용(원화)은 적지 않았다 — 단가를 확인할 수 없어 추정치를 적으면
          나중에 실제 청구액으로 읽힌다.
        </p>
      </aside>

      <div className="map-zoom">
        <button
          type="button"
          onClick={() => setScale((value) => Math.max(0.2, value - 0.06))}
          aria-label="축소"
        >
          <Minus size={16} />
        </button>
        <strong>{Math.round(scale * 100)}%</strong>
        <button
          type="button"
          onClick={() => setScale((value) => Math.min(1, value + 0.06))}
          aria-label="확대"
        >
          <Plus size={16} />
        </button>
        <button type="button" onClick={fitCanvas} aria-label="화면에 맞추기">
          <Maximize2 size={15} /> FIT
        </button>
      </div>
    </main>
  );
}

export { ServiceMap };
