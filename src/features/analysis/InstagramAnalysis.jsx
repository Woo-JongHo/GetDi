import React, { useState } from "react";

import { ArrowLeft, ArrowUpRight, Check, Eye, Image as ImageIcon, Layers3, Palette, ShieldAlert, Sparkles, Type } from "lucide-react";

const INSTAGRAM_CARDS = [
  {
    id: 1,
    role: "Cover",
    fileSize: 1404070,
    title: "관심을 만드는 표지",
    facts: [
      "검은 바탕 위에 매우 큰 흰색 제목을 배치했다.",
      "제목은 ‘18가지 변화’와 ‘(1)’로 분량과 시리즈성을 동시에 알린다.",
      "인물 사진과 코랄색 캐릭터가 하단에서 시선을 고정한다.",
    ],
    interpretations: [
      "첫 장의 목적은 정보 전달보다 주제 인지와 다음 장 넘김 유도에 가깝다.",
      "인물은 권위를, 캐릭터는 계정의 친근한 화자를 담당하는 것으로 보인다.",
    ],
    qa: [
      { level: "error", text: "1,404,070 bytes로 1.2MB 목표를 초과한다." },
      { level: "warn", text: "인물·캐릭터를 그대로 복제할 권리는 확인되지 않았다." },
    ],
  },
  {
    id: 2,
    role: "Authority",
    fileSize: 795350,
    title: "출처와 맥락 설정",
    facts: [
      "밝은 배경, 중앙 정렬 문단, 둥근 인물 사진으로 구성됐다.",
      "본문에 Jakob Nielsen과 Don Norman을 직접 언급한다.",
      "우측 하단 캐릭터가 다음 카드로 이어지는 시각적 연결점이다.",
    ],
    interpretations: [
      "핵심 주장 전에 출처의 권위와 글의 전제를 설명한다.",
      "사진은 장식보다 ‘누가 말했는가’를 증명하는 근거 역할에 가깝다.",
    ],
    qa: [{ level: "warn", text: "인물 사진 사용 권리와 출처 표기가 필요하다." }],
  },
  {
    id: 3,
    role: "Insight 01",
    fileSize: 798435,
    title: "첫 번째 변화",
    facts: [
      "큰 번호 01, 짧은 제목, 두 개의 설명 문단 순서가 반복된다.",
      "하단의 둥근 모서리 일러스트가 화면의 약 절반을 차지한다.",
      "상단 텍스트와 하단 이미지 사이에 넓은 여백이 있다.",
    ],
    interpretations: [
      "번호는 긴 시리즈 안에서 현재 위치를 빠르게 알려준다.",
      "이미지는 주장을 증명하기보다 개념을 쉽게 설명하는 역할이다.",
    ],
    qa: [{ level: "ok", text: "크기와 안전 영역에서 뚜렷한 오류가 보이지 않는다." }],
  },
  {
    id: 4,
    role: "Insight 02",
    fileSize: 613131,
    title: "두 번째 변화",
    facts: [
      "03번 카드와 동일한 번호·제목·본문·하단 이미지 구조다.",
      "이미지 내부에 ‘Not Yet, Folks!’라는 영문 문구가 남아 있다.",
      "연속 카드에서 레이아웃 변화보다 내용 변화에 집중시킨다.",
    ],
    interpretations: [
      "반복되는 템플릿이 스캔 비용을 낮추고 시리즈 리듬을 만든다.",
      "이미지 내부 텍스트도 최종 번역 QA 범위에 포함해야 한다.",
    ],
    qa: [{ level: "warn", text: "이미지 내부 영문 문구의 번역 여부를 확인해야 한다." }],
  },
  {
    id: 5,
    role: "Insight 03",
    fileSize: 723499,
    title: "세 번째 변화",
    facts: [
      "앞선 인사이트 카드와 같은 템플릿을 사용한다.",
      "상단 eyebrow, 번호, 제목 일부가 파일 위쪽 경계에서 잘려 있다.",
      "본문과 하단 이미지는 캔버스 안에 남아 있다.",
    ],
    interpretations: [
      "잘림은 의도된 스타일보다 내보내기 또는 레이아웃 오류일 가능성이 높다.",
      "카드 생성기에 안전 영역 검사가 반드시 필요하다.",
    ],
    qa: [{ level: "error", text: "상단 제목 영역이 잘렸다. 출력 전 차단해야 한다." }],
  },
  {
    id: 6,
    role: "Close",
    fileSize: 164300,
    title: "브랜드 마무리",
    facts: [
      "검은 배경으로 돌아가 표지와 시각적 bookend를 만든다.",
      "말풍선, 코랄색 캐릭터, 제작자 정보, 희미한 로고 그리드가 보인다.",
      "정보 카드보다 계정과 제작자를 기억시키는 구성이 강하다.",
    ],
    interpretations: [
      "마지막 장은 새 주장보다 제작자 신뢰와 다음 콘텐츠 기대를 남긴다.",
      "공통 캐릭터는 카드 전체를 한 계정의 목소리로 묶는 장치다.",
    ],
    qa: [{ level: "warn", text: "캐릭터·제작자 정보·로고 그리드는 복제하지 않는다." }],
  },
];

const INSTAGRAM_RULES = [
  {
    id: "NAR-01",
    icon: Layers3,
    title: "표지 → 권위 → 번호형 인사이트 → 마무리",
    confidence: "High · post",
    note: "현재 6장 모두에서 직접 관찰한 서사 순서다.",
  },
  {
    id: "LAY-01",
    icon: Type,
    title: "번호·제목·설명·이미지의 수직 위계",
    confidence: "High · post",
    note: "인사이트 3장에서 반복된다.",
  },
  {
    id: "CLR-01",
    icon: Palette,
    title: "어두운 bookend와 밝은 콘텐츠 카드",
    confidence: "Medium · account",
    note: "한 게시물에서는 강하지만 계정 규칙으로 확정하기엔 자료가 적다.",
  },
  {
    id: "IMG-01",
    icon: ImageIcon,
    title: "사진은 권위, 일러스트는 설명",
    confidence: "Medium · post",
    note: "카드 2와 카드 3~5의 역할 차이에서 추론했다.",
  },
];

function InstagramAnalysis() {
  const [selectedId, setSelectedId] = useState(1);
  const [panel, setPanel] = useState("evidence");
  const [safeArea, setSafeArea] = useState(false);
  const selected =
    INSTAGRAM_CARDS.find((card) => card.id === selectedId) || INSTAGRAM_CARDS[0];

  return (
    <main className="analysis-layout">
      <aside className="analysis-set-rail">
        <a className="back-link" href="#/">
          <ArrowLeft size={16} /> Library
        </a>
        <div className="analysis-account">
          <div className="account-avatar">UX</div>
          <div>
            <span>REFERENCE ACCOUNT</span>
            <strong>@uxdesign_today</strong>
          </div>
        </div>

        <div className="analysis-scope">
          <span className="scope-dot" />
          <div>
            <strong>Single post analysis</strong>
          </div>
        </div>

        <div className="reference-list">
          <div className="rail-title">EVIDENCE CARDS</div>
          {INSTAGRAM_CARDS.map((card) => (
            <button
              className={selected.id === card.id ? "selected" : ""}
              type="button"
              onClick={() => setSelectedId(card.id)}
              key={card.id}
            >
              <img
                src={`/api/instagram/reference/${card.id}`}
                alt={`${card.role} 참고 카드`}
              />
              <span className="reference-meta">
                <em>{String(card.id).padStart(2, "0")}</em>
                <strong>{card.role}</strong>
                <small>{(card.fileSize / 1024).toFixed(0)} KB</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="analysis-canvas">
        <header className="analysis-titlebar">
          <div>
            <div className="eyebrow">
              <span>ANALYSIS SET 01</span>
              <span className="eyebrow-rule" />
              <span>2026.07.25</span>
            </div>
            <h1>Instagram post anatomy</h1>
          </div>
          <div className="analysis-confidence">
            <span>ACCOUNT PROFILE</span>
            <strong>Not enough evidence</strong>
          </div>
        </header>

        <div className="canvas-toolbar">
          <div>
            <span className="canvas-card-number">
              {String(selected.id).padStart(2, "0")} / 06
            </span>
            <strong>{selected.role}</strong>
          </div>
          <button
            className={safeArea ? "active" : ""}
            type="button"
            onClick={() => setSafeArea((value) => !value)}
          >
            <Eye size={15} /> 안전 영역
          </button>
        </div>

        <div className="reference-stage">
          <div className={`reference-frame ${safeArea ? "show-safe-area" : ""}`}>
            <img
              src={`/api/instagram/reference/${selected.id}`}
              alt={`${selected.role}: ${selected.title}`}
            />
            <span className="safe-area-box" />
          </div>
          <div className="reference-caption">
            <span>1080 × 1350</span>
            <span>{selected.fileSize.toLocaleString()} bytes</span>
          </div>
        </div>

        <div className="analysis-navigator">
          <button
            type="button"
            disabled={selected.id === 1}
            onClick={() => setSelectedId((id) => Math.max(1, id - 1))}
          >
            <ArrowLeft size={16} /> 이전
          </button>
          <div>
            {INSTAGRAM_CARDS.map((card) => (
              <button
                className={selected.id === card.id ? "active" : ""}
                type="button"
                aria-label={`${card.id}번 카드`}
                onClick={() => setSelectedId(card.id)}
                key={card.id}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={selected.id === 6}
            onClick={() => setSelectedId((id) => Math.min(6, id + 1))}
          >
            다음 <ArrowUpRight size={16} />
          </button>
        </div>
      </section>

      <aside className="analysis-inspector">
        <div className="inspector-tabs">
          <button
            className={panel === "evidence" ? "active" : ""}
            type="button"
            onClick={() => setPanel("evidence")}
          >
            Evidence
          </button>
          <button
            className={panel === "rules" ? "active" : ""}
            type="button"
            onClick={() => setPanel("rules")}
          >
            Rules
          </button>
          <button
            className={panel === "qa" ? "active" : ""}
            type="button"
            onClick={() => setPanel("qa")}
          >
            QA
          </button>
        </div>

        {panel === "evidence" && (
          <div className="inspector-content">
            <div className="inspector-card-heading">
              <span>{String(selected.id).padStart(2, "0")} · {selected.role}</span>
              <h2>{selected.title}</h2>
            </div>

            <section className="analysis-section">
              <div className="analysis-section-title">
                <Eye size={14} />
                <span>OBSERVATION · GROUNDED</span>
              </div>
              {selected.facts.map((fact) => (
                <div className="analysis-fact" key={fact}>
                  <span />
                  <p>{fact}</p>
                </div>
              ))}
            </section>

            <section className="analysis-section">
              <div className="analysis-section-title inferred">
                <Sparkles size={14} />
                <span>INTERPRETATION · INFERRED</span>
              </div>
              {selected.interpretations.map((interpretation) => (
                <div className="interpretation-card" key={interpretation}>
                  <p>{interpretation}</p>
                  <span>Confidence · medium</span>
                </div>
              ))}
            </section>
          </div>
        )}

        {panel === "rules" && (
          <div className="inspector-content">
            <div className="inspector-card-heading">
              <span>CANDIDATE PROFILE</span>
              <h2>재사용 가능한 디자인 규칙</h2>
            </div>
            <div className="rule-list">
              {INSTAGRAM_RULES.map(({ id, icon: Icon, title, confidence, note }) => (
                <article key={id}>
                  <div className="rule-topline">
                    <span><Icon size={14} /> {id}</span>
                    <em>{confidence}</em>
                  </div>
                  <h3>{title}</h3>
                  <p>{note}</p>
                </article>
              ))}
            </div>
            <div className="no-copy-guard">
              <ShieldAlert size={17} />
              <div>
                <strong>캐릭터·인물·로고 복제 금지</strong>
              </div>
            </div>
          </div>
        )}

        {panel === "qa" && (
          <div className="inspector-content">
            <div className="inspector-card-heading">
              <span>OUTPUT REVIEW</span>
              <h2>카드 {selected.id} 품질 검사</h2>
            </div>
            <div className="qa-list">
              {selected.qa.map((issue) => (
                <article className={issue.level} key={issue.text}>
                  <span>
                    {issue.level === "ok" ? <Check size={14} /> : <ShieldAlert size={14} />}
                  </span>
                  <p>{issue.text}</p>
                </article>
              ))}
            </div>
            <div className="qa-spec">
              <div><span>Canvas</span><strong>1080 × 1350</strong></div>
              <div><span>Size target</span><strong>≤ 1.2 MB</strong></div>
              <div>
                <span>Current</span>
                <strong className={selected.fileSize > 1200000 ? "bad" : "good"}>
                  {(selected.fileSize / 1000000).toFixed(2)} MB
                </strong>
              </div>
            </div>
          </div>
        )}
      </aside>
    </main>
  );
}

export { InstagramAnalysis };
