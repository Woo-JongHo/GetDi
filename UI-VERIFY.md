# GetDi UI verification — second pass

Commit reviewed: `715f0be`

## Verdicts

| # | Finding | Verdict | Proof |
|---|---|---|---|
| 1 | Draft card selection disappears at ≤900px | **PARTIALLY FIXED** | The rail is no longer in the hidden-selector group and is reset to `position: static` / `height: auto` at `src/styles.css:2981-2994`; its list scrolls locally and its buttons have 44px minimum height at `src/styles.css:2996-3012`. Those rendered buttons still call `setSelectedCard` at `src/features/draft/DraftWorkspace.jsx:246-263`. However, hiding `.mini-card` leaves the surviving label in the old 43px first grid column, and the inherited `width: 100%` fights the intended 132px chip width (`src/styles.css:1020-1025`, `src/styles.css:3008-3015`). Selection exists again, but the mobile selector is badly laid out. |
| 2 | Both draft previews stay 496.8px wide | **PARTIALLY FIXED** | Both renderers now use the hook (`src/features/draft/DraftWorkspace.jsx:681-682`, `src/features/draft/DraftWorkspace.jsx:732-736`) and the observer computes `available / width` (`src/features/draft/DraftWorkspace.jsx:31-40`). After the observer callback, the preview fits. It still initializes to `0.46` at `src/features/draft/DraftWorkspace.jsx:29`, and `useEffect` runs after first paint. In commit `715f0be`, `.html-card-fit` did not contain that first 496.8px frame (`src/styles.css@715f0be:4046-4050`). With no `ResizeObserver`, line 33 exits and leaves `0.46` permanently. |
| 3 | Draft has a 901–984px desktop-grid width cliff | **PARTIALLY FIXED** | The deterministic `185 + 500 + 300` minimum is gone: the center track is now `minmax(0, 1fr)` at `src/styles.css:2939-2941`. But the layout remains three columns through 901px and switches to block only at 900px (`src/styles.css:2975-2979`). At 901px the center track is only 416px; the stage's 5vw padding (`src/styles.css:1095-1098`) leaves about 326px. The no-wrap, non-shrinking status group (`src/styles.css:1118-1144`) shares that width with the title. The page-width minimum is fixed, but the same interval now crushes the center header and can overlap the 300px tune rail. |
| 4 | Mobile draft editing controls are too small | **PARTIALLY FIXED** | The textarea and apply button are now 14px/96px and 14px/46px at `src/styles.css:4111-4125`. Revision buttons are only 40px high and suggestion buttons only 38px at `src/styles.css:4105-4119`, still below the requested 44px target. This is a real improvement, not a complete fix. |
| 5 | Card-list filters vanish below 901px | **PARTIALLY FIXED** | The old `display: none` is gone, and the rendered month/status buttons remain wired to state at `src/features/cards/CardList.jsx:104-155`. The mobile rules add horizontal overflow at `src/styles.css:3018-3044`. But the conversion fails to reset the rail's sticky viewport height and the panel's column direction (`src/styles.css:557-570`). The filters exist, but the result is not the promised compact horizontal rail and it damages access to the list below. |
| 6 | Shared mobile navigation is too small and depends on hidden horizontal scrolling | **PARTIALLY FIXED** | Step links and Help now receive 40px minimum targets at `src/styles.css:4076-4088`. The brand action is still only the 31×31 mark on phones (`src/styles.css:84-94`, `src/styles.css:3800-3810`), and the four steps still live in a scrollbar-hidden horizontal scroller (`src/styles.css:3754-3766`). Not all header actions meet the target, and the hidden-scroll dependency remains. |
| 7 | Summary drawer has the wrong mobile offset and a small close target | **PARTIALLY FIXED** | `top: 60px` and the 44×44 close button are correct at `src/styles.css@715f0be:4057-4065`. The commit's only mobile height override is `calc(100dvh - 60px)` at `src/styles.css@715f0be:4059`. A browser that rejects `dvh` falls back to the desktop `calc(100vh - 68px)` at `src/styles.css:3941-3949`; paired with `top: 60px`, that leaves an 8px bottom gap. The commit's fallback is not acceptable. |
| 8 | Card-list toolbar exceeds the 360px content box | **FIXED** | At ≤720px the toolbar wraps, and search becomes a zero-minimum full-row flex item at `src/styles.css:4090-4098`. The 104px sort control (`src/styles.css:771-787`) moves to its own line instead of forcing the prior 314px no-wrap minimum into the 312px content box. |

## New problems

### High — The mobile filter rail retains desktop sticky/height behavior

`src/styles.css:557-570`, `src/styles.css:3018-3049`

At ≤900px, `.library-layout` becomes block, but `.filter-rail` remains
`position: sticky; top: 68px; height: calc(100vh - 68px)`. It therefore consumes
almost a full viewport before `.library-content` and can remain stuck over the
content while the page scrolls. `.filter-panel` also keeps
`flex-direction: column` and `height: 100%`; the mobile block never changes
either property. This is a broken sticky/height conversion, not a horizontal
rail.

The supposed chips also inherit `width: 100%` from
`src/styles.css:589-600`; `flex: 0 0 auto` at `src/styles.css:3040-3043` does not
turn them back into content-width chips. Nothing is deleted, but the filter
surface is oversized and the article list is pushed down/obscured.

### Medium — The draft horizontal rail keeps desktop button internals

`src/styles.css:1020-1025`, `src/styles.css:1072-1093`,
`src/styles.css:3008-3015`

The mobile rule hides the 43px thumbnail but does not replace the button's
`grid-template-columns: 43px minmax(0, 1fr)`. The remaining text becomes the
first grid item and is confined to that 43px track. The button also retains
`width: 100%`, so each “132px minimum” item can become a full-rail-width page.
All cards remain reachable through local horizontal scrolling, but their labels
are unnecessarily truncated and the strip is much longer than intended.

### Medium — `minmax(0, 1fr)` replaces overflow with a severe 901px scale cliff

`src/styles.css:2939-2941`, `src/styles.css:2975-2979`,
`src/styles.css:1095-1098`

At 901px the fixed rails take 485px, leaving a 416px center track and roughly
326px after stage padding. The preview therefore scales to about `0.302`
(`326 / 1080`). One pixel narrower, the layout becomes block and the preview can
return to the `0.46` cap. The center column does collapse too far. The
non-wrapping status UI at `src/styles.css:1118-1144` can also run into the
neighboring tune panel in this interval.

### Medium — The closed evidence drawer remains keyboard-focusable off-screen

`src/features/summary/SummaryView.jsx:353-379`,
`src/styles.css:3941-3957`

The drawer is always rendered and “closed” only with a transform. It has no
`hidden`, `inert`, or `aria-hidden`, so its close button and `EvidencePanel`
controls stay in the tab order while invisible. Opening it also has no focus
transfer, focus trap, Escape handling, or focus return. The new drawer fixed
space usage but introduced a keyboard-navigation regression.

### Medium — `useFitScale` is correct except for its initial/fallback value

`src/features/draft/DraftWorkspace.jsx:27-41`

- Dependency list: **correct** — it contains all changing scalar inputs
  (`height`, `maxScale`, `width`).
- Cleanup: **correct** — `observer.disconnect()` is returned.
- First paint: **not sane on narrow screens** — state starts at `0.46`, exactly
  the bad phone value. The observer repairs it only after paint.
- No-observer fallback: **not sane** — the hook returns early and keeps `0.46`.

## Added selectors matching nothing

- **`.revision-selector select`** —
  `src/styles.css:4105-4109`. `.revision-selector` renders only buttons at
  `src/features/draft/DraftWorkspace.jsx:572-599`; there is no descendant
  `select`. This selector has no effect.

No other selector introduced for these fixes is dead. In particular,
`.draft-card-rail`, `.filter-rail`, `.filter-panel`, `.filter-list`,
`.library-tools`, `.search-box`, `.revision-selector button`,
`.tune-box textarea`, `.tune-suggestions button`, `.revise-button`,
`.html-card-fit`, and the evidence-drawer selectors all have rendered matches.
The old `.analysis-set-rail` and `.article-analysis-source` selectors match no
current JSX, but commit `715f0be` did not introduce them, so they are not counted
as mistakes in this fix.

## Remaining risks

### 390px and 360px page-width check

| Workflow screen | Page-level horizontal scroll | What still scrolls locally |
|---|---|---|
| Crawl | **No deterministic page scroll found** | The shared step navigation can scroll horizontally (`src/styles.css:3754-3766`). |
| Card list | **No deterministic page scroll found** | The filter surface has `overflow-x: auto` (`src/styles.css:3023-3029`), but its vertical/sticky behavior is broken as described above. |
| Summary | **No deterministic page scroll found** | Tabs can scroll locally (`src/styles.css:3876-3889`); the drawer is at most `94vw` (`src/styles.css:3941-3949`). |
| Draft | **No steady-state page scroll found after `ResizeObserver` runs** | Card selection and preview overflow are local (`src/styles.css:2996-3002`, `src/styles.css:1153-1156`). Commit `715f0be` can show one bad 496.8px preview frame before observation. |

So the old 360px card-toolbar page overflow is gone, and no new deterministic
page-level horizontal scroll is visible from the CSS arithmetic at either
390px or 360px. This does **not** make the mobile result clean: the card-list
filter rail, draft selector internals, hidden header scrolling, and invisible
drawer focus remain.

### Commit versus current working tree

While this review was running, `src/styles.css` acquired uncommitted changes
outside this report. The current working tree adds `overflow: hidden` to
`.html-card-fit` at `src/styles.css:4049-4055` and a
`calc(100vh - 60px)` line before the `dvh` declaration at
`src/styles.css:4062-4068`. Those two uncommitted lines contain the bad first
preview frame and provide an acceptable CSS fallback for unsupported `dvh`.
They are improvements, but they are **not in commit `715f0be`** and therefore do
not earn that commit a FIXED verdict.

This was a source/CSS cascade review. No build or install was run. A live
`scrollWidth` pass could not be completed because the configured port was held
by an inaccessible existing process, so font-specific wrapping, mobile browser
chrome, and keyboard focus behavior still need a real-browser check.
