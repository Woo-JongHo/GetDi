# GetDi

Nielsen Norman Group의 **2026년 기사를 직접 수집해서**, 읽고, 요약하고,
인스타그램 카드뉴스 초안까지 만드는 로컬 도구.

디자이너가 코드를 읽으며 공부할 대상이기도 하다. 그래서 화면 수와 디렉터리
깊이를 늘리는 결정은 그 학습 비용을 대가로 치른다 — 지금 화면은 넷뿐이다.

**개발을 모른다면 [`docs/designer-guide.md`](docs/designer-guide.md)부터 본다.**
Node 설치부터 순서대로 적어 두었다.

## 화면 넷 = 일하는 순서

| 단계 | 화면 | 하는 일 |
|---|---|---|
| 01 | 크롤링 | NN/g에서 2026년 기사를 받아온다. 진행·재개·실패를 여기서 본다 |
| 02 | 카드 리스트 | 받아온 기사를 훑고 검색·월별 필터로 후보를 고른다 |
| 03 | 요약본 | 핵심 요약 / 한국어 전문 / 원문을 한 화면에서 오간다 |
| 04 | 인스타 초안 | 카드 6장 초안을 만들고 말로 고쳐 버전을 쌓는다 |

메뉴를 왼쪽에서 오른쪽으로 읽으면 데이터가 흐르는 순서를 읽은 것이 된다.
사용량·모델 로그·레퍼런스 분석처럼 흐름이 아닌 정보는 별도 메뉴로 만들지 않고
해당 화면 안에 접어 두었다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5545/`를 연다.

수집은 화면에서 시작하거나 터미널에서 직접 돌릴 수 있다.

```bash
npm run crawl                  # 목록 + 본문 전부
node crawler/run.mjs --limit 2 # 2건만 (시험용)
node crawler/run.mjs --listing-only
```

한국어 번역과 분석은 로컬 Claude Code 로그인이 필요하다. 최초 1회만 모델을
호출하며 결과는 `data/private/`에 저장된다. 이 폴더는 Git에 포함하지 않는다.

검증:

```bash
npm run build
npm test      # 크롤러 파서 계약 테스트 22개
npm run smoke
```

## 수집 규칙 — 왜 오래 걸리는가

NN/g의 `robots.txt`는 `User-agent: *`에 **`Crawl-Delay: 60`**을 걸어 두었다.
요청 사이 60초를 쉬라는 뜻이다. 2026-07-28 실측으로 목록 11페이지에 기사
59건이었고, 목록과 상세를 합쳐 약 70회 요청 — 한 시간이 넘는 배치가 된다.

이 간격을 코드에 상수로 박지 않았다. `crawler/robots.mjs`가 매 실행마다
robots.txt를 읽어 값을 정하고, 읽지 못하면 60초로 물러선다. 상수로 박으면
NN/g가 값을 올렸을 때 우리 코드가 그것을 모른 채 규칙을 어기게 된다.

그래서 크롤링 화면의 절반은 "지금 무엇을 하고 있고 얼마나 남았는가"에 쓴다.
진행 상태는 `data/state/crawl-2026.json`에 남으므로, 중간에 멈춰도 다음
실행이 같은 자리에서 이어받는다.

## 디렉터리

```text
18_GetDi/
├── crawler/                 # NN/g 수집 정본
│   ├── robots.mjs           # Crawl-Delay 파싱, fail-safe 60초
│   ├── listing.mjs          # 목록 페이지 → 2026년 기사 항목
│   ├── detail.mjs           # 상세 메타데이터 + 본문 정제
│   ├── assets.mjs           # 본문 이미지 다운로드
│   ├── run.mjs              # 배치 실행기 — 진행 기록과 재개
│   └── *.test.mjs           # 파서 계약 테스트
├── src/
│   ├── main.jsx             # 4단계 라우팅
│   ├── features/
│   │   ├── crawl/           # 화면 1
│   │   ├── cards/           # 화면 2
│   │   ├── summary/         # 화면 3
│   │   ├── draft/           # 화면 4
│   │   ├── analysis/        # 레퍼런스 분석 (화면 4 안의 서랍)
│   │   ├── evidence/        # 근거 패널
│   │   ├── usage/           # 사용량·모델 로그 (화면 1 안의 서랍)
│   │   └── guide/           # 앱 안 사용법
│   └── shared/
├── server/                  # Vite dev 서버 API handler
├── docs/designer-guide.md   # 디자이너용 설치·사용 설명서
└── data/
    ├── processed/nngroup/2026/articles.json   # 수집한 기사 목록
    ├── private/             # 본문·번역·분석·초안·이미지 (gitignore)
    └── state/               # 수집 진행 상태 (gitignore)
```

## 데이터 계약

`data/processed/nngroup/2026/articles.json`

- `schema_version: 1`
- `selection` — year / format
- `collection` — retrieved_at, item_count, pages_fetched
- `items[]` — format, title, url, slug, published_date, summary, thumbnail_url

본문은 `data/private/details/articles/<slug>.json`에 저장한다. 문단과 이미지의
순서를 원문 그대로 두는 것이 목적이다 — 그 순서가 나중에 카드 문구의 근거를
원문 위치로 되짚는 좌표가 된다.

## 아직 안 되는 것

- 완성된 1080×1350 이미지 파일로 내보내기
- 인스타그램에 자동으로 올리기
- 여러 사람이 함께 쓰기 — 내 컴퓨터에서만 돈다

## 출처

- 데이터 출처: Nielsen Norman Group — https://www.nngroup.com/articles/
- 씨앗 데이터(2026-07 이전 262건)의 원 수집기: `00_universe/GatherDesign`
  — 현재 GetDi의 실행 의존이 아니다
