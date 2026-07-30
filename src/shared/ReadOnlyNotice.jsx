import React from "react";

import { Lock } from "lucide-react";

import { READ_ONLY } from "./api.js";

/**
 * 배포본이 읽기 전용임을 알리는 띠.
 *
 * 수집·번역·분석·초안 생성은 모델 CLI와 파일 쓰기가 필요해서 배포된 곳에서는
 * 돌지 않는다. 버튼만 회색으로 만들어 두면 왜 못 누르는지 알 수 없으므로
 * 이유와 대안(로컬 실행)을 같은 자리에서 말한다.
 *
 * 로컬에서는 아무것도 렌더하지 않는다 — 될 일에 안내를 붙이면 소음이 된다.
 */
function ReadOnlyNotice({ what }) {
  if (!READ_ONLY) return null;
  return (
    <p className="read-only-notice">
      <Lock size={14} />
      <span>
        {what}는 배포본에서 돌릴 수 없습니다. 이 화면은 로컬에서 만든 결과를
        읽기만 합니다 — 직접 돌려 보려면{" "}
        <a href="#/guide">설치 방법</a>을 보세요.
      </span>
    </p>
  );
}

export { ReadOnlyNotice };
