import React, { useEffect, useState } from "react";

import { createRoot } from "react-dom/client";

import { CircleHelp } from "lucide-react";

import { CardNewsResearch } from "./features/analysis/CardNewsResearch.jsx";

import { CardList } from "./features/cards/CardList.jsx";

import { CrawlWorkspace } from "./features/crawl/CrawlWorkspace.jsx";

import { DraftWorkspace } from "./features/draft/DraftWorkspace.jsx";

import { GuidePage } from "./features/guide/GuidePage.jsx";

import { SummaryView } from "./features/summary/SummaryView.jsx";

import { Drawer } from "./shared/Drawer.jsx";

import "./styles.css";

import "./research.css";

/**
 * 화면은 일하는 순서와 같은 4단계다.
 *
 *   1 크롤링   → 2 카드 리스트 → 3 요약본 → 4 인스타 초안
 *
 * 메뉴를 왼쪽에서 오른쪽으로 읽으면 데이터가 흐르는 순서를 읽은 것이 된다.
 * 도움말은 그 흐름의 일부가 아니므로 단계에 넣지 않고 오른쪽 끝에 둔다.
 */
const STEPS = [
  { id: "crawl", label: "크롤링", href: "#/", step: "01" },
  { id: "cards", label: "카드 리스트", href: "#/cards", step: "02" },
  { id: "summary", label: "요약본", href: "#/cards", step: "03" },
  { id: "draft", label: "인스타 초안", href: "#/cards", step: "04" },
];

function getRoute() {
  const hash = window.location.hash;

  if (hash === "#/cards") return { name: "cards" };
  if (hash === "#/guide") return { name: "guide" };

  const summaryMatch = hash.match(/^#\/summary\/(.+)$/);
  if (summaryMatch) {
    return { name: "summary", slug: decodeURIComponent(summaryMatch[1]) };
  }

  const draftMatch = hash.match(/^#\/draft\/(.+)$/);
  if (draftMatch) {
    return { name: "draft", slug: decodeURIComponent(draftMatch[1]) };
  }

  return { name: "crawl" };
}

function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="app-shell">
      <Header route={route} />
      {route.name === "cards" ? (
        <CardList />
      ) : route.name === "summary" ? (
        <SummaryView slug={route.slug} />
      ) : route.name === "draft" ? (
        <>
          <DraftWorkspace slug={route.slug} />
          {/* 카드 문구의 근거가 되는 레퍼런스 분석. 초안을 의심할 때 편다. */}
          <Drawer label="참고한 인스타 게시물 분석 보기">
            <CardNewsResearch />
          </Drawer>
        </>
      ) : route.name === "guide" ? (
        <GuidePage />
      ) : (
        <CrawlWorkspace />
      )}
    </div>
  );
}

function Header({ route }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="GetDi 홈">
        <span className="brand-mark">G</span>
        <span className="brand-name">GetDi</span>
      </a>

      <nav className="topnav steps" aria-label="작업 단계">
        {STEPS.map((item) => (
          <a
            className={route.name === item.id ? "active" : ""}
            href={item.href}
            key={item.id}
          >
            <span className="step-number">{item.step}</span>
            {item.label}
          </a>
        ))}
      </nav>

      <a
        className={`help-link ${route.name === "guide" ? "active" : ""}`}
        href="#/guide"
      >
        <CircleHelp size={16} /> 사용법
      </a>
    </header>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
