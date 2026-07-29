# 기사 요약 방법 — GetDi 정본

> **한 줄로**: 기사를 "주장 → 근거 갈래들 → 연결 논리 → 가치"로 접는다.
> 주장은 한 문장으로 강하게, 근거는 서로 다른 각도로 두세 갈래.
> 칸 하나라도 못 채우면 그 주장은 카드로 만들지 않는다.

이 문서는 요약의 **형식이 무엇이고 왜 그 형식인가**의 정본이다.
분석 프롬프트(`cardnews-generation-prompt.md`)와 화면(`SummaryView`)은
여기 정의된 칸을 채우고 보여줄 뿐, 칸 자체를 새로 만들지 않는다.

---

## 1. 왜 형식이 필요한가

요약이 "짧게 줄인 글"이면 무엇이 빠졌는지 알 수 없다.
칸을 정해 두면 **빈칸이 곧 결함**이 된다 — 근거를 못 찾았으면 근거 칸이
비고, 그 카드는 만들면 안 된다는 것이 자동으로 드러난다.

카드뉴스는 원문보다 짧다. 짧게 만드는 과정에서 가장 먼저 사라지는 것이
"왜 그렇게 말할 수 있는가"이고, 그것이 사라진 카드는 그럴듯하지만
검증할 수 없는 문장이 된다.

---

## 2. 채택한 구조 — CER + 가치

두 가지 표준을 비교해 골랐다.

| 모델 | 구성 | 성격 |
|---|---|---|
| Toulmin | Claim / Grounds / Warrant / Backing / Rebuttal / Qualifier | 정밀하지만 6칸. 카드 한 장에 담기지 않는다 |
| CER | Claim / Evidence / Reasoning | 3칸. Toulmin의 Warrant와 Backing을 Reasoning 하나로 합친 형태 |

**CER을 뼈대로 삼고 가치(So What) 한 칸을 더한다.**

CER은 Toulmin을 실무용으로 줄인 것이라 칸 수가 적고, 우리에게 필요한
"증거와 주장 사이의 연결"을 Reasoning 한 칸으로 명확히 요구한다.
여기에 가치 칸을 더하는 이유는 우리 독자가 학생이 아니라 **일하는
디자이너**이기 때문이다. 논증이 맞다는 것과 내가 왜 읽어야 하는가는
다른 질문이고, 카드뉴스는 후자에 답하지 못하면 넘겨진다.

Toulmin의 Rebuttal·Qualifier(반증·한계)는 카드마다 넣지 않고
문서 전체의 `caveats_ko`로 모은다. 카드 여덟 장마다 단서를 달면
읽는 리듬이 끊긴다.

---

## 3. 칸의 정의

| 칸 | 필드 | 무엇을 쓰나 | 무엇을 쓰면 안 되나 |
|---|---|---|---|
| 주장 | `claim_ko` | 원문이 말하는 바를 한 문장으로 **강하게** | 원문에 없는 일반화, 길게 늘인 설명 |
| 근거 갈래 | `grounds_ko[]` | 서로 다른 각도의 근거 2~4개(목표 3개) | 같은 말의 반복 |
| ↳ 설명 | `point_ko` | 그 갈래가 무엇을 말하는지 서술형 2~3문장 | 인용의 번역 |
| ↳ 인용 | `evidence_excerpt` | 그 갈래를 뒷받침하는 원문 문장 그대로 | 요약한 인용 |
| ↳ 위치 | `source_block_ids` | 인용이 원문 어디인지 | 빈 배열 |
| 부족 사유 | `grounds_shortfall_ko` | 갈래가 셋에 못 미칠 때 무엇이 없는지 | 채웠는데도 쓰는 변명 |
| 연결 | `reasoning_ko` | 갈래들이 왜 그 주장이 되는지 | 갈래의 재진술 |
| 가치 | `why_it_matters_ko` | 읽는 사람이 무엇을 다르게 하게 되는지 | "중요하다"는 말 자체 |

### 왜 근거를 갈래로 나누는가

근거를 한 덩어리로 쓰면 "무엇이 빠졌는지"가 안 보인다.
갈래로 나누면 정의만 있고 사례가 없다는 것, 원인은 있는데 반대 경우를
안 봤다는 것이 드러난다. 빈칸이 결함이 되게 하려면 칸을 나눠야 한다.

갈래는 서로 다른 **각도**여야 한다. 같은 말을 세 번 바꿔 쓰는 것은
세 갈래가 아니다. 쓸 만한 축의 예 — 원인 / 사례·데이터 / 반대 경우 /
조건과 한계 / 저자의 정의.

**셋을 억지로 만들지 않는다.** 원문이 둘만 주면 둘로 두고
`grounds_shortfall_ko`에 무엇이 없는지 적는다. 2026-07-29 실측으로
인사이트당 근거 블록이 중앙값 2개였고 3개 이상은 40%뿐이었다 — 강제하면
나머지에서 지어내게 된다.

### 연결(reasoning) 칸이 하는 일

가장 자주 비어 있고, 비면 가장 티가 안 나는 칸이다.

```
주장    인풋만으로는 부족하다
갈래 1  분해·비평·데이터 관찰은 좋은 입력이지만 원문은 이를 충분조건이 아니라고
        못박는다. 인풋의 가치를 부정한 것이 아니라 거기서 멈추는 것을 경계한다.
        인용 "gathering these inputs is not sufficient for developing product sense"
갈래 2  결과를 확인하지 않으면 무엇이 통했는지 알 수 없다 (다른 각도)
갈래 3  저자가 정의하는 제품 감각은 예측 능력이다 (또 다른 각도)
연결    세 갈래는 "관찰과 판단은 다르다"는 한 점으로 모인다.
        따라서 주장은 "인풋이 쓸모없다"가 아니라 "인풋에서 멈추면 안 된다"이다.
가치    관찰 중심 학습을 결과까지 확인하는 실험으로 바꿔야 한다.
```

연결 칸을 쓰다 보면 **주장이 원문보다 세다는 것**이 드러난다.
그때 고쳐야 하는 것은 연결이 아니라 주장이다.

## 4. 검사 규칙

카드로 넘기기 전에 아래를 통과해야 한다.

1. **증거 없는 주장은 버린다.** 갈래의 `source_block_ids`가 비면 그 갈래는
   근거가 아니다. 화면에서 근거 배지가 비어 보이는 것이 그 신호다.
2. **갈래가 같은 말이면 하나로 합친다.** 세 갈래가 모두 같은 문장을 가리키면
   그것은 한 갈래이고, 부족 사유에 그렇게 적는다.
3. **연결이 인용의 재진술이면 다시 쓴다.** 인용을 한국어로 옮겨 적은
   것은 연결이 아니다.
4. **주장이 원문보다 세면 주장을 낮춘다.** 원문이 "그럴 수 있다"고 하면
   주장도 "그럴 수 있다"여야 한다. 카드가 밋밋해지는 것이 사실을 부풀리는
   것보다 낫다.
5. **가치가 "중요하다"로 끝나면 비운다.** 무엇을 다르게 할지 못 쓰겠으면
   그 인사이트는 이 독자에게 아직 가치가 없는 것이다.

---

## 5. 화면과의 대응

요약본 화면(`src/features/summary/SummaryView.jsx`)은 이 칸들을 그대로
보여준다. 갈래마다 근거 배지(`SourceBadges`)가 `source_block_ids`를 렌더하며,
비어 있으면 그 자체가 검사 규칙 1번의 위반 신호다.
`grounds_shortfall_ko`가 차 있으면 화면에도 "원문이 주지 않은 것"으로 드러난다.

카드 초안은 주장과 가치만 싣는다. 갈래와 연결은 카드 뒤에 남아
"왜 이 문장을 썼는가"를 되짚을 때 쓰인다.

---

## 출처

- Toulmin 논증 모델의 6요소(Claim/Grounds/Warrant/Backing/Rebuttal/Qualifier)와
  Warrant가 증거와 주장을 잇는 역할이라는 정의:
  [Writing Arguments in STEM — Toulmin Argument Model](https://pressbooks.calstate.edu/writingargumentsinstem/chapter/toulmin-argument-model/),
  [SJSU Writing Center — Toulmin's Model of Argumentative Writing](https://www.sjsu.edu/writingcenter/docs/handouts/Toulmin%20Model%20of%20Argumentative%20Writing.pdf)
- CER이 Warrant·Backing을 Reasoning 한 칸으로 합친 실무형이라는 점, 그리고
  Reasoning이 "왜 그 데이터가 증거가 되는지를 잇는 정당화"라는 정의:
  [Edutopia — Using the CER Framework in the Classroom](https://www.edutopia.org/blog/science-inquiry-claim-evidence-reasoning-eric-brunsell),
  [UnboundEd — Claim, Evidence, Reasoning: A Simple Framework](https://unbounded.org/resources/claim-evidence-reasoning-cer-a-simple-framework-for-writing-across-subject-areas/)

## Change Log

- 2026-07-29 최초 작성 — CER을 뼈대로 채택하고 가치 칸을 추가. 기존 분석
  스키마에 없던 `reasoning_ko`를 신설 칸으로 정의
- 2026-07-29 근거를 단일 인용에서 `grounds_ko[]` 갈래 배열로 확장.
  갈래마다 서술형 설명과 원문 인용을 짝짓고, 셋에 못 미칠 때를 위한
  `grounds_shortfall_ko`를 두어 억지 채움 대신 결핍을 드러내게 했다
