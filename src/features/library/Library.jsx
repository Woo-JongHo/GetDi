import React, { useEffect, useMemo, useState } from "react";

import { Check, ChevronDown, Clock3, FileText, Filter, Search, Video, X } from "lucide-react";

import { collection } from "../../shared/collection.js";

import { formatDate } from "../../shared/format.js";

const LIBRARY_START_DATE = "2025-01-01";
const FEATURED_ARTICLE_SLUGS = [
  "product-sense-definition",
  "design-system-maturity",
  "after-design-critique",
  "design-disposables",
];
// 발표 준비 기간에는 완성된 4개만 노출한다. 원본 collection 데이터는 유지한다.
const LIBRARY_ITEMS = collection.items.filter(
  (item) =>
    item.format === "article" &&
    (item.published_date || "") >= LIBRARY_START_DATE &&
    FEATURED_ARTICLE_SLUGS.includes(item.slug),
);

function Library() {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("article");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("newest");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [readySlugs, setReadySlugs] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/details", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setReadySlugs(
            new Set(payload.items.map((item) => `${item.format}:${item.slug}`)),
          );
        }
      } catch {
        // Keep the last known index while the local dev server reconnects.
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const readyCount = useMemo(
    () => LIBRARY_ITEMS.filter(
      (item) => readySlugs.has(`${item.format}:${item.slug}`),
    ).length,
    [readySlugs],
  );

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = LIBRARY_ITEMS.filter((item) => {
      const matchesQuery =
        !normalized ||
        `${item.title} ${item.summary}`
          .toLocaleLowerCase()
          .includes(normalized);
      const matchesFormat = format === "all" || item.format === format;
      const hasDetail = readySlugs.has(`${item.format}:${item.slug}`);
      const matchesAvailability =
        availability === "all" ||
        (availability === "ready" && hasDetail) ||
        (availability === "queued" && !hasDetail);
      return matchesQuery && matchesFormat && matchesAvailability;
    });

    return filtered.sort((a, b) => {
      const aFeatured = FEATURED_ARTICLE_SLUGS.indexOf(a.slug);
      const bFeatured = FEATURED_ARTICLE_SLUGS.indexOf(b.slug);
      if (aFeatured !== -1 || bFeatured !== -1) {
        if (aFeatured === -1) return 1;
        if (bFeatured === -1) return -1;
        return aFeatured - bFeatured;
      }
      if (sort === "oldest") {
        return (a.published_date || "").localeCompare(b.published_date || "");
      }
      if (sort === "title") return a.title.localeCompare(b.title);
      return (b.published_date || "").localeCompare(a.published_date || "");
    });
  }, [availability, format, query, readySlugs, sort]);

  const filterPanel = (
    <FilterPanel
      availability={availability}
      format={format}
      onAvailability={setAvailability}
      onFormat={setFormat}
      readyCount={readyCount}
    />
  );

  return (
    <main className="library-layout">
      <aside className="filter-rail">{filterPanel}</aside>

      {mobileFilters && (
        <div className="mobile-filter-sheet">
          <div className="sheet-heading">
            <strong>필터</strong>
            <button
              className="icon-button"
              type="button"
              onClick={() => setMobileFilters(false)}
              aria-label="필터 닫기"
            >
              <X size={19} />
            </button>
          </div>
          {filterPanel}
        </div>
      )}

      <section className="library-content">
        <div className="eyebrow">
          <span>COLLECTION 01</span>
          <span className="eyebrow-rule" />
          <span>{collection.topic.name}</span>
        </div>

        <div className="library-intro">
          <div>
            <h1>Library</h1>
          </div>
          <div className="collection-stat">
            <span className="stat-value">{LIBRARY_ITEMS.length}</span>
            <span className="stat-label">entries since 2025</span>
            <span className="stat-caption">
              상세 본문 {readyCount}건 준비 · 실시간 동기화
            </span>
          </div>
        </div>

        <div className="library-tools">
          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목이나 요약으로 검색"
              aria-label="아티클 검색"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
              >
                <X size={16} />
              </button>
            )}
          </label>
          <button
            type="button"
            className="mobile-filter-button"
            onClick={() => setMobileFilters(true)}
          >
            <Filter size={17} /> 필터
          </button>
          <label className="sort-select">
            <span className="sr-only">정렬</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">최신순</option>
              <option value="oldest">오래된 순</option>
              <option value="title">제목순</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>
        </div>

        <div className="result-heading">
          <span>{items.length}개의 결과</span>
          <span>본문 아티클 {LIBRARY_ITEMS.length}</span>
        </div>

        {items.length ? (
          <div className="article-grid">
            {items.map((item, index) => (
              <ArticleCard
                item={item}
                key={`${item.slug}-${item.format}`}
                index={index}
                ready={readySlugs.has(`${item.format}:${item.slug}`)}
                onSelect={() => {
                  window.location.hash =
                    `#/article/${item.format}/${encodeURIComponent(item.slug)}`;
                }}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={24} />
            <strong>조건에 맞는 자료가 없습니다.</strong>
          </div>
        )}
      </section>
    </main>
  );
}

function FilterPanel({
  availability,
  format,
  onAvailability,
  onFormat,
  readyCount,
}) {
  const formatOptions = [
    {
      id: "article",
      label: "본문 아티클",
      icon: FileText,
      count: LIBRARY_ITEMS.length,
    },
  ];

  const availabilityOptions = [
    { id: "all", label: "모든 상태", count: LIBRARY_ITEMS.length },
    {
      id: "ready",
      label: "본문 준비됨",
      count: readyCount,
    },
    {
      id: "queued",
      label: "수집 대기",
      count: LIBRARY_ITEMS.length - readyCount,
    },
  ];

  return (
    <div className="filter-panel">
      <div className="rail-title">
        <span>FORMAT</span>
      </div>
      <div className="filter-list">
        {formatOptions.map(({ id, label, icon: Icon, count }) => (
          <button
            type="button"
            className={format === id ? "selected" : ""}
            onClick={() => onFormat(id)}
            key={id}
          >
            <span><Icon size={16} />{label}</span>
            <em>{count}</em>
          </button>
        ))}
      </div>

      <div className="rail-title second">
        <span>CONTENT STATUS</span>
      </div>
      <div className="filter-list compact">
        {availabilityOptions.map(({ id, label, count }) => (
          <button
            type="button"
            className={availability === id ? "selected" : ""}
            onClick={() => onAvailability(id)}
            key={id}
          >
            <span>{label}</span>
            <em>{count}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function ArticleCard({ item, index, ready, onSelect }) {
  return (
    <button
      type="button"
      className={`article-card ${ready ? "ready" : ""}`}
      onClick={onSelect}
      style={{ "--card-delay": `${Math.min(index, 15) * 25}ms` }}
    >
      <div className="card-topline">
        <span className={`format-badge ${item.format}`}>
          {item.format === "article" ? <FileText size={13} /> : <Video size={13} />}
          {item.format === "article" ? "ARTICLE" : "VIDEO"}
        </span>
        <span className={`readiness ${ready ? "is-ready" : ""}`}>
          {ready ? <><Check size={12} /> 본문 준비됨</> : "수집 대기"}
        </span>
      </div>

      <div className="card-index">{String(index + 1).padStart(3, "0")}</div>
      <h2>{item.title}</h2>
      <p>{item.summary || "목록에 등록된 콘텐츠입니다."}</p>

      <div className="card-footer">
        <span>{formatDate(item.published_date)}</span>
        {item.duration_minutes ? (
          <span><Clock3 size={13} /> {item.duration_minutes}분</span>
        ) : (
          <span>원문 정보</span>
        )}
      </div>
    </button>
  );
}

export { ArticleCard, FilterPanel, Library };
