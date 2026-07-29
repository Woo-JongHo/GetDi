# Second Verification Pass

## 1. Verdict

**PASS**

The Node parsers satisfy the stated semantic contract on the complete local
fixture corpus. The two robots defects from the first pass are fixed, the new
minimum-delay policy behaves as specified, and the previously passing robots
cases did not regress.

No network requests were made during this pass.

## 2. Numbers

### Detail parser

All 148 raw article HTML fixtures had a paired Python JSON fixture and all 148
pairs were exercised.

| Contract assertion | Result | Detail |
| --- | ---: | --- |
| 1. Identical tag names and nesting | **148/148 pass** | Nested tag-tree signatures are identical. |
| 2. Identical decoded, CRLF-normalized visible text | **148/148 pass** | Both `content_html` fragments were parsed with entity decoding, then `\r\n` was normalized to `\n`. |
| 3. Identical normalized ordered `img src` sequence | **148/148 pass** | Both sequences were resolved through the same WHATWG URL normalizer with the same page URL. |
| 4. No disallowed tags | **148/148 pass** | No `script`, `style`, `svg`, `noscript`, `form`, or `button` element survives in Node `content_html`. |
| 5. Scalar fields and normalized summary | **148/148 pass** | `source_url`, `format`, `title`, `published_date`, `duration_minutes`, `authors`, `topics`, `image_url`, and `youtube_embed_url` match exactly; `summary` matches after CRLF normalization. |
| 6. Scope boundary | **148/148 applied** | `retrieved_at`, `assets`, and `asset_failures` were excluded and did not influence any result. This is a scope rule, not an output-equality assertion. |

Raw serialization still differs in 101 of 148 `content_html` strings and 2 of
148 `summary` strings. Those raw differences are accepted and disappear under
the contract's semantic comparisons.

For scope context, Python JSON contains `retrieved_at` in 148 files and
`assets`/`asset_failures` in 147 files. None was compared.

### Listing parser

Python and Node each returned exactly 30 items from the local listing fixture.
Missing keys were mapped to `null` only for comparison, so Python omission and
Node `null` were treated as the same value.

| Field | Result |
| --- | ---: |
| `format` | **30/30 pass** |
| `title` | **30/30 pass** |
| `url` | **30/30 pass** |
| `slug` | **30/30 pass** |
| `published_date` | **30/30 pass** |
| `summary` | **30/30 pass** |
| `thumbnail_url` | **30/30 pass** |

Python omits `thumbnail_url` on 26 items for which Node emits
`thumbnail_url: null`; all other compared values match.

### Robots parser

Every resolver check used an injected local response. The NN/g body is stored
in `crawler/fixtures/robots.txt`; no live fetch was performed.

| Case | `parseCrawlDelay()` | `resolveCrawlDelay()` | Result |
| --- | ---: | --- | ---: |
| Local NN/g robots fixture | 60 | 60, `robots` | **PASS** |
| No wildcard group | `null` | 60, `fallback` | **PASS** |
| Delay only under another group; wildcard has no delay | `null` | 60, `fallback` | **PASS** |
| Full-line/inline comments and whitespace | 45 | 45, `robots` | **PASS** |
| Empty delay value | `null` | 60, `fallback` | **PASS** |
| Nonnumeric delay value | `null` | 60, `fallback` | **PASS** |
| Wildcard delay 0 | 0 | 1, `robots` | **PASS** |
| Wildcard group after another group | 60 | 60, `robots` | **PASS** |
| Consecutive `User-agent: *` and `User-agent: ExampleBot` | 12 | 12, `robots` | **PASS** |

Robots result: **9/9 cases pass**. In particular, zero is now preserved as a
parsed fact while the policy layer raises the effective delay to
`MINIMUM_DELAY_SECONDS` (1 second), and consecutive agents now share their
group's delay.

### Test runner

Command:

```text
node --test crawler/*.test.mjs
```

Real final result:

| Metric | Count |
| --- | ---: |
| Tests | 22 |
| Passed | 22 |
| Failed | 0 |
| Cancelled | 0 |
| Skipped | 0 |
| Todo | 0 |

The 22 tests comprise 5 detail contract tests, 8 listing tests, and 9 robots
cases.

## 3. Findings

None. No defect against the stated contract was found in this pass.

The first-pass findings for zero delay and consecutive user-agent records are
resolved. The parser modules did not require reviewer changes.

## 4. Accepted differences

The accepted differences remain cosmetic or outside the parser boundary under
this contract:

- **Quote entities:** 86 files use different raw quote serialization in body
  text or retained attributes. Entity decoding yields identical text. Across
  all 148 files this changes neither tag names/nesting nor normalized image
  order.
- **CRLF normalization:** 20 files have raw body-HTML newline differences and
  2 have raw summary differences (with one file in both sets). After `\r\n` to
  `\n` normalization, visible text and summaries match. Tag structure and image
  order remain identical.
- **URL normalization:** 5 files serialize retained body links differently
  because WHATWG and Python URL normalization differ. This does not change tag
  structure or decoded text. After resolving both sides through the same
  normalizer, the ordered `img src` sequence is identical in all 148 files.
- **`thumbnail_url: null`:** Python omits this key for 26 of 30 listing items
  while Node emits `null`. Comparing values as required makes all 30 items
  equal for this field.
- **`assets` and `asset_failures`:** these are enrichment-stage fields, not
  `parseDetail()` output. Their presence in 147 Python JSON fixtures is a
  fixture-boundary difference and was excluded, along with generation-time
  `retrieved_at`.

Thus the entity, newline, and URL serialization differences never produce a
tag-structure mismatch, a decoded/normalized text mismatch, or an ordered
normalized-image mismatch anywhere in the 148-file corpus.

## 5. What I Did Not Verify

- I did not make live requests for robots.txt, listing pages, article pages, or
  assets. The pass was intentionally fixture-only.
- I did not verify video detail pages; the specified paired corpus contains 148
  article pages.
- I did not run asset enrichment or validate downloaded asset bytes, hashes,
  content types, local paths, or failure records. Those belong to `run.mjs` and
  the enrichment stage, outside the `parseDetail()` contract.
- I did not compare detail fields outside the stated contract, such as
  `schema_version`, `source`, or `usage`, nor retained HTML attributes other
  than normalized `img src` values.
- I did not compare listing duration, topic/collection metadata, or pagination
  metadata because the listing contract names only item count and the seven
  tested fields.
- I did not exercise full crawler scheduling, persistence, actual elapsed
  request spacing, HTTP failure behavior, or retry behavior. The robots checks
  verify parsing and delay resolution with injected local responses, not live
  orchestration.
