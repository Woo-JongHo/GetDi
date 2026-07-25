# GetDi

디자인 지식(현재 소스: Nielsen Norman Group)을 **읽고 탐색하는 뷰 페이지** 프로젝트.

수집(크롤링)은 `00_universe/GatherDesign`이 이미 해둔 것을 씨앗 데이터로 가져왔다.
GetDi는 그 데이터를 소비하는 쪽이다 — 수집기를 이 repo로 이관하지 않았다.

## 현재 상태

스캐폴딩만 있다. 설계 스파인(PRD/architecture/epics)은 `woo-plan`으로 작성 예정이며,
스택·라우팅·데이터 파이프라인은 그 결과가 정한다. 지금 확정된 것은 profile=web 하나다.

## 디렉터리

```text
18_GetDi/
└── data/
    ├── raw/         # 수집 원본 HTML (nngroup/ux-design-process, 14페이지)
    ├── processed/   # 정규화 JSON — 뷰가 읽을 소스. all-items.json + page-001..014.json
    ├── samples/     # 구조 검증용 기사 샘플 2건
    ├── private/     # 기사 상세 캐시 (gitignore — 로컬 전용)
    └── state/       # 증분 수집 상태 (gitignore)
```

## 데이터 계약

`data/processed/nngroup/ux-design-process/*.json`

- `schema_version: 1`
- `source` — 출처 이름/URL
- `topic` — name / slug / url
- `collection` — page, retrieved_at, item_count, next_page_url
- `items[]` — 기사 목록

씨앗 데이터 기준 시각: 2026-07-25 (retrieved_at).
재수집이 필요해지면 `GatherDesign/src/gatherdesign/nngroup.py`가 그 일을 한다.

## 출처

- 원본 프로젝트: `00_universe/GatherDesign`
- 데이터 출처: Nielsen Norman Group — https://www.nngroup.com/topic/ux-design-process/
