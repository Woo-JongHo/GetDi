import React from "react";

/**
 * 원문 이미지가 없는 카드에 들어가는 도형.
 *
 * 기사당 본문 이미지는 중앙값 1장이고 27%는 아예 없다. 카드는 여덟 장이니
 * 대부분의 카드는 이 도형으로 채워진다. 그런데 시각화 방식을 아홉 가지로
 * 고르게 해 놓고 실제로는 두 가지만 다르게 그리고 있었다 — 나머지 일곱은
 * 같은 그림이라 그 선택이 아무 일도 하지 않았다.
 *
 * **내용을 그리지 않는다.** 카드 본문에서 숫자나 항목을 뽑아 도형에 넣으면
 * 원문에 없는 것을 만들 위험이 있다. 여기서 표현하는 것은 내용이 아니라
 * **형식** — 비교인가, 단계인가, 순환인가.
 *
 * 색은 카드가 정한 강조색(--card-accent)을 쓴다. 검은 배경 위라
 * 선과 면이 밝게 떠야 읽힌다.
 */

const VIEWBOX = "0 0 320 200";

/** 하나의 주장을 세우는 카드 — 굵은 수평선이 문장을 받치는 형태. */
function StatementShape() {
  return (
    <>
      <rect x="34" y="58" width="150" height="10" rx="5" fill="currentColor" />
      <rect
        x="34"
        y="86"
        width="252"
        height="10"
        rx="5"
        fill="currentColor"
        opacity="0.45"
      />
      <rect
        x="34"
        y="114"
        width="96"
        height="10"
        rx="5"
        fill="currentColor"
        opacity="0.22"
      />
      <circle cx="272" cy="63" r="18" stroke="currentColor" strokeWidth="3" fill="none" />
    </>
  );
}

/** A와 B를 나란히 두고 가운데를 가르는 선. */
function ComparisonShape() {
  return (
    <>
      <rect x="30" y="42" width="112" height="116" rx="14" stroke="currentColor" strokeWidth="3" fill="none" />
      <rect x="178" y="42" width="112" height="116" rx="14" fill="currentColor" opacity="0.18" />
      <rect x="178" y="42" width="112" height="116" rx="14" stroke="currentColor" strokeWidth="3" fill="none" />
      <line x1="160" y1="30" x2="160" y2="170" stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" opacity="0.6" />
      <text x="86" y="108" textAnchor="middle" fontSize="34" fontWeight="800" fill="currentColor">A</text>
      <text x="234" y="108" textAnchor="middle" fontSize="34" fontWeight="800" fill="currentColor">B</text>
    </>
  );
}

/** 왼쪽에서 오른쪽으로 나아가는 단계. */
function StepsShape() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <g key={index}>
          <circle
            cx={62 + index * 98}
            cy="100"
            r="26"
            stroke="currentColor"
            strokeWidth="3"
            fill={index === 0 ? "currentColor" : "none"}
            fillOpacity={index === 0 ? 0.2 : 0}
          />
          <text
            x={62 + index * 98}
            y="110"
            textAnchor="middle"
            fontSize="22"
            fontWeight="800"
            fill="currentColor"
          >
            {index + 1}
          </text>
          {index < 2 && (
            <line
              x1={94 + index * 98}
              y1="100"
              x2={130 + index * 98}
              y2="100"
              stroke="currentColor"
              strokeWidth="3"
              opacity="0.5"
            />
          )}
        </g>
      ))}
    </>
  );
}

/** 돌아오는 구조 — 열린 원과 화살촉. */
function CycleShape() {
  return (
    <>
      <path
        d="M 160 42 A 58 58 0 1 1 108 74"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M 108 74 L 96 52 L 122 54 Z" fill="currentColor" />
      <circle cx="160" cy="100" r="16" fill="currentColor" opacity="0.25" />
    </>
  );
}

/** 확인해야 할 항목들. */
function ChecklistShape() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <g key={index}>
          <rect
            x="42"
            y={48 + index * 40}
            width="26"
            height="26"
            rx="7"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
          />
          {index < 2 && (
            <path
              d={`M 48 ${61 + index * 40} l 6 7 l 11 -13`}
              stroke="currentColor"
              strokeWidth="3.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <rect
            x="84"
            y={56 + index * 40}
            width={index === 2 ? 96 : 168}
            height="9"
            rx="4.5"
            fill="currentColor"
            opacity={index === 2 ? 0.25 : 0.5}
          />
        </g>
      ))}
    </>
  );
}

/** 조심할 것 — 삼각형과 느낌표. */
function WarningShape() {
  return (
    <>
      <path
        d="M 160 44 L 232 154 L 88 154 Z"
        stroke="currentColor"
        strokeWidth="4"
        fill="currentColor"
        fillOpacity="0.12"
        strokeLinejoin="round"
      />
      <rect x="154" y="82" width="12" height="38" rx="6" fill="currentColor" />
      <circle cx="160" cy="134" r="7" fill="currentColor" />
    </>
  );
}

/** 실제로 있었던 일 — 카드가 겹쳐 쌓인 형태. */
function ExampleShape() {
  return (
    <>
      <rect x="58" y="56" width="150" height="100" rx="12" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.35" />
      <rect x="78" y="44" width="150" height="100" rx="12" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="3" />
      <rect x="98" y="70" width="82" height="9" rx="4.5" fill="currentColor" opacity="0.7" />
      <rect x="98" y="90" width="110" height="9" rx="4.5" fill="currentColor" opacity="0.4" />
    </>
  );
}

/** 남의 말 — 큰 따옴표. */
function QuoteShape() {
  return (
    <>
      <text x="52" y="132" fontSize="150" fontWeight="800" fill="currentColor" opacity="0.55">
        “
      </text>
      <rect x="150" y="70" width="132" height="10" rx="5" fill="currentColor" opacity="0.55" />
      <rect x="150" y="96" width="108" height="10" rx="5" fill="currentColor" opacity="0.3" />
      <rect x="150" y="122" width="64" height="10" rx="5" fill="currentColor" opacity="0.18" />
    </>
  );
}

/** 숫자가 핵심인 카드 — 실제 값은 카피가 말하고 여기선 자리만 만든다. */
function NumberShape() {
  return (
    <>
      <circle cx="160" cy="100" r="62" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.4" />
      <path
        d="M 160 38 A 62 62 0 0 1 214 132"
        stroke="currentColor"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="160" cy="100" r="30" fill="currentColor" opacity="0.16" />
    </>
  );
}

const SHAPES = {
  statement: StatementShape,
  comparison: ComparisonShape,
  steps: StepsShape,
  cycle: CycleShape,
  checklist: ChecklistShape,
  warning: WarningShape,
  example: ExampleShape,
  quote: QuoteShape,
  number: NumberShape,
};

function CardVisual({ method, position }) {
  const Shape = SHAPES[method] || SHAPES.statement;
  return (
    <div className={`generated-card-visual generated-${method}`}>
      <svg
        className="card-visual-svg"
        viewBox={VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <Shape />
      </svg>
      <em>{String(position).padStart(2, "0")}</em>
    </div>
  );
}

export { CardVisual, SHAPES };
