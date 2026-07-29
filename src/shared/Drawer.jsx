import React, { useState } from "react";

import { ChevronRight } from "lucide-react";

/**
 * 평소에는 접혀 있다가 필요할 때 펴는 영역.
 *
 * 작업 단계가 아닌 참고 정보(사용량, 모델 로그, 레퍼런스 분석)를 담는다.
 * 이런 것들을 상단 메뉴로 올리면 화면이 네 개라는 구조가 흐려진다.
 * 닫혀 있는 동안에는 자식을 렌더하지 않으므로 안 여는 한 요청도 나가지 않는다.
 */
function Drawer({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="crawl-drawer">
      <button
        type="button"
        className="crawl-drawer-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <ChevronRight
          size={16}
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
        {label}
      </button>
      {open && <div className="crawl-drawer-body">{children}</div>}
    </section>
  );
}

export { Drawer };
