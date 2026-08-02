const CARD_ROLE_LABELS = {
  cover: "표지",
  context: "맥락",
  insight: "핵심 내용",
  warning: "주의",
  action: "실행",
  close: "마무리",
};

const ASSIGNMENT_LABELS = {
  top: "위쪽",
  middle: "가운데",
  bottom: "아래쪽",
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
  display: "매우 크게",
  large: "크게",
  medium: "보통",
  small: "작게",
  thinking: "생각하기",
  pointing: "가리키기",
  comparing: "비교하기",
  checking: "확인하기",
  warning: "주의하기",
  celebrating: "축하하기",
  confused: "고민하기",
  reading: "읽기",
};

function koreanLabel(value, labels) {
  return labels[value] || value || "정보 없음";
}

export { ASSIGNMENT_LABELS, CARD_ROLE_LABELS, koreanLabel };
