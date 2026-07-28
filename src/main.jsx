import React, { useEffect, useState } from "react";

import { createRoot } from "react-dom/client";

import { LayoutGrid, Menu } from "lucide-react";

import { ArticleAnalysis } from "./features/analysis/ArticleAnalysis.jsx";

import { CardNewsResearch } from "./features/analysis/CardNewsResearch.jsx";

import { InstagramAnalysis } from "./features/analysis/InstagramAnalysis.jsx";

import { DraftWorkspace } from "./features/draft/DraftWorkspace.jsx";

import { GuidePage } from "./features/guide/GuidePage.jsx";

import { Library } from "./features/library/Library.jsx";

import { Presentation } from "./features/presentation/Presentation.jsx";

import { Reader } from "./features/reader/Reader.jsx";

import { ModelLogs } from "./features/usage/ModelLogs.jsx";

import { UsageDashboard } from "./features/usage/UsageDashboard.jsx";

import "./styles.css";

import "./research.css";

function getRoute() {
  if (window.location.hash === "#/logs") {
    return { name: "logs" };
  }
  if (window.location.hash === "#/presentation") {
    return { name: "presentation" };
  }
  if (window.location.hash === "#/guide") {
    return { name: "guide" };
  }
  if (window.location.hash === "#/usage") {
    return { name: "usage" };
  }
  if (
    window.location.hash === "#/analysis" ||
    window.location.hash === "#/analysis/research"
  ) {
    return { name: "cardnews-research" };
  }
  const draftMatch = window.location.hash.match(/^#\/draft\/(.+)$/);
  if (draftMatch) {
    return { name: "draft", slug: decodeURIComponent(draftMatch[1]) };
  }
  const articleAnalysisMatch = window.location.hash.match(
    /^#\/analysis\/article\/(.+)$/,
  );
  if (articleAnalysisMatch) {
    return {
      name: "article-analysis",
      slug: decodeURIComponent(articleAnalysisMatch[1]),
    };
  }
  if (window.location.hash === "#/analysis/instagram") {
    return { name: "cardnews-research" };
  }
  const formattedArticleMatch = window.location.hash.match(
    /^#\/article\/(article|video)\/(.+)$/,
  );
  if (formattedArticleMatch) {
    return {
      name: "article",
      format: formattedArticleMatch[1],
      slug: decodeURIComponent(formattedArticleMatch[2]),
    };
  }
  const match = window.location.hash.match(/^#\/article\/(.+)$/);
  return match
    ? { name: "article", slug: decodeURIComponent(match[1]) }
    : { name: "library" };
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
      {route.name === "article" ? (
        <Reader slug={route.slug} formatHint={route.format} />
      ) : route.name === "logs" ? (
        <ModelLogs />
      ) : route.name === "presentation" ? (
        <Presentation />
      ) : route.name === "guide" ? (
        <GuidePage />
      ) : route.name === "draft" ? (
        <DraftWorkspace slug={route.slug} />
      ) : route.name === "usage" ? (
        <UsageDashboard />
      ) : route.name === "article-analysis" ? (
        <ArticleAnalysis slug={route.slug} />
      ) : route.name === "cardnews-research" ? (
        <CardNewsResearch />
      ) : (
        <Library />
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

      <nav className="topnav" aria-label="주요 메뉴">
        <a
          className={route.name === "library" ? "active" : ""}
          href="#/"
        >
          Library
        </a>
        <a
          className={
            route.name === "cardnews-research" ||
            route.name === "article-analysis"
              ? "active"
              : ""
          }
          href="#/analysis/research"
        >
          Analysis
        </a>
        <a className={route.name === "usage" ? "active" : ""} href="#/usage">
          Usage
        </a>
        <a className={route.name === "logs" ? "active" : ""} href="#/logs">
          Log
        </a>
        <a
          className={route.name === "presentation" ? "active" : ""}
          href="#/presentation"
        >
          Present
        </a>
        <a className={route.name === "guide" ? "active" : ""} href="#/guide">
          Guide
        </a>
      </nav>
    </header>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
