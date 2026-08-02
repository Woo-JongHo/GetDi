/**
 * 카드 8장의 시각 규칙.
 *
 * 이 파일이 "손으로 안 고쳐도 되게" 만드는 자리다. 카드마다 제목 길이가
 * 5자에서 17자까지 세 배 넘게 차이 나는데 글꼴 크기가 고정이면 짧은 카드는
 * 휑하고 긴 카드는 잘린다. 그래서 크기를 정하지 않고 **역산한다** —
 * 가장 긴 줄이 카드 폭에 들어가는 크기를 계산해서 쓴다.
 *
 * 화면 미리보기와 내려받는 HTML이 같은 값을 쓰도록 여기 한 곳에만 둔다.
 */

/** 흰색은 편집 상태를 읽기 위한 중립 캔버스다. 생성되는 배경 자산이 아니다. */
export const CARD_INK = "#111214";
export const CARD_PAPER = "#ffffff";

/** 유형 구분은 배경이 아니라 강조색이 한다. 검정 위라 밝고 채도가 있어야 읽힌다. */
export const ACCENTS = {
  statement: "#c9b8ff",
  comparison: "#7fe3c0",
  steps: "#ffb38a",
  cycle: "#a8b6ff",
  checklist: "#9ee6a8",
  warning: "#ff9b8a",
  example: "#8fc7f0",
  quote: "#e8c99a",
  number: "#b9a8ff",
};

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** content 영역의 좌우 여백. DraftWorkspace의 inset 값과 같아야 한다. */
export const SIDE_PADDING = { cover: 84, body: 72 };

/**
 * 한글 한 글자의 가로폭 ÷ 글꼴 크기. letter-spacing -0.06em을 반영한 근사치다.
 * 정확한 값은 글꼴이 정하지만, 우리는 "넘치지 않을 크기"만 필요해서
 * 조금 넉넉하게 잡는 편이 안전하다.
 */
export const GLYPH_RATIO = 0.94;
const PT_PER_PX = 0.75;
/**
 * 계산한 크기를 그대로 쓰면 글자가 폭에 정확히 꽉 차서, 글꼴이 근사치와
 * 조금만 달라도 넘친다. 4%를 남겨 둔다.
 */
const SAFETY = 0.96;

export function plainCardText(value = "") {
  return value.replace(/\*\*/g, "").trim();
}

/**
 * 제목을 어절 경계에서 줄로 나눈다.
 *
 * 모델이 이미 넣어 준 줄바꿈은 의미 단위로 끊은 것이라 존중한다.
 * 다만 한 줄이 기준보다 길면 글자가 작아져 못 읽으므로 그때만 다시 나눈다.
 * 한국어는 어절 중간에서 끊으면 읽기 어려워 공백에서만 나눈다.
 */
export function wrapTitle(text, maxPerLine) {
  const given = plainCardText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (given.length && given.every((line) => line.length <= maxPerLine)) {
    return given;
  }

  const words = given.join(" ").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [plainCardText(text)];
}

/** 가장 긴 줄이 폭 안에 들어가는 글꼴 크기(pt)를 역산한다. */
export function fitTitleSize(lines, boxWidth, { min, max }) {
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const pt = ((boxWidth * SAFETY) / (longest * GLYPH_RATIO)) * PT_PER_PX;
  // 올림하면 그 한 칸 때문에 넘칠 수 있다. 항상 내린다.
  return Math.floor(Math.min(max, Math.max(min, pt)));
}

/** 본문은 길수록 작게. 구간을 더 잘게 나누면 카드끼리 들쭉날쭉해진다. */
export function fitBodySize(body) {
  if (body.length <= 35) return 46;
  if (body.length <= 46) return 42;
  return 38;
}

export function createCardEditor(card) {
  const cover = card.role === "cover";
  const visualizationMethod = card.visualization_method || "statement";
  const accent = ACCENTS[visualizationMethod] || ACCENTS.statement;

  const boxWidth = CARD_WIDTH - SIDE_PADDING[cover ? "cover" : "body"] * 2;
  // 표지는 한 줄을 더 짧게 끊어 글자를 크게 세운다.
  const lines = wrapTitle(card.headline_ko || "", cover ? 9 : 11);
  const titleSize = fitTitleSize(lines, boxWidth, {
    min: cover ? 56 : 48,
    max: cover ? 116 : 96,
  });
  const body = plainCardText(card.body_ko);
  const typography = card.typography_assignment || {
    title_zone: "top",
    title_align: "left",
    title_scale: cover ? "display" : "large",
    body_zone: "middle",
    body_max_lines: 5,
  };

  return {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    background: CARD_PAPER,
    textColor: CARD_INK,
    accentColor: accent,
    backgroundMode: "none",
    overlay: 0,
    titleSize,
    bodySize: cover ? 46 : fitBodySize(body),
    subtitleSize: 44,
    titleLines: lines.length,
    imagePosition: "bottom",
    imageSrc: card.source_image_src || "",
    imageFit: "cover",
    eyebrow: plainCardText(card.eyebrow_ko),
    headline: lines.join("\n"),
    body,
    signature: "네카라쿠배 디자이너, 피그마스터",
    visualizationMethod,
    typography,
    characterAssignment:
      card.character_assignment ||
      (!cover && [2, 4, 6].includes(card.position)
        ? {
            pose: poseForVisualization(visualizationMethod),
            position: "right",
            scale: "medium",
            reason_ko: "legacy draft preview fallback",
          }
        : null),
  };
}
import { poseForVisualization } from "./character/poseRegistry.js";
