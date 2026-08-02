---
name: article-refinement
description: Refine a source article into concise Korean cardnews-ready copy while preserving source-revision lineage, semantic block evidence, body-image provenance, and unsupported-claim warnings. Use when selecting claims from an article, translating or rewriting them for Instagram cards, planning a carousel sequence, mapping article-body images to cards, revising an existing refinement, or auditing a draft for fidelity and evidence.
---

# Article Refinement

Transform an immutable article revision into a reviewable card plan. Preserve meaning before improving tone.

## Inputs

Require:

- exact `source_revision_id`
- ordered semantic blocks with stable block IDs
- article title, author, date, and canonical URL
- body-image occurrences with asset IDs, positions, captions, credits, and rights status

Accept when available:

- `skill_revision_id`
- Design Profile revision
- user instruction
- previous refinement revision

Stop and report missing input when the source revision or block identity is unavailable. Do not silently use a newer article version.

## Workflow

1. **Read the source structure**
   - Preserve heading, paragraph, list, quote, table, figure, and video order.
   - Separate the article thesis, supporting claims, examples, cautions, and conclusion.

2. **Build a claim ledger**
   - Write each candidate claim in neutral Korean.
   - Link direct claims to exact source block IDs.
   - Mark synthesis as `inference`, explicit user direction as `user-instruction`, and ungrounded copy as `unsupported`.
   - Never invent numbers, quotations, people, findings, or causal relationships.

3. **Select the narrative**
   - Prefer one thesis and three to five supporting claims.
   - Give one primary claim to each card.
   - Arrange cards as promise → context → insights → implication/source.
   - Treat this sequence as a GetDi working default, not a universal research fact.

4. **Refine the copy**
   - Use a meaningful title, one core sentence, and only necessary supporting text.
   - Keep the author’s certainty level. Do not turn “may” into “will”.
   - Translate for natural Korean meaning; do not mirror English syntax.
   - Remove promotional filler, repetition, and decorative jargon.

5. **Apply the GetDi layout contract**
   - Cover: place a 50pt subtitle above a 100pt title; limit the title to two or three lines.
   - Cover: use a relevant image as the background and place a black gradient over it for text legibility.
   - Body: always show `네카라쿠배 디자이너, 피그마스터` at the top.
   - Body: use an 80pt title limited to one or two lines and 45pt body text.
   - Body: place the relevant article-body image in the middle or bottom area.
   - Treat point sizes as renderer intent. Validate actual fitting and contrast after rendering.

6. **Map media**
   - Use article-body assets, not listing thumbnails.
   - Select an image only when it explains the card claim.
   - Preserve asset ID, source block ID, caption, credit, and rights status.
   - Never mark an asset `export-approved` without supplied evidence.

7. **Run quality gates**
   - Confirm every factual card claim has direct evidence or an explicit non-grounded label.
   - Confirm each card has one primary message.
   - Confirm image and text refer to the same concept.
   - Block export when any used asset is `unknown` or `blocked`, or a primary claim is `unsupported`.
   - Keep 1080×1350 and 1.2MB as renderer checks, not text-generation claims.

8. **Return a revision**
   - Follow [references/output-contract.md](references/output-contract.md).
   - State what was removed, merged, inferred, or left unresolved.
   - Preserve the previous result and create a new revision for every accepted change.

## Research Boundary

Read [references/cardnews-foundations.md](references/cardnews-foundations.md) when choosing card structure, copy density, image placement, or legibility rules. Keep source-backed principles separate from GetDi defaults and Instagram-reference observations.

## Prompt Inventory

Audited 2026-08-02. `references/` holds runtime prompts, agent-facing docs,
and one archived HTML-production prompt. Only the first two are read by
product code.

| file | role | loaded by |
|---|---|---|
| `cardnews-generation-prompt.md` | analysis and card planning | `runArticleAnalysis` |
| `cardnews-production-prompt.md` | final card copy | `generateDraft`, `reviseDraft` |
| `html-card-production-prompt.md` | archived HTML card rendering reference | not loaded by product code |
| `summary-method.md` | analysis field definitions and checks | analysis schema, summary UI |
| `output-contract.md` | JSON artifact shape for this skill | this SKILL.md only |
| `cardnews-foundations.md` | research boundary notes | this SKILL.md only |

Two contracts are in play and they must not be confused.
Runtime prompts hand the output structure to the caller's JSON Schema —
they must not restate an output format of their own.
`output-contract.md` governs saved artifacts validated by
`scripts/validate_refinement.py`, not the runtime model calls.

Removed 2026-07-27: `cardnews-analysis-prompt.md` had zero references from
code or docs and duplicated `cardnews-generation-prompt.md`.

## Validation

Validate a saved JSON artifact:

```bash
python3 scripts/validate_refinement.py path/to/refinement.json
```

Do not call a result export-ready when validation fails.
