import React, { useEffect, useMemo, useState } from "react";

import { Check, ChevronDown, Clock3, Search, X } from "lucide-react";

import { apiFetch, READ_ONLY } from "../../shared/api.js";

import { formatDate } from "../../shared/format.js";

const YEAR = 2026;
const POLL_INTERVAL_MS = 3000;

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

/**
 * 화면 2 — 크롤링 카드 리스트.
 *
 * 1단계에서 받아 둔 기사를 훑는 곳이다. 본문까지 받은 기사만 다음
 * 단계로 갈 수 있으므로, 그 상태를 카드에 그대로 드러낸다.
 */
function CardList() {
  const [items, setItems] = useState([]);
  const [collection, setCollection] = useState(null);
  const [readySlugs, setReadySlugs] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [listing, details] = await Promise.all([
          apiFetch(`/api/crawl/items?year=${YEAR}`, { cache: "no-store" }),
          apiFetch("/api/details", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (listing.ok) {
          const payload = await listing.json();
          setItems(payload.items ?? []);
          setCollection(payload.collection ?? null);
        }
        if (details.ok) {
          const payload = await details.json();
          setReadySlugs(new Set(payload.items.map((item) => item.slug)));
        }
      } catch {
        // 개발 서버 재시작 중에는 마지막 목록을 유지한다.
      }
    };
    refresh();
    // 폴링의 목적은 "수집이 도는 동안 새 기사가 뜨는 것"이다. 배포본에서는
    // 수집이 돌 수 없으므로 목록도 변하지 않는다 — 한 번만 읽는다.
    if (READ_ONLY) {
      return () => {
        cancelled = true;
      };
    }
    const poll = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  const readyCount = useMemo(
    () => items.filter((item) => readySlugs.has(item.slug)).length,
    [items, readySlugs],
  );

  const months = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      const key = (item.published_date || "").slice(0, 7);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      // 한국어 제목으로도 영어 원제로도 찾을 수 있어야 한다.
      const matchesQuery =
        !normalized ||
        `${item.title_ko || ""} ${item.summary_ko || ""} ${item.title} ${item.summary}`
          .toLocaleLowerCase()
          .includes(normalized);
      const matchesMonth =
        month === "all" || (item.published_date || "").startsWith(month);
      const ready = readySlugs.has(item.slug);
      const matchesAvailability =
        availability === "all" ||
        (availability === "ready" && ready) ||
        (availability === "queued" && !ready);
      return matchesQuery && matchesMonth && matchesAvailability;
    });

    return filtered.sort((a, b) => {
      if (sort === "oldest") {
        return (a.published_date || "").localeCompare(b.published_date || "");
      }
      if (sort === "title") return a.title.localeCompare(b.title);
      return (b.published_date || "").localeCompare(a.published_date || "");
    });
  }, [availability, items, month, query, readySlugs, sort]);

  return (
    <main className="library-layout">
      <aside className="filter-rail">
        <div className="filter-panel">
          <div className="rail-title">
            <span>MONTH</span>
          </div>
          <div className="filter-list compact">
            <button
              type="button"
              className={month === "all" ? "selected" : ""}
              onClick={() => setMonth("all")}
            >
              <span>전체</span>
              <em>{items.length}</em>
            </button>
            {months.map(([key, count]) => (
              <button
                type="button"
                key={key}
                className={month === key ? "selected" : ""}
                onClick={() => setMonth(key)}
              >
                <span>{MONTH_LABELS[Number(key.slice(5, 7)) - 1]}</span>
                <em>{count}</em>
              </button>
            ))}
          </div>

          <div className="rail-title second">
            <span>CONTENT STATUS</span>
          </div>
          <div className="filter-list compact">
            {[
              { id: "all", label: "모든 상태", count: items.length },
              { id: "ready", label: "본문 준비됨", count: readyCount },
              {
                id: "queued",
                label: "수집 대기",
                count: items.length - readyCount,
              },
            ].map(({ id, label, count }) => (
              <button
                type="button"
                key={id}
                className={availability === id ? "selected" : ""}
                onClick={() => setAvailability(id)}
              >
                <span>{label}</span>
                <em>{count}</em>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="library-content">
        <div className="eyebrow">
          <span>STEP 02</span>
          <span className="eyebrow-rule" />
          <span>Nielsen Norman Group · {YEAR}</span>
        </div>

        <div className="library-intro">
          <div>
            <h1>카드 리스트</h1>
          </div>
          <div className="collection-stat">
            <span className="stat-value">{items.length}</span>
            <span className="stat-label">{YEAR}년 기사</span>
            <span className="stat-caption">
              본문 {readyCount}건 준비
              {collection?.retrieved_at
                ? ` · ${formatDate(collection.retrieved_at.slice(0, 10))} 수집`
                : ""}
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <Search size={24} />
            <strong>아직 받아 온 기사가 없습니다.</strong>
            <p>
              먼저 <a href="#/crawl">크롤링</a> 화면에서 수집을 시작하세요.
            </p>
          </div>
        ) : (
          <>
            <div className="library-tools">
              <label className="search-box">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="제목이나 요약으로 검색"
                  aria-label="기사 검색"
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
              <label className="sort-select">
                <span className="sr-only">정렬</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="newest">최신순</option>
                  <option value="oldest">오래된 순</option>
                  <option value="title">제목순</option>
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </label>
            </div>

            <div className="result-heading">
              <span>{visible.length}개의 결과</span>
              <span>본문 준비 {readyCount}건</span>
            </div>

            {visible.length ? (
              <div className="article-grid">
                {visible.map((item, index) => (
                  <ArticleCard
                    key={item.slug}
                    index={index}
                    item={item}
                    ready={readySlugs.has(item.slug)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={24} />
                <strong>조건에 맞는 기사가 없습니다.</strong>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function ArticleCard({ item, index, ready }) {
  return (
    <button
      type="button"
      className={`article-card ${ready ? "ready" : ""}`}
      style={{ "--card-delay": `${Math.min(index, 15) * 25}ms` }}
      disabled={!ready}
      onClick={() => {
        window.location.hash = `#/summary/${encodeURIComponent(item.slug)}`;
      }}
    >
      <div className="card-topline">
        <span className="format-badge article">ARTICLE</span>
        <span className={`readiness ${ready ? "is-ready" : ""}`}>
          {ready ? (
            <>
              <Check size={12} /> 본문 준비됨
            </>
          ) : (
            "수집 대기"
          )}
        </span>
      </div>

      <div className="card-index">{String(index + 1).padStart(3, "0")}</div>
      {/* 한국어가 있으면 그것이 제목이다. 원제는 아래에 작게 남겨
          무엇을 옮긴 것인지 확인할 수 있게 한다. */}
      <h2>{item.title_ko || item.title}</h2>
      {item.title_ko && <p className="card-original-title">{item.title}</p>}
      <p>
        {item.summary_ko || item.summary || "목록에 등록된 기사입니다."}
      </p>

      <div className="card-footer">
        <span>{formatDate(item.published_date)}</span>
        {item.duration_minutes ? (
          <span>
            <Clock3 size={13} /> {item.duration_minutes}분
          </span>
        ) : (
          <span>원문 정보</span>
        )}
      </div>
    </button>
  );
}

export { CardList };
