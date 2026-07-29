# GetDi UI verification — third pass

Commit reviewed: `803dd65`

## Executive result

The actual document-level overflow is in the **summary**, not the base page
grids. `.summary-analysis` is a grid, so each direct section keeps its
automatic content minimum; `.card-plan-track` then contributes one minimum
250px column per planned card. The inner `overflow-x: auto` does not help
until the outer `.card-plan-section` grid item is allowed to shrink
(`src/styles.css@803dd65:3748-3751`,
`src/styles.css@803dd65:2842-2850`,
`src/features/summary/SummaryView.jsx:489-505`).

A concrete cached plan has six cards, so its minimum is 1545px inside a
952px summary content box (`data/private/analyses/3-cs-microcopy.json:81-160`,
`src/styles.css@803dd65:3881-3885`). This widens the document at **1152px,
1280px, and 1440px**. The base draft, crawl, card-list, and summary wrapper
arithmetic is otherwise sound (`src/styles.css@803dd65:978-982`,
`src/styles.css@803dd65:3440-3444`,
`src/styles.css@803dd65:3876-3885`).

## Horizontal overflow findings, ordered by 1280px impact

### 1. Critical — the card-plan intrinsic width escapes to the page

The summary main is capped at 1040px and has 44px padding on each side, so its
content width is 952px at all three requested viewports
(`src/styles.css@803dd65:3881-3885`). The plan creates one column per card,
each at least 250px, with 9px gaps and column auto-flow
(`src/styles.css@803dd65:2842-2849`).
The analysis contract requires four to eight cards
(`server/analysis.mjs:266-275`).

Even the four-card minimum is `4 × 250 + 3 × 9 = 1027px`, 75px wider than the
952px box. The concrete cached example has six rendered cards
(`data/private/analyses/3-cs-microcopy.json:81-160`), whose minimum track width
is `6 × 250 + 5 × 9 = 1545px`, 593px wider than the box.

The missing containment is one level up: `.summary-analysis` is `display:
grid`, while `803dd65` gives neither its direct children nor
`.card-plan-section` `min-width: 0`
(`src/styles.css@803dd65:3748-3751`,
`src/features/summary/SummaryView.jsx:437-438`,
`src/features/summary/SummaryView.jsx:489-505`). The section's automatic
minimum therefore carries the track's intrinsic width into the summary grid;
the track becomes wide instead of becoming a 952px local scrollport
(`src/styles.css@803dd65:2842-2850`).

For the concrete six-card cache, the minimum right-edge overrun is about
493px at 1152, 429px at 1280, and 349px at 1440. Those numbers use the centered
1040px reader, its 44px inner padding, and the 1545px track
(`src/styles.css@803dd65:3881-3885`,
`data/private/analyses/3-cs-microcopy.json:81-160`). Eight-card plans are
2063px wide before content and overflow more severely
(`src/styles.css@803dd65:2842-2849`, `server/analysis.mjs:266-275`).

At 1152px the insight grid changes to one column, but no `803dd65` rule resets
the plan section's automatic minimum
(`src/styles.css@803dd65:2922-2949`).

### 2. High risk — the same automatic-minimum pattern exists elsewhere

`803dd65` uses `52px 1fr` in `.core-message-card`; plain `1fr` has an
automatic minimum, and the second grid child has no `min-width: 0`
(`src/styles.css@803dd65:2678-2685`,
`src/features/summary/SummaryView.jsx:437-451`). Insight articles likewise
have no explicit zero minimum in the reviewed commit
(`src/styles.css@803dd65:2774-2789`,
`src/features/summary/SummaryView.jsx:461-485`).

The cached six-card plan is the deterministic page-width cause. These text
grids are secondary content-dependent escape routes: a sufficiently long
unbreakable generated token can raise their automatic minimum because the
reviewed commit supplies no `overflow-wrap` on the rendered analysis text
(`src/styles.css@803dd65:2694-2722`,
`src/styles.css@803dd65:2798-2840`).

### 3. Medium risk — raw article tables have no containment rule

The original and translated article HTML is inserted directly into
`.source-article` (`src/features/summary/SummaryView.jsx:328-350`). Images are
explicitly constrained to `width: 100%`, but the corresponding source-article
rules end without a table wrapper, `max-width`, or `overflow-x` rule
(`src/styles.css:1847-1925`). Cached source articles do contain tables; for
example, `cognitive-mind-concept` contains a four-column table
(`data/private/details/articles/cognitive-mind-concept.json:22`).

I did not find a committed fixed width or no-wrap table that deterministically
exceeds the 952px article box. This is therefore not the demonstrated 1280px
cause, but it is the remaining content-dependent route by which future raw
HTML could create true page-level overflow (`src/features/summary/SummaryView.jsx:344-350`,
`src/styles.css:1847-1925`).

### 4. Not the cause — the closed evidence drawer

The drawer is fixed to the viewport's right edge, is 460px at all three target
widths, and is moved right by 102% when closed
(`src/styles.css@803dd65:3966-3978`). It is out of normal flow, so it does not add
460px to `.summary-layout` or its `.reader-main`; opening it removes the
transform and overlays the same viewport instead
(`src/styles.css@803dd65:3876-3885`, `src/styles.css@803dd65:3981-3983`).

The drawer is always mounted, but the closed state is now inert and hidden
from accessibility APIs (`src/features/summary/SummaryView.jsx:364-370`).
Those attributes fix interaction, not geometry; the relevant geometry remains
the fixed-position rule above (`src/styles.css@803dd65:3966-3978`).

### 5. Not the cause — crawl's embedded usage and model-log pages

`.crawl-layout` is a 1100px border box with 28px side padding, leaving a
1044px drawer-body content box at all three target widths
(`src/styles.css:18-20`, `src/styles.css@803dd65:3440-3444`,
`src/shared/Drawer.jsx:15-29`).

`.usage-page` is itself a border box capped with `width: min(100%, 1380px)`;
its four-card grid uses zero-minimum tracks, and its only explicit nested
minimum is the 240px session column (`src/styles.css:2270-2274`,
`src/styles.css:2314-2322`, `src/styles.css:2392-2397`). It therefore shrinks
inside the 1044px host rather than widening it.

`.model-log-page` spends 84px on side padding, leaving 960px. Its main grid
uses `310px + 16px + minmax(0, 1fr)`, leaving 634px for the detail pane, which
also has `min-width: 0` (`src/styles.css:137-140`,
`src/styles.css:195-200`, `src/styles.css:265-267`). The audience view uses
zero-minimum flexible outer tracks around its fixed 130px center
(`src/styles.css:392-397`). Raw model input/output can overflow, but each
`pre` owns an `overflow: auto` scroller and wraps/breaks text
(`src/styles.css:319-347`, `src/features/usage/ModelLogs.jsx:273-300`).

### 6. Not the cause — draft grid, preview, and fixed-size card artwork

The actual draft widths are:

| Viewport | Grid rule | Center track | Stage content after side padding | Max 1080px preview | Result |
|---:|---|---:|---:|---:|---|
| 1152 | `185px + 1fr + 300px` | 667px | 551.8px | 496.8px | 55px spare |
| 1280 | `220px + minmax(540px,1fr) + 340px` | 720px | 590px | 496.8px | 93.2px spare |
| 1440 | same base rule | 880px | 750px | 496.8px | 253.2px spare |

The grid definitions are at `src/styles.css:978-982` and
`src/styles.css@803dd65:2922-2941`; the stage padding is at
`src/styles.css:1095-1098`. The hook caps the preview at 0.46 and also scales
it to its measured holder width (`src/features/draft/DraftWorkspace.jsx:27-50`),
while `.html-card-fit` clips any transient paint outside that holder
(`src/styles.css@803dd65:4070-4080`).

The 520px/390px/250px decorative widths are inside the absolutely positioned
1080px card canvas, whose own overflow is hidden; they do not participate in
the page's intrinsic width (`src/styles.css:1179-1195`,
`src/styles.css:1206-1225`, `src/styles.css:1312-1347`).

At the exact remaining desktop edge, 1121px gives a 636px center track and
523.9px after its 5vw side padding, still 27.1px wider than the capped 496.8px
preview (`src/styles.css@803dd65:2922-2941`, `src/styles.css:1095-1098`). At 1120px
the entire draft switches to block layout (`src/styles.css@803dd65:2952-2958`).

### Other named suspects

- `.insight-analysis-grid` is two zero-minimum columns at 1280px and 1440px,
  and one column at 1152px. Its **tracks** are zero-minimum, although
  `803dd65` still omits `min-width: 0` on the article grid items
  (`src/styles.css@803dd65:2774-2789`,
  `src/styles.css@803dd65:2922-2949`).
- The token chart's SVG has a 900-unit `viewBox`, not a 900px CSS width; the
  CSS width is 100% (`src/features/usage/UsageDashboard.jsx:217-270`,
  `src/styles.css:2512-2518`).
- The crawl log and model raw panels own their horizontal overflow instead of
  exporting it to the page (`src/styles.css:338-347`,
  `src/styles.css@803dd65:3681-3692`).
- No `100vw`/`100dvw` sizing rule is present in the two application
  stylesheets; the viewport-relative width use relevant here is clamped
  padding, not element width (`src/styles.css:1095-1098`,
  `src/research.css:20-24`).

## Second-pass regression re-verification

| # | Second-pass problem | Verdict | Proving line |
|---|---|---|---|
| 1 | Filter rail kept sticky/height/column | **FIXED** | The mobile rule now resets `position: static`, `height: auto`, and the border at `src/styles.css@803dd65:3035-3041`; `.filter-panel` resets `height` and becomes a row at `src/styles.css@803dd65:3043-3050`; buttons reset `width: auto` at `src/styles.css@803dd65:3062-3068`. |
| 2 | Draft chips kept the 43px grid track | **FIXED** | At the new breakpoint the button becomes `display: block`, `width: auto`, and a bounded 132–210px flex item at `src/styles.css@803dd65:2980-2988`; hiding `.mini-card` therefore leaves no grid track at `src/styles.css@803dd65:2990-2994`. |
| 3 | `minmax(0, 1fr)` scale cliff | **FIXED** | The draft becomes block at `max-width: 1120px` at `src/styles.css@803dd65:2952-2958`; at 1121px the remaining center content is still wider than the capped preview by the grid/padding math at `src/styles.css@803dd65:2922-2941` and `src/styles.css:1095-1098`. |
| 4 | Closed drawer remained focusable | **FIXED** | Closed state receives `inert` and `aria-hidden` at `src/features/summary/SummaryView.jsx:364-370`; Escape closes an open drawer and the listener is cleaned up at `src/features/summary/SummaryView.jsx:48-57`. |
| 5 | `useFitScale` initial/fallback value | **FIXED** | The hook uses `useLayoutEffect`, synchronously measures `getBoundingClientRect().width`, then treats `ResizeObserver` as optional at `src/features/draft/DraftWorkspace.jsx:27-49`. The state still starts at `maxScale` on line 29, but the layout effect corrects it before paint and the explicit measurement is the no-observer fallback. |

All five new second-pass problems are fixed in `803dd65`.

## Selector audit

`.revision-selector select` is gone. The only current mobile revision target is
`.revision-selector button` (`src/styles.css@803dd65:4131-4139`), matching the buttons
rendered at `src/features/draft/DraftWorkspace.jsx:581-606`.

No other selector added by `803dd65` is dead:

- Draft breakpoint selectors match `.draft-layout`, `.draft-card-rail`,
  `.draft-card-list`, its buttons, and `.mini-card`
  (`src/features/draft/DraftWorkspace.jsx:246-274`).
- Filter reset selectors match `.filter-rail`, `.filter-panel`, both
  `.filter-list` groups, their buttons, and `.rail-title.second`
  (`src/features/cards/CardList.jsx:103-155`).
- Drawer selectors match the always-rendered evidence drawer and its head
  button (`src/features/summary/SummaryView.jsx:364-379`).
- The mobile `.brand`, `.library-tools`, `.search-box`,
  `.revision-selector button`, `.tune-box textarea`,
  `.tune-suggestions button`, and `.revise-button` targets all have rendered
  counterparts (`src/main.jsx:94-99`, `src/features/cards/CardList.jsx:191-221`,
  `src/features/draft/DraftWorkspace.jsx:581-648`).

## Commit versus current working tree

During this audit, `src/styles.css` acquired uncommitted changes outside this
report. I did not make or revert them. They change `.core-message-card` to
`52px minmax(0, 1fr)` and add `min-width: 0` to the summary/grid children plus
`overflow-wrap: anywhere` to analysis text
(`src/styles.css:2678-2687`, `src/styles.css:4160-4182`).

The new `.summary-analysis > * { min-width: 0; }` is the rule that turns the
oversized card plan back into the intended local scroller
(`src/styles.css:4160-4169`, `src/styles.css:2844-2852`). Those lines address
the root cause described above, but they are **not part of commit `803dd65`**
(`src/styles.css@803dd65:3748-3751`,
`src/styles.css@803dd65:2842-2850`).

## Viewport conclusion

| Viewport | `803dd65` document overflow | Primary element |
|---:|---|---|
| 1152×720 | **YES** — about 493px for the concrete six-card cache (`src/styles.css@803dd65:3881-3885`, `data/private/analyses/3-cs-microcopy.json:81-160`) | `.summary-analysis` → `.card-plan-section` → `.card-plan-track` (`src/features/summary/SummaryView.jsx:437-505`) |
| 1280×800 | **YES** — about 429px for the same six-card cache (`src/styles.css@803dd65:3881-3885`, `data/private/analyses/3-cs-microcopy.json:81-160`) | Same automatic-minimum chain (`src/styles.css@803dd65:3748-3751`, `src/styles.css@803dd65:2842-2850`) |
| 1440×900 | **YES** — about 349px for the same six-card cache (`src/styles.css@803dd65:3881-3885`, `data/private/analyses/3-cs-microcopy.json:81-160`) | Same automatic-minimum chain (`src/styles.css@803dd65:3748-3751`, `src/styles.css@803dd65:2842-2850`) |

This was a source, DOM, cached-content, and CSS-cascade audit. No build or
install was run. The managed environment rejected both local socket binding
and browser-engine startup, so these are deterministic width/containment
results rather than recorded `document.scrollWidth` telemetry. The intrinsic
width chain above is deterministic for the concrete six-card cache; a browser
pass remains useful for exact scrollbar rounding and for confirming the
uncommitted containment rules (`src/styles.css:2844-2852`,
`src/styles.css:4160-4182`).
