# GetDi UI review

## Verdict

1. **Does it respond? — ISSUES.** Every named column layout does eventually collapse; none keeps desktop columns all the way down. The draft breakpoint is nevertheless too late, and two collapsed layouts remove controls instead of relocating them.
2. **Was mobile considered? — FAIL.** Crawl, summary, and guide have useful mobile rules, but the draft loses card selection, its preview is wider than the phone, and several primary controls are substantially below mobile text/target guidance.
3. **Anything overlapping or hidden? — ISSUES.** The summary overlay stack is ordered correctly, but the draft and card-list breakpoints hide functional rails with no replacement; the drawer also uses the desktop header offset on phones.
4. **Anything overflowing its box? — FAIL.** The draft has a large, deterministic preview overflow at 390px and 360px and a body-width breakpoint cliff at 901–984px. The card-list toolbar also exceeds its 360px content box by 2px.

## Findings

All viewport observations below are static inferences from the JSX/CSS. The pixel amounts are CSS arithmetic, not browser measurements.

### 1. High — Draft card selection disappears at 900px and below

**`src/styles.css:2982`**, **`src/features/draft/DraftWorkspace.jsx:221`** — Draft screen at 390px, 360px, and 768px (in fact every width up to 900px).

The only controls that call `setSelectedCard` are the buttons in `.draft-card-rail` (`DraftWorkspace.jsx:221–238`). The responsive rule hides that entire rail at `max-width: 900px` (`styles.css:2982–2985`) and renders no replacement. The user is left on the initial first card and cannot inspect or edit any other card.

**Concrete fix:** keep card selection available as a horizontally scrollable thumbnail strip, select/dropdown, or drawer above `.draft-stage` before hiding the desktop rail. The mobile control must use the same `selectedCard` state and expose all revision cards.

### 2. High — Both draft preview implementations stay 496.8px wide on phones

**`src/features/draft/DraftWorkspace.jsx:656`**, **`src/features/draft/DraftWorkspace.jsx:705`**, **`src/styles.css:1153`** — Draft screen at 390px, 360px, and 1024px.

For the fixed 1080×1350 card, both `ModelHtmlCanvas` and `HtmlCardCanvas` cap scale at `0.46` (`DraftWorkspace.jsx:657`, `:709`), producing a 496.8×621px preview (`:689`, `:732–733`). At 390px, the mobile stage has about 350px of content width after its 20px side padding; at 360px it has about 320px (`styles.css:3093–3096`). The preview therefore exceeds the visible stage by about 147px and 177px respectively. `.html-result-wrap { overflow: auto; }` (`styles.css:1153–1156`) turns that mismatch into horizontal panning rather than fitting the card.

At 1024px, the three tracks are 185px + 539px + 300px, and the stage's 51.2px side padding leaves about 436px for the same 496.8px preview, so it still needs roughly 61px of horizontal panning.

**Concrete fix:** derive scale from the actual `.draft-preview-wrap` width, e.g. `min(0.46, availableWidth / 1080, availableHeight / 1350)`, updated with `ResizeObserver`. Apply the same calculation to both canvas components and keep overflow only as a fallback.

### 3. High — Draft returns to a desktop grid before its minimum tracks fit

**`src/styles.css:2936`**, **`src/styles.css:2976`** — Draft screen at 901–984px.

The reduced desktop grid still requires at least `185 + 500 + 300 = 985px` (`styles.css:2936–2938`), but it does not collapse to a block until 900px (`styles.css:2976–2980`). From 901px through 984px, `.draft-layout` is intrinsically wider than the viewport, so the whole page horizontally scrolls before any content width or gap is considered.

**Concrete fix:** move the draft collapse breakpoint to at least 985px, preferably high enough for the center preview and its padding (roughly 1110px), or change the side rails to overlay drawers and let the center track use `minmax(0, 1fr)`.

### 4. Medium — Mobile draft editing controls are 7–10px with roughly 20–35px targets

**`src/styles.css:1650`**, **`src/styles.css:1693`**, **`src/styles.css:1719`**, **`src/styles.css:1729`** — Draft screen at 390px and 360px.

When the right panel moves below the preview, it remains the primary editing UI, but the mobile rules do not enlarge it. Revision buttons use 8px text and 6px vertical padding (`styles.css:1650–1673`), the prompt textarea uses 10px (`:1693–1704`), suggestion buttons use 7px text with 5px padding (`:1719–1726`), and the apply button uses 9px text with 11px padding (`:1729–1743`). These are not just metadata: they are the controls used to choose a revision and submit changes.

**Concrete fix:** add a phone/tablet override for `.draft-tune-panel`: at least 12–14px control text, `min-height: 44px` on buttons/selects, and enough spacing to keep adjacent suggestion chips independently tappable.

### 5. Medium — Card-list filters vanish below 901px

**`src/styles.css:2955`**, **`src/features/cards/CardList.jsx:104`** — Card-list screen at 390px, 360px, and 768px.

The responsive layout correctly collapses `.library-layout`, but then hides `.filter-rail` (`styles.css:2955–2961`). That rail contains all month and content-status filters (`CardList.jsx:104–155`), and the mobile content has only search and sort. A phone or tablet user cannot reproduce the documented month/status filtering workflow.

**Concrete fix:** move the same filters into a mobile filter button and sheet/popover, or render scrollable filter chips above `.library-tools`; preserve active filter state and counts.

### 6. Medium — Shared mobile navigation is visibly small and depends on hidden horizontal scrolling

**`src/styles.css:3003`**, **`src/styles.css:3684`**, **`src/main.jsx:94`** — Every screen at 390px and 360px.

At phone widths the four step links use 10px text and 7px vertical padding (`styles.css:3013–3017`), yielding an approximately 32px-high target. The brand mark is 31×31px (`styles.css:84–94`), and the help link loses its text and uses 6px vertical padding around a 16px icon (`styles.css:3742–3748`, `main.jsx:113–119`). The center navigation is intentionally an overflow scroller with no visible scrollbar (`styles.css:3691–3703`); at 360px, not all four labels can be assumed visible at once.

**Concrete fix:** give every header action a minimum 40–44px hit box. At phone widths, use a compact step indicator/menu or a second navigation row instead of fitting four small labels into the center track.

### 7. Low — Summary drawer keeps the 68px desktop offset under a 60px mobile header

**`src/styles.css:3003`**, **`src/styles.css:3868`**, **`src/styles.css:3910`** — Summary screen at 390px and 360px with the evidence drawer open.

The phone header becomes 60px high (`styles.css:3003–3007`), while the fixed drawer still starts at 68px and uses `height: calc(100vh - 68px)` (`styles.css:3878–3887`). This leaves an 8px scrim-only strip between header and drawer. The drawer's close button is also only 30×30px (`styles.css:3910–3919`); because the drawer is `94vw`, the visible outside-scrim strip is only about 23px at 390px and 22px at 360px.

The stacking itself is correct: `.topbar` is z-index 30 (`styles.css:63–67`), the scrim is 39 (`:3868–3875`), and the drawer is 40 (`:3878–3881`). No modal with a competing z-index exists in the reviewed JSX.

**Concrete fix:** define one responsive header-height custom property and use it for the header, sticky offsets, drawer `top`, and drawer height; make the close button at least 44×44px. Prefer `100dvh` for the fixed drawer after testing mobile browser chrome.

### 8. Low — Card-list search and sort exceed the 360px content box by 2px

**`src/styles.css:717`**, **`src/styles.css:725`**, **`src/styles.css:771`**, **`src/styles.css:2963`** — Card-list screen at 360px only.

At 360px, `.library-content` has 24px padding on each side, leaving 312px (`styles.css:2963–2965`). The no-wrap tool row requires a 200px minimum search box, a 104px minimum select, and a 10px gap (`styles.css:717–730`, `:771–787`): 314px total. At 390px the 342px content width is sufficient.

**Concrete fix:** set `.search-box { min-width: 0; }` at the phone breakpoint, reduce the select minimum, or allow `.library-tools` to wrap.

## Screens by viewport

| Viewport | Crawl | Cards | Summary | Draft | Guide |
|---|---|---|---|---|---|
| **390px** | Holds; shared header targets are small | Degraded: filters missing | Mostly holds; drawer offset/close target issue | **Fails:** selector missing, 497px preview scrolls, controls tiny | Holds; tables and code scroll locally |
| **768px** | Holds | Degraded: filters missing; 2-column cards otherwise fit | Holds; analysis grid is one column | Degraded: selector missing; preview itself fits | Holds |
| **1024px** | Holds | Holds; 2-column cards | Holds; analysis grid is one column | Degraded: preview needs about 61px horizontal pan | Holds |
| **1440px** | Holds | Holds | Holds; 460px drawer overlays cleanly | Holds | Holds |

`.crawl-layout` has no column tracks to collapse. `.library-layout` collapses at 900px, `.summary-layout` is already block layout, and `.draft-layout` collapses at 900px. Thus none of the requested main layout classes keeps desktop columns all the way down. The guide is a single bounded document; its tables and code blocks have local horizontal overflow (`src/styles.css:3256`, `src/styles.css:3278`) and did not produce a static overflow finding.

## What I could not check

- No Playwright, Puppeteer, Chrome/Chromium, or Firefox executable/package was present, so I could not measure `scrollWidth`, bounding boxes, tap targets, or screenshots at the requested viewports.
- `http://localhost:5545/` was not reachable from this execution sandbox (`curl` received connection refused), so I could not exercise loaded, empty, translating, drawer-open, or revision-switching states through the running SPA. I did not start or interfere with any Node process.
- Consequently, font loading, iOS dynamic viewport/keyboard behavior, focus order for the off-canvas drawer, native select rendering, and animation-time overlap remain runtime-only checks. I found no unintended fixed-height-plus-`overflow: hidden` clipping in the reviewed screen chrome; the fixed 1080×1350 canvas clipping is intentional output framing.
