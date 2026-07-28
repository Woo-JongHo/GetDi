# GetDi

디자인 지식(현재 소스: Nielsen Norman Group)을 **읽고 탐색하는 뷰 페이지** 프로젝트.

수집(크롤링)은 `00_universe/GatherDesign`이 이미 해둔 것을 씨앗 데이터로 가져왔다.
GetDi는 그 데이터를 소비하는 쪽이다 — 수집기를 이 repo로 이관하지 않았다.

## 현재 상태

1차 View Page가 구현되어 있다.

- 수집된 262건(기사 147, 영상 115)을 검색·필터링해서 볼 수 있다.
- 상세 캐시가 있는 기사 2건은 원문 HTML의 문단, 본문 이미지, 캡션 순서를 유지해 표시한다.
- 상세 영상 샘플은 YouTube 플레이어와 메타데이터를 표시하고, 자막 부재 상태를 구분한다.
- 한국어 탭에서 Claude 번역을 실행하고 결과와 실제 모델 사용량을 로컬 캐시에 저장한다.
- 본문의 문단이나 이미지를 누르면 우측 `Why & Evidence`에서 원문 연결 상태를 볼 수 있다.
- `Analysis`에서 사용자 제공 인스타그램 6장을 카드별 관찰·해석·규칙·QA로 분석한다.
- Reader의 `이 아티클 분석하기`를 눌렀을 때만 핵심 메시지, 근거 인사이트,
  6장 카드 구성 후보와 이미지 사용 제안을 생성한다.
- `Usage`에서 현재 Codex 대화, 누적 input/cached/output/reasoning 토큰,
  최근 컨텍스트 점유율을 15초 간격으로 확인한다.
- Library 카드를 누르면 생성 확인 팝업이 열리고, 상세 본문이 있는 아티클만
  Reference Library 기반 6장 Draft로 생성할 수 있다.
- Draft Workspace에서 카드별 문구·원문 블록·디자인 규칙을 확인하고,
  자연어 수정 지시를 새 리비전으로 누적한다.

1080×1350 최종 이미지 렌더링, 게시, Hermes 자동화는 아직 포함하지 않았다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5545/`를 연다.

한국어 번역은 로컬 Claude Code 로그인이 필요하다. 최초 번역만 모델을 호출하며,
결과는 `data/private/translations/`에 저장된다. `data/private/`는 Git에 포함하지 않는다.

검증 명령:

```bash
npm run build
npm run smoke
npm run smoke -- --translate
```

## 디렉터리

```text
18_GetDi/
├── src/
│   ├── main.jsx                 # App·Header·해시 라우팅 배선
│   ├── features/
│   │   ├── analysis/            # 레퍼런스·인스타그램·아티클 분석 화면
│   │   ├── draft/               # Draft 편집·HTML 카드 화면
│   │   ├── evidence/            # Reader 근거 패널
│   │   ├── library/             # 목록·검색·필터 화면
│   │   ├── presentation/        # 발표 화면
│   │   ├── reader/              # 기사·영상 Reader 화면
│   │   └── usage/               # 세션 사용량·모델 로그 화면
│   ├── shared/                  # 둘 이상의 feature가 쓰는 데이터·포맷 유틸
│   ├── styles.css
│   └── research.css
├── server/                      # Vite dev 서버 API handler·도메인 모듈
└── data/
    ├── raw/                     # 수집 원본 HTML (nngroup/ux-design-process, 14페이지)
    ├── processed/               # 정규화 JSON — all-items.json + page-001..014.json
    ├── samples/                 # 구조 검증용 기사 샘플 2건
    ├── private/                 # 상세·번역·분석·Draft 캐시 (gitignore)
    └── state/                   # 증분 수집 상태 (gitignore)
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
